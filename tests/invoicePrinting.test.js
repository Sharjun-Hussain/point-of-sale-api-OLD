const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Invoice Printing Data Verification', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranch;
    let testCustomer;
    let testProduct;
    let testVariant;

    beforeAll(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        const tables = [
            'transactions', 'sale_items', 'sale_payments', 'sales', 'stocks', 'product_batches',
            'product_variants', 'products', 'customers', 'accounts', 'users', 'roles',
            'branches', 'organizations', 'settings'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // 1. Seed Organization (Business Settings)
        testOrg = await db.Organization.create({
            name: 'Inzeedo Print Shop',
            address: '123 Printer Lane, Tech City',
            phone: '+1-555-PRINT',
            tax_id: 'VAT-999-888',
            status: 'active'
        });

        // 2. Seed Branch
        testBranch = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'Main Branch',
            branch_code: 'MB001',
            address: '456 Branch Ave, Tech City',
            phone: '+1-555-BRANCH',
            status: 'active'
        });

        // 3. Seed Receipt Settings
        await db.Setting.create({
            organization_id: testOrg.id,
            category: 'receipt',
            settings_data: {
                headerText: "Welcome to Inzeedo",
                footerText: "Thank you for your business!",
                showLogo: true,
                paperWidth: "80mm",
                showTax: true,
                showDiscount: true
            }
        });

        // Setup tax settings: ENABLED with 8%
        await db.Setting.create({
            organization_id: testOrg.id,
            category: 'general',
            settings_data: {
                finance: {
                    enableTax: true,
                    taxRate: "8"
                }
            }
        });

        // 5. Seed Admin User
        const adminRole = await db.Role.create({ name: 'Super Admin', is_system_role: true });
        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            name: 'Print Admin',
            username: 'printadmin',
            email: 'printadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // 6. Login
        const loginRes = await request(app).post('/api/v1/auth/login').send({
            email: 'printadmin@example.com',
            password: 'password123'
        });
        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        // 7. Seed Product & Variant
        testProduct = await db.Product.create({
            organization_id: testOrg.id,
            name: 'Custom T-Shirt',
            code: 'TSHIRT-001',
            sku: 'TSHIRT-SKU'
        });

        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id,
            product_id: testProduct.id,
            name: 'Large Blue',
            sku: 'TSHIRT-L-BLUE',
            price: 200,
            is_default: true
        });

        await db.Stock.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            product_id: testProduct.id,
            product_variant_id: testVariant.id,
            quantity: 50
        });

        await db.ProductBatch.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            product_id: testProduct.id,
            product_variant_id: testVariant.id,
            quantity: 50,
            batch_number: 'BATCH-001',
            is_active: true
        });

        testCustomer = await db.Customer.create({
            organization_id: testOrg.id,
            name: 'Loyal Customer',
            phone: '555-0199',
            status: 'active'
        });
    });

    it('should correctly calculate totals and change for 125 price and 200 payment', async () => {
        // Set tax to 0 for this test to simplify
        await db.Setting.update(
            { settings_data: { finance: { taxRate: "0" } } },
            { where: { organization_id: testOrg.id, category: 'general' } }
        );

        const saleData = {
            customer_id: testCustomer.id,
            items: [
                {
                    product_id: testProduct.id,
                    product_variant_id: testVariant.id,
                    quantity: 1 // Price is 125 (I will update variant price)
                }
            ],
            payment_method: 'cash',
            paid_amount: 200,
            status: 'completed'
        };

        // Update variant price to 125
        await testVariant.update({ price: 125 });

        const response = await request(app)
            .post('/api/v1/sales')
            .set('Authorization', authHeader)
            .send(saleData);

        expect(response.status).toBe(201);
        const sale = response.body.data;

        // Create a second sale to verify sequential numbering
        const response2 = await request(app)
            .post('/api/v1/sales')
            .set('Authorization', authHeader)
            .send(saleData);

        expect(response2.status).toBe(201);
        const sale2 = response2.body.data;

        const num1 = parseInt(sale.invoice_number.split('-').pop());
        const num2 = parseInt(sale2.invoice_number.split('-').pop());
        expect(num2).toBe(num1 + 1);

        // Verify Ledger balance for sale 1
        const transactions = await db.Transaction.findAll({
            where: { reference_id: sale.id, reference_type: 'Sale' }
        });

        let totalDebit = 0;
        let totalCredit = 0;
        transactions.forEach(t => {
            if (t.type === 'debit') totalDebit += Number(t.amount);
            else totalCredit += Number(t.amount);
        });

        expect(totalDebit).toBe(totalCredit);
        expect(totalDebit).toBe(Number(sale.payable_amount));

        // Ensure Cash debit is exactly 125, even though 200 was handed
        const cashTransaction = transactions.find(t => t.description.includes('CASH payment'));
        expect(Number(cashTransaction.amount)).toBe(125);
    });

    it('should respect enableTax setting', async () => {
        // Clear sales to avoid invoice number conflicts
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.sequelize.query('DELETE FROM transactions');
        await db.sequelize.query('DELETE FROM sale_items');
        await db.sequelize.query('DELETE FROM sale_payments');
        await db.sequelize.query('DELETE FROM sales');
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        const saleData = {
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 1 }],
            paid_amount: 1000,
            status: 'completed'
        };
        await testVariant.update({ price: 100 });

        // Case 1: Tax Enabled at 8%
        await db.Setting.update(
            { settings_data: { finance: { enableTax: true, taxRate: "8" } } },
            { where: { organization_id: testOrg.id, category: 'general' } }
        );
        const res1 = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send(saleData);
        if (res1.status !== 201) console.log('DEBUG res1 error:', res1.body);
        expect(res1.status).toBe(201);
        expect(Number(res1.body.data.tax_amount)).toBe(8);
        expect(Number(res1.body.data.payable_amount)).toBe(108);

        // Case 2: Tax Disabled but rate still 8%
        await db.Setting.update(
            { settings_data: { finance: { enableTax: false, taxRate: "8" } } },
            { where: { organization_id: testOrg.id, category: 'general' } }
        );
        const res2 = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send(saleData);
        if (res2.status !== 201) console.log('DEBUG res2 error:', res2.body);
        expect(res2.status).toBe(201);
        expect(Number(res2.body.data.tax_amount)).toBe(0);
        expect(Number(res2.body.data.payable_amount)).toBe(100);
    });
});
