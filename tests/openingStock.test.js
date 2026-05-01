const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Product Opening Stock Initialization Tests', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranch;
    let testProduct;
    let testVariant;

    beforeEach(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.Organization.destroy({ where: {} });
        await db.Branch.destroy({ where: {} });
        await db.Product.destroy({ where: {} });
        await db.ProductVariant.destroy({ where: {} });
        await db.Stock.destroy({ where: {} });
        await db.ProductBatch.destroy({ where: {} });
        await db.StockOpening.destroy({ where: {} });
        await db.Account.destroy({ where: {} });
        await db.Transaction.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Seed Organization & Branch
        testOrg = await db.Organization.create({
            name: 'Opening Stock Test Org',
            status: 'active'
        });

        testBranch = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'Test Branch',
            branch_code: 'TB001',
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
            name: 'Admin User',
            username: 'admin',
            email: 'admin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: 'admin@example.com',
                password: 'password123'
            });

        if (!loginRes.body || !loginRes.body.data) {
            console.error('Login failed:', loginRes.body);
            throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
        }

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        // Seed a product and a variant
        testProduct = await db.Product.create({
            organization_id: testOrg.id,
            name: 'Test Product',
            code: 'TP-001',
            sku: 'TP-SKU-001'
        });

        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id,
            product_id: testProduct.id,
            name: 'Test Variant',
            sku: 'TV-SKU-001',
            price: 100,
            cost_price: 80
        });
    });

    it('should initialize opening stock for a product without variants', async () => {
        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    {
                        product_id: testProduct.id,
                        quantity: 10,
                        cost_price: 50,
                        selling_price: 100,
                        wholesale_price: 90,
                        batch_number: 'BATCH-001'
                    }
                ]
            });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('success');

        // Verify Stock
        const stock = await db.Stock.findOne({
            where: { branch_id: testBranch.id, product_id: testProduct.id, product_variant_id: null }
        });
        expect(Number(stock.quantity)).toBe(10);

        // Verify Product Variant Price Update (Default Variant)
        const updatedVariant = await db.ProductVariant.findOne({
            where: { product_id: testProduct.id }
        });
        expect(Number(updatedVariant.cost_price)).toBe(50);
        expect(Number(updatedVariant.price)).toBe(100);

        // Verify Accounting
        const inventoryAccount = await db.Account.findOne({ where: { organization_id: testOrg.id, code: '1200' } });
        expect(Number(inventoryAccount.balance)).toBe(500); // 10 * 50
    });

    it('should initialize opening stock for a variant', async () => {
        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    {
                        product_id: testProduct.id,
                        product_variant_id: testVariant.id,
                        quantity: 20,
                        cost_price: 60,
                        selling_price: 120,
                        wholesale_price: 110,
                        batch_number: 'V-BATCH-001'
                    }
                ]
            });

        expect(response.status).toBe(201);

        // Verify Stock
        const stock = await db.Stock.findOne({
            where: { branch_id: testBranch.id, product_variant_id: testVariant.id }
        });
        expect(Number(stock.quantity)).toBe(20);

        // Verify Variant Price Update
        const updatedVariant = await db.ProductVariant.findByPk(testVariant.id);
        expect(Number(updatedVariant.cost_price)).toBe(60);
        expect(Number(updatedVariant.price)).toBe(120);
    });

    it('should increment stock when initialized multiple times (existing data)', async () => {
        // First initialization
        await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    {
                        product_id: testProduct.id,
                        quantity: 10,
                        cost_price: 50
                    }
                ]
            });

        // Second initialization
        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    {
                        product_id: testProduct.id,
                        quantity: 5,
                        cost_price: 60
                    }
                ]
            });

        expect(response.status).toBe(201);

        // Verify Stock (10 + 5 = 15)
        const stock = await db.Stock.findOne({
            where: { branch_id: testBranch.id, product_id: testProduct.id }
        });
        expect(Number(stock.quantity)).toBe(15);

        // Verify Multiple Batches
        const batches = await db.ProductBatch.findAll({
            where: { product_id: testProduct.id }
        });
        expect(batches.length).toBe(2);
    });

    it('should create correct accounting transactions', async () => {
        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    {
                        product_id: testProduct.id,
                        quantity: 10,
                        cost_price: 100
                    }
                ]
            });

        const totalValue = 10 * 100;

        // Verify Transactions
        const transactions = await db.Transaction.findAll({
            where: { reference_id: response.body.data.id, reference_type: 'StockOpening' }
        });

        expect(transactions.length).toBe(2);
        
        const debit = transactions.find(t => t.type === 'debit');
        const credit = transactions.find(t => t.type === 'credit');

        expect(Number(debit.amount)).toBe(totalValue);
        expect(Number(credit.amount)).toBe(totalValue);

        // Verify Account Balances
        const inventoryAccount = await db.Account.findOne({ where: { code: '1200' } });
        const equityAccount = await db.Account.findOne({ where: { code: '3000' } });

        expect(Number(inventoryAccount.balance)).toBe(totalValue);
        expect(Number(equityAccount.balance)).toBe(totalValue);
    });

    it('should initialize multiple items in a single request', async () => {
        const testProduct2 = await db.Product.create({
            organization_id: testOrg.id,
            name: 'Test Product 2',
            code: 'TP-002'
        });

        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    { product_id: testProduct.id, quantity: 10, cost_price: 50 },
                    { product_id: testProduct2.id, quantity: 5, cost_price: 100 }
                ]
            });

        expect(response.status).toBe(201);
        
        // Total value = (10*50) + (5*100) = 500 + 500 = 1000
        const inventoryAccount = await db.Account.findOne({ where: { code: '1200', organization_id: testOrg.id } });
        expect(Number(inventoryAccount.balance)).toBe(1000);
    });

    it('should handle decimal quantities correctly', async () => {
        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    { product_id: testProduct.id, quantity: 10.5, cost_price: 100 }
                ]
            });

        expect(response.status).toBe(201);
        
        const stock = await db.Stock.findOne({
            where: { branch_id: testBranch.id, product_id: testProduct.id }
        });
        expect(Number(stock.quantity)).toBe(10.5);

        const inventoryAccount = await db.Account.findOne({ where: { code: '1200', organization_id: testOrg.id } });
        expect(Number(inventoryAccount.balance)).toBe(1050); // 10.5 * 100
    });

    it('should allow zero cost price', async () => {
        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    { product_id: testProduct.id, quantity: 10, cost_price: 0 }
                ]
            });

        expect(response.status).toBe(201);
        
        const inventoryAccount = await db.Account.findOne({ where: { code: '1200', organization_id: testOrg.id } });
        expect(Number(inventoryAccount.balance)).toBe(0);
    });

    it('should fail when branch_id is missing', async () => {
        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                items: [{ product_id: testProduct.id, quantity: 10 }]
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Branch ID is required');
    });

    it('should handle non-existent product IDs gracefully', async () => {
        // This test checks if the system handles non-existent IDs. 
        // Depending on implementation, it might fail due to FK constraints or return an error.
        const response = await request(app)
            .post('/api/v1/products/opening-stock')
            .set('Authorization', authHeader)
            .send({
                branch_id: testBranch.id,
                items: [
                    { product_id: '00000000-0000-0000-0000-000000000000', quantity: 10 }
                ]
            });

        // Currently, it might fail with 500 if there's no check, or 400 if validated.
        // If it's 500, we'll see it in the test results.
        expect(response.status).not.toBe(201);
    });
});
