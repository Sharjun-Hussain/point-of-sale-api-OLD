const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Comprehensive Customer Ledger & Financial Integration', () => {
    let authHeader;
    let testOrg, testBranch, testUser;
    let testProduct, testVariant;

    beforeAll(async () => {
        // Clear tables carefully
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        const tables = [
            'transactions', 'sale_items', 'sale_payments', 'sales', 'stocks', 
            'product_batches', 'product_variants', 'products', 'customers', 
            'accounts', 'users', 'roles', 'branches', 'organizations'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Setup base data
        testOrg = await db.Organization.create({ name: 'Ledger Test Org', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Ledger Branch', branch_code: 'LBR-01', status: 'active' });
        
        // Setup Accounts (Crucial for Ledger)
        await db.Account.create({ organization_id: testOrg.id, name: 'Cash', code: '1000', type: 'asset', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Accounts Receivable', code: '1100', type: 'asset', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Sales Revenue', code: '4000', type: 'revenue', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Sales Returns', code: '4100', type: 'revenue', balance: 0 });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            name: 'Ledger Manager', username: 'ledgermanager', email: 'ledger@example.com',
            password: hashedPassword, status: 'active'
        });

        // Add permissions
        const requiredPermissions = [
            { name: 'customer:view', group_name: 'Customer' },
            { name: 'customer:create', group_name: 'Customer' },
            { name: 'finance:view', group_name: 'Finance' },
            { name: 'finance:manage', group_name: 'Finance' },
            { name: 'sale:view', group_name: 'Sales' },
            { name: 'sale:create', group_name: 'Sales' },
            { name: 'sale:return', group_name: 'Sales' }
        ];
        
        for (const p of requiredPermissions) {
            await db.Permission.findOrCreate({ where: { name: p.name }, defaults: { group_name: p.group_name } });
        }

        const adminRole = await db.Role.create({ name: 'Admin', is_system_role: true });
        await testUser.addRole(adminRole);
        const permissions = await db.Permission.findAll();
        await adminRole.addPermissions(permissions);

        const login = await request(app).post('/api/v1/auth/login').send({ email: 'ledger@example.com', password: 'password123' });
        authHeader = `Bearer ${login.body.data.auth_token}`;

        // Product Setup
        testProduct = await db.Product.create({ organization_id: testOrg.id, name: 'Ledger Item', code: 'LI-01' });
        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id, product_id: testProduct.id,
            name: 'Standard', sku: 'LI-STD', price: 1000, is_default: true
        });
        await db.Stock.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 1000
        });
    });

    it('should correctly track a full customer lifecycle in the ledger', async () => {
        // 1. Create customer with 5000 opening balance
        const customer = await db.Customer.create({ 
            organization_id: testOrg.id, 
            name: 'Lifecycle Customer',
            opening_balance: 5000,
            credit_limit: 20000 
        });

        // Verify Initial State
        let res = await request(app).get(`/api/v1/customers/${customer.id}/ledger`).set('Authorization', authHeader);
        expect(res.status).toBe(200);
        expect(Number(res.body.data.current_balance)).toBe(5000);

        // 2. Perform a Credit Sale (3 items @ 1000 = 3000, paid 1000)
        const saleRes = await request(app).post('/api/v1/sales').set('Authorization', authHeader).send({
            customer_id: customer.id,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 3 }],
            payment_method: 'cash',
            paid_amount: 1000,
            status: 'completed'
        });
        expect(saleRes.status).toBe(201);

        res = await request(app).get(`/api/v1/customers/${customer.id}/ledger`).set('Authorization', authHeader);
        expect(Number(res.body.data.current_balance)).toBe(7000);
        expect(res.body.data.ledger.length).toBe(1);

        // 3. Customer pays 4000 settlement
        const payRes = await request(app).post(`/api/v1/customers/${customer.id}/payments`).set('Authorization', authHeader).send({
            amount: 4000, payment_method: 'bank', description: 'Major settlement'
        });
        expect(payRes.status).toBe(201);

        res = await request(app).get(`/api/v1/customers/${customer.id}/ledger`).set('Authorization', authHeader);
        expect(Number(res.body.data.current_balance)).toBe(3000);

        // 4. Return items
        const saleId = saleRes.body.data.id;
        const returnRes = await request(app).post('/api/v1/sales/returns').set('Authorization', authHeader).send({
            sale_id: saleId,
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 1 }],
            refund_amount: 1000,
            refund_method: 'ar_adjustment'
        });
        expect(returnRes.status).toBe(201);

        res = await request(app).get(`/api/v1/customers/${customer.id}/ledger`).set('Authorization', authHeader);
        expect(Number(res.body.data.current_balance)).toBe(2000);
    });

    it('should maintain strict isolation between different customers', async () => {
        const c1 = await db.Customer.create({ organization_id: testOrg.id, name: 'C1', opening_balance: 1000 });
        const c2 = await db.Customer.create({ organization_id: testOrg.id, name: 'C2', opening_balance: 2000 });

        const res1 = await request(app).get(`/api/v1/customers/${c1.id}/ledger`).set('Authorization', authHeader);
        expect(res1.status).toBe(200);
        expect(Number(res1.body.data.current_balance)).toBe(1000);

        const res2 = await request(app).get(`/api/v1/customers/${c2.id}/ledger`).set('Authorization', authHeader);
        expect(res2.status).toBe(200);
        expect(Number(res2.body.data.current_balance)).toBe(2000);
    });
});
