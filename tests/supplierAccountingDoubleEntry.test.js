const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Supplier Accounting & Double-Entry Integrity', () => {
    let authHeader;
    let testOrg, testBranch, testUser;
    let testSupplier;

    beforeAll(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        const tables = [
            'transactions', 'supplier_payments', 'supplier_payment_methods', 'grns', 
            'suppliers', 'accounts', 'users', 'branches', 'organizations'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        testOrg = await db.Organization.create({ name: 'Acc Test Org', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Main Branch', branch_code: 'MB-01', status: 'active' });
        
        // Setup Core Accounts
        await db.Account.create({ organization_id: testOrg.id, name: 'Cash', code: '1010', type: 'asset', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Bank', code: '1020', type: 'asset', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Accounts Payable', code: '2100', type: 'liability', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Inventory Asset', code: '1200', type: 'asset', balance: 0 });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            name: 'Acc Manager', username: 'accmanager', email: 'acc@example.com',
            password: hashedPassword, status: 'active'
        });

        const adminRole = await db.Role.create({ name: 'Admin', is_system_role: true });
        await testUser.addRole(adminRole);
        
        const requiredPermissions = [
            { name: 'supplier:view', group_name: 'Supplier' },
            { name: 'supplier:create', group_name: 'Supplier' },
            { name: 'purchase:view', group_name: 'Purchase' },
            { name: 'purchase:create', group_name: 'Purchase' },
            { name: 'finance:view', group_name: 'Finance' },
            { name: 'finance:manage', group_name: 'Finance' }
        ];
        for (const p of requiredPermissions) {
            await db.Permission.findOrCreate({ where: { name: p.name }, defaults: { group_name: p.group_name } });
        }
        const permissions = await db.Permission.findAll();
        await adminRole.addPermissions(permissions);

        const login = await request(app).post('/api/v1/auth/login').send({ email: 'acc@example.com', password: 'password123' });
        authHeader = `Bearer ${login.body.data.auth_token}`;

        testSupplier = await db.Supplier.create({ organization_id: testOrg.id, name: 'Accounting Supplier' });
    });

    it('should maintain perfect double-entry synchronization for supplier settlements', async () => {
        const product = await db.Product.create({ organization_id: testOrg.id, name: 'Test Product', code: 'TP-01' });
        const grnRes = await request(app).post('/api/v1/suppliers/grn').set('Authorization', authHeader).send({
            supplier_id: testSupplier.id,
            branch_id: testBranch.id,
            items: [{ product_id: product.id, quantity_received: 10, unit_cost: 1000 }],
            total_amount: 10000
        });
        expect(grnRes.status).toBe(201);

        // 2. Verification of AP Balance
        let apAccount = await db.Account.findOne({ where: { organization_id: testOrg.id, code: '2100' } });
        expect(Number(apAccount.balance)).toBe(10000);

        // 3. Multi-Method Settlement (Cash: 3000, Bank: 4000) = 7000 Total
        // Expected: 
        //   AP Account -7000 (Debit) -> Balance: 3000
        //   Cash Account -3000 (Credit) -> Balance: -3000
        //   Bank Account -4000 (Credit) -> Balance: -4000
        const payRes = await request(app).post(`/api/v1/suppliers/${testSupplier.id}/payments`).set('Authorization', authHeader).send({
            total_amount: 7000,
            payments: [
                { payment_method: 'cash', amount: 3000 },
                { payment_method: 'bank', amount: 4000 }
            ],
            description: 'Mixed settlement'
        });
        expect(payRes.status).toBe(201);

        // 4. Final Account Verification
        apAccount = await db.Account.findOne({ where: { organization_id: testOrg.id, code: '2100' } });
        const cashAccount = await db.Account.findOne({ where: { organization_id: testOrg.id, code: '1010' } });
        const bankAccount = await db.Account.findOne({ where: { organization_id: testOrg.id, code: '1020' } });

        expect(Number(apAccount.balance)).toBe(3000);
        expect(Number(cashAccount.balance)).toBe(-3000);
        expect(Number(bankAccount.balance)).toBe(-4000);

        // 5. Ledger Synchronization Check
        // Supplier Ledger should show balance of 3000
        const ledgerRes = await request(app).get(`/api/v1/suppliers/${testSupplier.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(3000);
        expect(ledgerRes.body.data.ledger.length).toBe(2); // 1 GRN, 1 Payment (Header)
    });
});
