const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Customer Credit Sales & Settlement Verification', () => {
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
            'branches', 'organizations', 'settings', 'cheques'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Setup Org, Branch, User, Customer, Product
        testOrg = await db.Organization.create({ name: 'Credit Test Shop', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Credit Branch', branch_code: 'CB001', status: 'active' });
        
        const adminRole = await db.Role.create({ name: 'Super Admin', is_system_role: true });
        // Add finance:view and finance:manage permissions
        const financeView = await db.Permission.findOrCreate({ where: { name: 'finance:view' }, defaults: { group_name: 'Finance' } });
        const financeManage = await db.Permission.findOrCreate({ where: { name: 'finance:manage' }, defaults: { group_name: 'Finance' } });
        const saleCreate = await db.Permission.findOrCreate({ where: { name: 'sale:create' }, defaults: { group_name: 'Sales' } });
        const customerView = await db.Permission.findOrCreate({ where: { name: 'customer:view' }, defaults: { group_name: 'Customers' } });
        
        await adminRole.addPermissions([financeView[0], financeManage[0], saleCreate[0], customerView[0]]);

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            name: 'Credit Admin',
            username: 'creditadmin',
            email: 'creditadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        const loginRes = await request(app).post('/api/v1/auth/login').send({
            email: 'creditadmin@example.com',
            password: 'password123'
        });
        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        testProduct = await db.Product.create({ organization_id: testOrg.id, name: 'Credit Item', code: 'CR-001' });
        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id,
            product_id: testProduct.id,
            name: 'Standard',
            sku: 'CR-STD',
            price: 1000,
            is_default: true
        });

        await db.Stock.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            product_id: testProduct.id, product_variant_id: testVariant.id,
            quantity: 100
        });

        testCustomer = await db.Customer.create({ organization_id: testOrg.id, name: 'Credit Customer' });
    });

    it('should process a credit sale and verify ledger balance', async () => {
        const c = await db.Customer.create({ organization_id: testOrg.id, name: 'Sale Test' });
        // 1. Create a Sale (5 items @ 1000 = 5000)
        const saleRes = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: c.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 5 }],
            payment_method: 'cash',
            paid_amount: 1000,
            status: 'completed'
        });
        expect(saleRes.status).toBe(201);

        const ledgerRes = await request(app).get(`/api/v1/customers/${c.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(4000);
    });

    it('should process a settlement payment and reduce ledger balance', async () => {
        const c = await db.Customer.create({ organization_id: testOrg.id, name: 'Settlement Test' });
        // Add initial 4000 debt via sale
        await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: c.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 4 }],
            payment_method: 'cash',
            paid_amount: 0,
            status: 'completed'
        });

        const paymentRes = await request(app).post(`/api/v1/customers/${c.id}/payments`).set('Authorization', authHeader).send({
            amount: 2500,
            payment_method: 'cash',
            description: 'Monthly Settlement'
        });
        expect(paymentRes.status).toBe(201);

        const ledgerRes = await request(app).get(`/api/v1/customers/${c.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(1500);
        expect(ledgerRes.body.data.ledger[1].type).toBe('credit');
    });

    it('should handle bank transfer settlement', async () => {
        const c = await db.Customer.create({ organization_id: testOrg.id, name: 'Bank Test' });
        await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: c.id, items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 1 }],
            payment_method: 'cash', paid_amount: 0, status: 'completed'
        });

        await request(app).post(`/api/v1/customers/${c.id}/payments`).set('Authorization', authHeader).send({
            amount: 1000, payment_method: 'bank', description: 'Bank Settlement'
        });

        const ledgerRes = await request(app).get(`/api/v1/customers/${c.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(0);
    });

    it('should create a cheque record for cheque settlements', async () => {
        const c = await db.Customer.create({ organization_id: testOrg.id, name: 'Cheque Test' });
        await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: c.id, items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 1 }],
            payment_method: 'cash', paid_amount: 0, status: 'completed'
        });

        const paymentRes = await request(app).post(`/api/v1/customers/${c.id}/payments`).set('Authorization', authHeader).send({
            amount: 1000,
            payment_method: 'cheque',
            cheque_details: {
                bank_name: 'Test Bank',
                cheque_number: 'CHQ-X',
                cheque_date: '2026-06-01',
                payee_payor_name: 'Cheque Test'
            }
        });
        expect(paymentRes.status).toBe(201);
        const ledgerRes = await request(app).get(`/api/v1/customers/${c.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(0);
    });

    it('should enforce credit limit and reject excessive credit sales', async () => {
        // 1. Set a credit limit of 2000
        await testCustomer.update({ credit_limit: 2000 });

        // 2. Try to make a sale of 5000 on full credit
        const saleRes = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: testCustomer.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 5 }],
            payment_method: 'cash',
            paid_amount: 0,
            status: 'completed'
        });

        expect(saleRes.status).toBe(400);
        expect(saleRes.body.message).toContain('Credit limit exceeded');
        expect(saleRes.body.message).toContain('Limit: 2000.00');

        // 3. Try to make a sale of 1500 on full credit (Should pass)
        const okSaleRes = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: testCustomer.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 1.5 }],
            payment_method: 'cash',
            paid_amount: 0,
            status: 'completed'
        });
        expect(okSaleRes.status).toBe(201);
    });

    it('should account for customer opening balance in ledger', async () => {
        // 1. Create customer with opening balance of 10000
        const richCustomer = await db.Customer.create({ 
            organization_id: testOrg.id, 
            name: 'Rich Customer',
            opening_balance: 10000 
        });

        // 2. Verify Ledger Balance starts at 10000
        const ledgerRes = await request(app).get(`/api/v1/customers/${richCustomer.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(10000);
        
        // Ledger should have no transactions yet, just the balance from opening_balance
        expect(ledgerRes.body.data.ledger.length).toBe(0);
    });

    it('should reduce AR balance when a credit sale item is returned', async () => {
        // Ensure high enough credit limit
        await testCustomer.update({ credit_limit: 10000 });

        // 1. Create a 2000 credit sale for testCustomer
        const saleRes = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: testCustomer.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 2 }], // 2 * 1000 = 2000
            payment_method: 'cash',
            paid_amount: 0,
            status: 'completed'
        });
        
        if (saleRes.status !== 201) {
            console.log('CRITICAL: Sale failed with status', saleRes.status, 'body:', JSON.stringify(saleRes.body, null, 2));
            throw new Error(`Sale creation failed: ${saleRes.body.message}`);
        }
        const saleId = saleRes.body.data.id;

        // Current Balance should be 1500 (prev) + 2000 = 3500
        // Wait, previous test left it at 0 + okSale (1500) = 1500. Correct.
        let ledgerRes = await request(app).get(`/api/v1/customers/${testCustomer.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(3500);

        // 2. Return 1 item (1000)
        await request(app).post('/api/v1/sales/returns').set('Authorization', authHeader).send({
            sale_id: saleId,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 1, reason: 'Return to credit' }],
            refund_amount: 1000,
            refund_method: 'ar_adjustment' // This is the key for credit sales return
        });

        // 3. Verify Ledger Balance (3500 - 1000 = 2500)
        ledgerRes = await request(app).get(`/api/v1/customers/${testCustomer.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(2500);
        
        // Check for the 'SaleReturn' transaction in ledger
        const returnEntry = ledgerRes.body.data.ledger.find(e => e.reference_type === 'SaleReturn');
        expect(returnEntry).toBeDefined();
        expect(returnEntry.type).toBe('credit'); // Reducing AR is a credit
    });
});
