const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Multi-User Shift Management & Accounting Security', () => {
    let authCashier1, authCashier2;
    let user1, user2;
    let testOrg, testBranch;
    let testProduct, testVariant;

    beforeAll(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        const tables = [
            'transactions', 'sale_items', 'sale_payments', 'sales', 'stocks', 'product_batches',
            'product_variants', 'products', 'customers', 'accounts', 'users', 'roles',
            'branches', 'organizations', 'shifts', 'shift_transactions'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Setup Org and Branch
        testOrg = await db.Organization.create({ name: 'Shift Test Org', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Main Branch', branch_code: 'MB001', status: 'active' });
        
        // Roles & Permissions
        const cashierRole = await db.Role.create({ name: 'Cashier', is_system_role: false });
        const shiftCreate = await db.Permission.findOrCreate({ where: { name: 'shift:create' }, defaults: { group_name: 'Shift' } });
        const shiftManage = await db.Permission.findOrCreate({ where: { name: 'shift:manage' }, defaults: { group_name: 'Shift' } });
        const saleCreate = await db.Permission.findOrCreate({ where: { name: 'sale:create' }, defaults: { group_name: 'Sales' } });
        await cashierRole.addPermissions([shiftCreate[0], shiftManage[0], saleCreate[0]]);

        const hashedPassword = await bcrypt.hash('password123', 10);
        
        // Create Two Cashiers
        user1 = await db.User.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            name: 'Cashier One', username: 'cashier1', email: 'c1@example.com',
            password: hashedPassword, status: 'active'
        });
        await user1.addRole(cashierRole);

        user2 = await db.User.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            name: 'Cashier Two', username: 'cashier2', email: 'c2@example.com',
            password: hashedPassword, status: 'active'
        });
        await user2.addRole(cashierRole);

        // Logins
        const login1 = await request(app).post('/api/v1/auth/login').send({ email: 'c1@example.com', password: 'password123' });
        authCashier1 = `Bearer ${login1.body.data.auth_token}`;

        const login2 = await request(app).post('/api/v1/auth/login').send({ email: 'c2@example.com', password: 'password123' });
        authCashier2 = `Bearer ${login2.body.data.auth_token}`;

        // Product setup
        testProduct = await db.Product.create({ organization_id: testOrg.id, name: 'Shift Item', code: 'SH-01' });
        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id, product_id: testProduct.id,
            name: 'Std', sku: 'SH-STD', price: 500, is_default: true
        });
        await db.Stock.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 100
        });
    });

    it('should allow Cashier 1 to open a shift with opening cash', async () => {
        const res = await request(app).post('/api/v1/shifts/open').set('Authorization', authCashier1).send({
            opening_cash: 2000
        });
        expect(res.status).toBe(201);
        expect(Number(res.body.data.opening_cash)).toBe(2000);
        expect(res.body.data.status).toBe('open');
    });

    it('should block Cashier 1 from opening a second shift', async () => {
        const res = await request(app).post('/api/v1/shifts/open').set('Authorization', authCashier1).send({
            opening_cash: 500
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('already have an open shift');
    });

    it('should allow Cashier 2 to open their own independent shift', async () => {
        const res = await request(app).post('/api/v1/shifts/open').set('Authorization', authCashier2).send({
            opening_cash: 3000
        });
        expect(res.status).toBe(201);
        expect(Number(res.body.data.opening_cash)).toBe(3000);
    });

    it('should track sales independently for each shift', async () => {
        // Get Cashier 1's shift
        const shift1Res = await request(app).get('/api/v1/shifts/active').set('Authorization', authCashier1);
        const shift1Id = shift1Res.body.data.id;

        // Cashier 1 makes a sale of 2 items @ 500 = 1000
        const saleRes = await request(app).post('/api/v1/sales').set('Authorization', authCashier1).send({
            items: [{ product_id: testProduct.id, product_variant_id: testVariant.id, quantity: 2 }],
            payment_method: 'cash',
            paid_amount: 1000,
            status: 'completed',
            shift_id: shift1Id
        });
        expect(saleRes.status).toBe(201);

        // Record a 'drop' (payout) for Cashier 1 (e.g., buying snacks for 200)
        await request(app).post(`/api/v1/shifts/${shift1Id}/transactions`).set('Authorization', authCashier1).send({
            type: 'payout',
            amount: 200,
            notes: 'Office snacks'
        });

        // Close Cashier 1's shift
        // Expected: 2000 (opening) + 1000 (sale) - 200 (payout) = 2800
        // We report 2850 (50 variance)
        const closeRes = await request(app).post(`/api/v1/shifts/${shift1Id}/close`).set('Authorization', authCashier1).send({
            closing_cash: 2850
        });

        expect(closeRes.status).toBe(200);
        expect(Number(closeRes.body.data.expected_cash)).toBe(2800);
        expect(Number(closeRes.body.data.variance)).toBe(50);
        expect(closeRes.body.data.status).toBe('closed');
    });

    it('should ensure Cashier 2 shift remains unaffected', async () => {
        const shift2Res = await request(app).get('/api/v1/shifts/active').set('Authorization', authCashier2);
        const shift2 = shift2Res.body.data;

        // Cashier 2 shift should still be open and have no transactions/sales
        expect(shift2.status).toBe('open');
        expect(Number(shift2.opening_cash)).toBe(3000);
        
        // Close Cashier 2's shift with a shortage
        // Expected: 3000, Actual: 2900, Variance: -100
        const closeRes = await request(app).post(`/api/v1/shifts/${shift2.id}/close`).set('Authorization', authCashier2).send({
            closing_cash: 2900
        });
        expect(Number(closeRes.body.data.variance)).toBe(-100);
    });

    it('should block unauthorized users from closing someone else shift', async () => {
        // Open new shift for Cashier 1
        const openRes = await request(app).post('/api/v1/shifts/open').set('Authorization', authCashier1).send({ opening_cash: 100 });
        const shiftId = openRes.body.data.id;

        // Try to close it using Cashier 2's token
        const res = await request(app).post(`/api/v1/shifts/${shiftId}/close`).set('Authorization', authCashier2).send({ closing_cash: 100 });
        
        expect(res.status).toBe(404); // Controller filters by user_id
        expect(res.body.message).toContain('not found');
    });
});
