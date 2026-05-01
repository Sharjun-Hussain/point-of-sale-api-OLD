const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Sales Return & Refund Verification', () => {
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
            'branches', 'organizations', 'settings', 'sale_returns', 'sale_return_items', 'sale_return_payments'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Setup Org, Branch, User, Customer, Product
        testOrg = await db.Organization.create({ name: 'Return Test Shop', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Return Branch', branch_code: 'RB001', status: 'active' });
        
        const adminRole = await db.Role.create({ name: 'Super Admin', is_system_role: true });
        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            name: 'Return Admin',
            username: 'returnadmin',
            email: 'returnadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        const loginRes = await request(app).post('/api/v1/auth/login').send({
            email: 'returnadmin@example.com',
            password: 'password123'
        });
        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        testProduct = await db.Product.create({ organization_id: testOrg.id, name: 'Returnable Item', code: 'RET-001' });
        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id,
            product_id: testProduct.id,
            name: 'Standard',
            sku: 'RET-STD',
            price: 500,
            is_default: true
        });

        await db.Stock.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            product_id: testProduct.id, product_variant_id: testVariant.id,
            quantity: 100
        });

        await db.ProductBatch.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            product_id: testProduct.id, product_variant_id: testVariant.id,
            quantity: 100, batch_number: 'BATCH-RET', is_active: true
        });

        testCustomer = await db.Customer.create({ organization_id: testOrg.id, name: 'Regular Buyer' });
    });

    it('should process a partial return and verify accounting + stock', async () => {
        // 1. Create a Sale (5 items @ 500 = 2500)
        const saleRes = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: testCustomer.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 5 }],
            payment_method: 'cash',
            paid_amount: 2500,
            status: 'completed'
        });
        expect(saleRes.status).toBe(201);
        const saleId = saleRes.body.data.id;

        // Check Stock before return (100 - 5 = 95)
        const stockBefore = await db.Stock.findOne({ where: { product_variant_id: testVariant.id } });
        expect(Number(stockBefore.quantity)).toBe(95);

        // 2. Process Partial Return (2 items)
        const returnRes = await request(app).post('/api/v1/sales/returns').set('Authorization', authHeader).send({
            sale_id: saleId,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 2, reason: 'Damaged' }],
            refund_amount: 1000, // 2 * 500
            refund_method: 'cash'
        });
        expect(returnRes.status).toBe(201);

        // 3. Verify Stock After Return (95 + 2 = 97)
        const stockAfter = await db.Stock.findOne({ where: { product_variant_id: testVariant.id } });
        expect(Number(stockAfter.quantity)).toBe(97);

        // 4. Verify Accounting Ledger
        const transactions = await db.Transaction.findAll({
            where: { reference_id: returnRes.body.data.id, reference_type: 'SaleReturn' }
        });

        // Should have:
        // Debit: Sales Returns & Allowances (Revenue Contra) 1000
        // Credit: Cash (Asset) 1000
        let totalDebit = 0;
        let totalCredit = 0;
        transactions.forEach(t => {
            if (t.type === 'debit') totalDebit += Number(t.amount);
            else totalCredit += Number(t.amount);
        });

        expect(totalDebit).toBe(1000);
        expect(totalCredit).toBe(1000);

        // 5. Verify Sale Status (should be 'partial' return status)
        const updatedSale = await db.Sale.findByPk(saleId);
        expect(updatedSale.return_status).toBe('partial');
    });

    it('should process a full return and update sale status to returned', async () => {
        // Find existing sale from previous test
        const sale = await db.Sale.findOne({ where: { organization_id: testOrg.id } });
        
        // Return remaining 3 items
        const returnRes = await request(app).post('/api/v1/sales/returns').set('Authorization', authHeader).send({
            sale_id: sale.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 3, reason: 'Wrong Size' }],
            refund_amount: 1500,
            refund_method: 'cash'
        });
        expect(returnRes.status).toBe(201);

        // Verify Final Sale Status
        const finalSale = await db.Sale.findByPk(sale.id);
        expect(finalSale.return_status).toBe('full');
        expect(finalSale.status).toBe('returned');

        // Final Stock Check (97 + 3 = 100)
        const finalStock = await db.Stock.findOne({ where: { product_variant_id: testVariant.id } });
        expect(Number(finalStock.quantity)).toBe(100);
    });

    it('should reject return if quantity exceeds original purchase', async () => {
        // Create new sale
        const saleRes = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: testCustomer.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 1 }],
            payment_method: 'cash',
            paid_amount: 500,
            status: 'completed'
        });
        
        const returnRes = await request(app).post('/api/v1/sales/returns').set('Authorization', authHeader).send({
            sale_id: saleRes.body.data.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 2 }], // 2 > 1
            refund_amount: 1000,
            refund_method: 'cash'
        });
        
        expect(returnRes.status).toBe(500); // Controller throws Error which returns 500
        expect(returnRes.body.message).toContain('Limit exceeded');
    });
});
