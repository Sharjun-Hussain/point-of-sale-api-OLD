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

    beforeAll(async () => {
        // Clear tables
        try {
            await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
            const tables = [
                'transactions', 'sale_items', 'sale_payments', 'sales', 'stocks', 'product_batches',
                'product_variants', 'products', 'customers', 'accounts', 'users', 'roles',
                'branches', 'organizations', 'settings', 'cheques', 'sale_employees', 'sale_return_payments',
                'supplier_payment_methods', 'expense_payment_methods'
            ];
            for (const table of tables) {
                await db.sequelize.query(`DELETE FROM ${table}`).catch(err => {
                    if (!err.message.includes('doesn\'t exist')) {
                        console.error(`Failed to delete from ${table}:`, err.message);
                    }
                });
            }
            await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        } catch (err) {
            console.error('Setup failed:', err);
        }

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
            .post('/api/v1/auth/login')
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
            sku: 'SALE-SKU-001'
        });

        const defaultVariant = await db.ProductVariant.create({
            organization_id: testOrg.id,
            product_id: testProduct.id,
            name: 'Standard',
            sku: 'SALE-SKU-001-STD',
            price: 100,
            wholesale_price: 80,
            is_default: true
        });

        await db.ProductBatch.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            product_id: testProduct.id,
            product_variant_id: defaultVariant.id,
            quantity: 100,
            batch_number: 'BATCH-SALE-001',
            is_active: true
        });

        await db.Stock.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            product_id: testProduct.id,
            product_variant_id: defaultVariant.id,
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
            expect(Number(sale.payable_amount)).toBeCloseTo(205.2, 1);

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

        it('should create a wholesale sale using variant wholesale prices', async () => {
            // Create a variant for the product
            const variant = await db.ProductVariant.create({
                organization_id: testOrg.id,
                product_id: testProduct.id,
                name: 'Bulk Pack',
                sku: 'SALE-BULK',
                price: 150, // Retail
                wholesale_price: 120 // Wholesale
            });

            // Seed stock for variant
            await db.Stock.create({
                organization_id: testOrg.id,
                branch_id: testBranch.id,
                product_id: testProduct.id,
                product_variant_id: variant.id,
                quantity: 50
            });

            await db.ProductBatch.create({
                organization_id: testOrg.id,
                branch_id: testBranch.id,
                product_id: testProduct.id,
                product_variant_id: variant.id,
                quantity: 50,
                batch_number: 'BATCH-BULK-001',
                is_active: true
            });

            const saleData = {
                customer_id: testCustomer.id,
                is_wholesale: true,
                items: [
                    {
                        product_id: testProduct.id,
                        product_variant_id: variant.id,
                        quantity: 10
                    }
                ],
                paid_amount: 1296, // 120 * 10 * 1.08
                payment_method: 'cash'
            };

            const response = await request(app)
                .post('/api/v1/sales')
                .set('Authorization', authHeader)
                .send(saleData);

            expect(response.status).toBe(201);
            expect(Number(response.body.data.payable_amount)).toBeCloseTo(1296, 1);
            expect(response.body.data.is_wholesale).toBe(true);
        });

        it('should handle split payments (Cash + Bank Transfer)', async () => {
            const saleData = {
                customer_id: testCustomer.id,
                items: [
                    {
                        product_id: testProduct.id,
                        quantity: 1
                    }
                ],
                payments: [
                    { payment_method: 'cash', amount: 50 },
                    { payment_method: 'bank_transfer', amount: 58 } // Total 108 (100 * 1.08)
                ],
                status: 'completed'
            };

            const response = await request(app)
                .post('/api/v1/sales')
                .set('Authorization', authHeader)
                .send(saleData);

            expect(response.status).toBe(201);
            expect(response.body.data.payment_method).toBe('split');
            
            // Verify accounting transactions
            const cashAcc = await db.Account.findOne({ where: { code: '1000', organization_id: testOrg.id } });
            const bankAcc = await db.Account.findOne({ where: { code: '1010', organization_id: testOrg.id } });

            const cashTrans = await db.Transaction.findOne({
                where: { account_id: cashAcc.id, reference_id: response.body.data.id, amount: 50 }
            });
            const bankTrans = await db.Transaction.findOne({
                where: { account_id: bankAcc.id, reference_id: response.body.data.id, amount: 58 }
            });

            expect(cashTrans).toBeDefined();
            expect(bankTrans).toBeDefined();
        });
    });
});
