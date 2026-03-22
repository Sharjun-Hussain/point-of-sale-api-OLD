const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('POS Sales Module Tests', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranch;
    let testCustomer;
    let testProduct;

    beforeEach(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.Organization.destroy({ where: {} });
        await db.Branch.destroy({ where: {} });
        await db.Customer.destroy({ where: {} });
        await db.Product.destroy({ where: {} });
        await db.Stock.destroy({ where: {} });
        await db.ProductBatch.destroy({ where: {} });
        await db.Sale.destroy({ where: {} });
        await db.SaleItem.destroy({ where: {} });
        await db.Account.destroy({ where: {} });
        await db.Transaction.destroy({ where: {} });
        await db.Setting.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Seed Organization & Branch
        testOrg = await db.Organization.create({
            name: 'Sales Test Org',
            status: 'active'
        });

        testBranch = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'Sales Test Branch',
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
            name: 'Sales Admin',
            username: 'salesadmin',
            email: 'salesadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // Seed Setting for Tax
        await db.Setting.create({
            organization_id: testOrg.id,
            category: 'general',
            settings_data: {
                finance: {
                    taxRate: "8"
                }
            }
        });

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/login')
            .send({
                email: 'salesadmin@example.com',
                password: 'password123'
            });

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        // Seed product and stock
        testProduct = await db.Product.create({
            organization_id: testOrg.id,
            name: 'Sales Item',
            code: 'SALE-001',
            sku: 'SALE-SKU-001',
            price: 100 // Setting a price for calculation
        });

        await db.ProductBatch.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            product_id: testProduct.id,
            quantity: 100,
            batch_number: 'BATCH-SALE-001',
            is_active: true
        });

        await db.Stock.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            product_id: testProduct.id,
            quantity: 100
        });

        testCustomer = await db.Customer.create({
            organization_id: testOrg.id,
            name: 'Sales Customer',
            status: 'active'
        });
    });

    describe('POS Checkout Flow', () => {
        it('should create a sale and update stock/accounting', async () => {
            const saleData = {
                customer_id: testCustomer.id,
                branch_id: testBranch.id,
                items: [
                    {
                        product_id: testProduct.id,
                        quantity: 2,
                        discount_amount: 10
                    }
                ],
                payment_method: 'cash',
                paid_amount: 200, // (100 * 2 - 10) * 1.08 = 190 * 1.08 = 205.2. So 200 is partial.
                status: 'completed'
            };

            const response = await request(app)
                .post('/api/v1/sales')
                .set('Authorization', authHeader)
                .send(saleData);

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');

            const sale = response.body.data;
            expect(sale.payable_amount).toBeCloseTo(205.2, 1);

            // Verify Stock deduction
            const stock = await db.Stock.findOne({
                where: { branch_id: testBranch.id, product_id: testProduct.id }
            });
            expect(Number(stock.quantity)).toBe(98);

            // Verify Batch deduction
            const batch = await db.ProductBatch.findOne({
                where: { branch_id: testBranch.id, product_id: testProduct.id }
            });
            expect(Number(batch.quantity)).toBe(98);

            // Verify Accounting Transactions
            // 1. Revenue (Credit)
            const revenueAcc = await db.Account.findOne({ where: { code: '4000', organization_id: testOrg.id } });
            const revTrans = await db.Transaction.findOne({
                where: { account_id: revenueAcc.id, reference_id: sale.id }
            });
            expect(Number(revTrans.amount)).toBeCloseTo(205.2, 1);
            expect(revTrans.type).toBe('credit');

            // 2. Cash (Debit)
            const cashAcc = await db.Account.findOne({ where: { code: '1000', organization_id: testOrg.id } });
            const cashTrans = await db.Transaction.findOne({
                where: { account_id: cashAcc.id, reference_id: sale.id }
            });
            expect(Number(cashTrans.amount)).toBe(200);
            expect(cashTrans.type).toBe('debit');

            // 3. AR (Debit - Remaining)
            const arAcc = await db.Account.findOne({ where: { code: '1100', organization_id: testOrg.id } });
            const arTrans = await db.Transaction.findOne({
                where: { account_id: arAcc.id, reference_id: sale.id }
            });
            expect(Number(arTrans.amount)).toBeCloseTo(5.2, 1);
            expect(arTrans.type).toBe('debit');
        });

        it('should fail checkout for walk-in if not paid in full', async () => {
            const saleData = {
                items: [
                    {
                        product_id: testProduct.id,
                        quantity: 1,
                        discount_amount: 0
                    }
                ],
                payment_method: 'cash',
                paid_amount: 50, // Price is 100, taxable 108. 50 is insufficient.
                status: 'completed'
            };

            const response = await request(app)
                .post('/api/v1/sales')
                .set('Authorization', authHeader)
                .send(saleData);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Walk-in (Guest) customers must pay in full');
        });
    });
});
