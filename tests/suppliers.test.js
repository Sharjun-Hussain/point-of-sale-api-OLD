const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Supplier Management Module Tests', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranch;
    let testSupplier;

    beforeEach(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.Organization.destroy({ where: {} });
        await db.Branch.destroy({ where: {} });
        await db.Supplier.destroy({ where: {} });
        await db.GRN.destroy({ where: {} });
        await db.GRNItem.destroy({ where: {} });
        await db.Product.destroy({ where: {} });
        await db.Account.destroy({ where: {} });
        await db.Transaction.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Seed Organization & Branch
        testOrg = await db.Organization.create({
            name: 'Supplier Test Org',
            status: 'active'
        });

        testBranch = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'Supplier Test Branch',
            branch_code: 'STB001',
            status: 'active'
        });

        // Seed Admin user
        const adminRole = await db.Role.create({
            name: 'Super Admin',
            is_system_role: true
        });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            name: 'Supplier Admin',
            username: 'supadmin',
            email: 'supadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/login')
            .send({
                email: 'supadmin@example.com',
                password: 'password123'
            });

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        // Seed a supplier
        testSupplier = await db.Supplier.create({
            organization_id: testOrg.id,
            name: 'Primary Supplier',
            email: 'primary@supplier.com',
            phone: '0112233445',
            status: 'active'
        });
    });

    describe('Supplier CRUD', () => {
        it('should create a new supplier', async () => {
            const response = await request(app)
                .post('/api/v1/suppliers')
                .set('Authorization', authHeader)
                .send({
                    name: 'New Supplier',
                    email: 'new@supplier.com',
                    phone: '0771234567',
                    address: '123 Supplier Lane'
                });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('name', 'New Supplier');
        });

        it('should fetch all suppliers', async () => {
            const response = await request(app)
                .get('/api/v1/suppliers')
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(Array.isArray(response.body.data.data)).toBe(true);
            expect(response.body.data.data.length).toBeGreaterThan(0);
        });

        it('should fetch a single supplier by ID', async () => {
            const response = await request(app)
                .get(`/api/v1/suppliers/${testSupplier.id}`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('name', 'Primary Supplier');
        });
    });

    describe('GRN Flow', () => {
        let testProduct;

        beforeEach(async () => {
            // Seed a product for GRN
            testProduct = await db.Product.create({
                organization_id: testOrg.id,
                name: 'GRN Product',
                code: 'GRN-P001',
                sku: 'GRN-SKU-001'
            });
        });

        it('should create a GRN and update stock', async () => {
            const grnData = {
                supplier_id: testSupplier.id,
                branch_id: testBranch.id,
                grn_number: 'GRN-TEST-001',
                received_date: new Date(),
                items: [
                    {
                        product_id: testProduct.id,
                        quantity_received: 100,
                        unit_cost: 50,
                        selling_price: 75
                    }
                ]
            };

            const response = await request(app)
                .post('/api/v1/suppliers/grn')
                .set('Authorization', authHeader)
                .field('data', JSON.stringify(grnData));

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');

            // Check if stock was updated
            const stock = await db.Stock.findOne({
                where: {
                    product_id: testProduct.id,
                    branch_id: testBranch.id
                }
            });
            expect(Number(stock.quantity)).toBe(100);

            // Check if AP transaction was created
            const apAccount = await db.Account.findOne({ where: { code: '2100', organization_id: testOrg.id } });
            const transaction = await db.Transaction.findOne({
                where: {
                    account_id: apAccount.id,
                    supplier_id: testSupplier.id,
                    type: 'credit'
                }
            });
            expect(Number(transaction.amount)).toBe(5000); // 100 * 50
        });
    });

    describe('Supplier Ledger', () => {
        it('should fetch supplier ledger with correct balance', async () => {
            // Create a pseudo-GRN transaction first
            const apAccount = await db.Account.create({
                organization_id: testOrg.id,
                code: '2100',
                name: 'Accounts Payable',
                type: 'liability'
            });

            await db.Transaction.create({
                organization_id: testOrg.id,
                branch_id: testBranch.id,
                account_id: apAccount.id,
                supplier_id: testSupplier.id,
                amount: 1000,
                type: 'credit',
                transaction_date: new Date(),
                description: 'Initial Debt'
            });

            const response = await request(app)
                .get(`/api/v1/suppliers/${testSupplier.id}/ledger`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(Number(response.body.data.current_balance)).toBe(1000);
            expect(response.body.data.ledger.length).toBe(1);
        });
    });
});
