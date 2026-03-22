const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Stock & Inventory Module Tests', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranchA;
    let testBranchB;
    let testProduct;

    beforeEach(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.Organization.destroy({ where: {} });
        await db.Branch.destroy({ where: {} });
        await db.Product.destroy({ where: {} });
        await db.Stock.destroy({ where: {} });
        await db.ProductBatch.destroy({ where: {} });
        await db.StockAdjustment.destroy({ where: {} });
        await db.StockTransfer.destroy({ where: {} });
        await db.StockTransferItem.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Seed Organization & Branches
        testOrg = await db.Organization.create({
            name: 'Stock Test Org',
            status: 'active'
        });

        testBranchA = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'Branch A',
            branch_code: 'BRA001',
            status: 'active'
        });

        testBranchB = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'Branch B',
            branch_code: 'BRB001',
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
            branch_id: testBranchA.id,
            name: 'Stock Admin',
            username: 'stockadmin',
            email: 'stockadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/login')
            .send({
                email: 'stockadmin@example.com',
                password: 'password123'
            });

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        // Seed a product
        testProduct = await db.Product.create({
            organization_id: testOrg.id,
            name: 'Inventory Item',
            code: 'INV-001',
            sku: 'INV-SKU-001'
        });
    });

    describe('Stock Adjustments', () => {
        it('should add stock to a branch', async () => {
            const response = await request(app)
                .post('/api/v1/stocks/adjust')
                .set('Authorization', authHeader)
                .send({
                    branch_id: testBranchA.id,
                    product_id: testProduct.id,
                    quantity: 50,
                    type: 'addition',
                    reason: 'Opening stock adjustment'
                });

            expect(response.status).toBe(201);

            // Verify Stock record
            const stock = await db.Stock.findOne({
                where: { branch_id: testBranchA.id, product_id: testProduct.id }
            });
            expect(Number(stock.quantity)).toBe(50);

            // Verify Batch creation
            const batch = await db.ProductBatch.findOne({
                where: { branch_id: testBranchA.id, product_id: testProduct.id }
            });
            expect(Number(batch.quantity)).toBe(50);
        });

        it('should subtract stock from a branch (FIFO)', async () => {
            // Seed 2 batches
            await db.ProductBatch.create({
                organization_id: testOrg.id,
                branch_id: testBranchA.id,
                product_id: testProduct.id,
                quantity: 30,
                batch_number: 'BATCH-001',
                purchase_date: new Date('2023-01-01'),
                is_active: true
            });
            await db.ProductBatch.create({
                organization_id: testOrg.id,
                branch_id: testBranchA.id,
                product_id: testProduct.id,
                quantity: 20,
                batch_number: 'BATCH-002',
                purchase_date: new Date('2023-02-01'),
                is_active: true
            });
            await db.Stock.create({
                organization_id: testOrg.id,
                branch_id: testBranchA.id,
                product_id: testProduct.id,
                quantity: 50
            });

            const response = await request(app)
                .post('/api/v1/stocks/adjust')
                .set('Authorization', authHeader)
                .send({
                    branch_id: testBranchA.id,
                    product_id: testProduct.id,
                    quantity: 40,
                    type: 'subtraction',
                    reason: 'Waste/Damage'
                });

            expect(response.status).toBe(201);

            // Total stock should be 10
            const stock = await db.Stock.findOne({
                where: { branch_id: testBranchA.id, product_id: testProduct.id }
            });
            expect(Number(stock.quantity)).toBe(10);

            // Batch 1 should be exhausted (0), Batch 2 should have 10 left
            const batch1 = await db.ProductBatch.findOne({ where: { batch_number: 'BATCH-001' } });
            const batch2 = await db.ProductBatch.findOne({ where: { batch_number: 'BATCH-002' } });

            expect(Number(batch1.quantity)).toBe(0);
            expect(Number(batch2.quantity)).toBe(10);
        });
    });

    describe('Stock Transfers', () => {
        it('should transfer stock between branches', async () => {
            // Seed source stock
            await db.ProductBatch.create({
                organization_id: testOrg.id,
                branch_id: testBranchA.id,
                product_id: testProduct.id,
                quantity: 100,
                batch_number: 'T-BATCH-001',
                is_active: true
            });
            await db.Stock.create({
                organization_id: testOrg.id,
                branch_id: testBranchA.id,
                product_id: testProduct.id,
                quantity: 100
            });

            const response = await request(app)
                .post('/api/v1/stocks/transfers')
                .set('Authorization', authHeader)
                .send({
                    from_branch_id: testBranchA.id,
                    to_branch_id: testBranchB.id,
                    items: [
                        {
                            product_id: testProduct.id,
                            quantity: 40
                        }
                    ]
                });

            expect(response.status).toBe(201);

            // Source branch: 100 - 40 = 60
            const stockA = await db.Stock.findOne({ where: { branch_id: testBranchA.id, product_id: testProduct.id } });
            expect(Number(stockA.quantity)).toBe(60);

            // Dest branch: 0 + 40 = 40
            const stockB = await db.Stock.findOne({ where: { branch_id: testBranchB.id, product_id: testProduct.id } });
            expect(Number(stockB.quantity)).toBe(40);

            // Verify batch movement
            const batchA = await db.ProductBatch.findOne({ where: { branch_id: testBranchA.id, batch_number: 'T-BATCH-001' } });
            expect(Number(batchA.quantity)).toBe(60);

            const batchB = await db.ProductBatch.findOne({ where: { branch_id: testBranchB.id, batch_number: 'T-BATCH-001' } });
            expect(Number(batchB.quantity)).toBe(40);
        });
    });
});
