const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Manual Journal Entry & Ledger Integration', () => {
    let authHeader;
    let testOrg, testBranch, testUser;
    let testSupplier, testCustomer;
    let cashAccount, apAccount, arAccount, expenseAccount;

    beforeAll(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        const tables = [
            'transactions', 'accounts', 'suppliers', 'customers', 'users', 'branches', 'organizations'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        testOrg = await db.Organization.create({ name: 'Manual Test Org', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Main', branch_code: 'M1', status: 'active' });
        
        // Setup Accounts
        cashAccount = await db.Account.create({ organization_id: testOrg.id, name: 'Cash', code: '1010', type: 'asset', balance: 0 });
        apAccount = await db.Account.create({ organization_id: testOrg.id, name: 'Accounts Payable', code: '2100', type: 'liability', balance: 0 });
        arAccount = await db.Account.create({ organization_id: testOrg.id, name: 'Accounts Receivable', code: '1100', type: 'asset', balance: 0 });
        expenseAccount = await db.Account.create({ organization_id: testOrg.id, name: 'General Expense', code: '5000', type: 'expense', balance: 0 });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            name: 'Finance Manager', username: 'financemanager', email: 'finance@example.com',
            password: hashedPassword, status: 'active'
        });

        const adminRole = await db.Role.create({ name: 'Admin', is_system_role: true });
        await testUser.addRole(adminRole);
        
        const requiredPermissions = [
            { name: 'finance:view', group_name: 'Finance' },
            { name: 'finance:manage', group_name: 'Finance' },
            { name: 'supplier:view', group_name: 'Supplier' },
            { name: 'customer:view', group_name: 'Customer' }
        ];
        for (const p of requiredPermissions) {
            await db.Permission.findOrCreate({ where: { name: p.name }, defaults: { group_name: p.group_name } });
        }
        const permissions = await db.Permission.findAll();
        await adminRole.addPermissions(permissions);

        const login = await request(app).post('/api/v1/auth/login').send({ email: 'finance@example.com', password: 'password123' });
        authHeader = `Bearer ${login.body.data.auth_token}`;

        testSupplier = await db.Supplier.create({ organization_id: testOrg.id, name: 'Journal Supplier' });
        testCustomer = await db.Customer.create({ organization_id: testOrg.id, name: 'Journal Customer' });
    });

    it('should correctly process a balanced manual journal entry', async () => {
        // Journal: Debit Cash 5000, Credit Equity (using Expense for test simplicity, but let's use another account)
        const equityAccount = await db.Account.create({ organization_id: testOrg.id, name: 'Equity', code: '3000', type: 'equity', balance: 0 });
        
        const res = await request(app).post('/api/v1/accounts/journal').set('Authorization', authHeader).send({
            date: new Date(),
            description: 'Capital Introduction',
            entries: [
                { account_id: cashAccount.id, amount: 5000, type: 'debit' },
                { account_id: equityAccount.id, amount: 5000, type: 'credit' }
            ]
        });
        expect(res.status).toBe(200);

        const updatedCash = await db.Account.findByPk(cashAccount.id);
        const updatedEquity = await db.Account.findByPk(equityAccount.id);

        expect(Number(updatedCash.balance)).toBe(5000);
        expect(Number(updatedEquity.balance)).toBe(5000);
    });

    it('should correctly update supplier ledger via manual journal', async () => {
        // Penalty adjustment: Credit AP 500 (Owe more), Debit Expense 500
        const res = await request(app).post('/api/v1/accounts/journal').set('Authorization', authHeader).send({
            date: new Date(),
            description: 'Supplier Penalty',
            supplier_id: testSupplier.id,
            entries: [
                { account_id: apAccount.id, amount: 500, type: 'credit' },
                { account_id: expenseAccount.id, amount: 500, type: 'debit' }
            ]
        });
        expect(res.status).toBe(200);

        // Verify Supplier Ledger
        const ledgerRes = await request(app).get(`/api/v1/suppliers/${testSupplier.id}/ledger`).set('Authorization', authHeader);
        expect(Number(ledgerRes.body.data.current_balance)).toBe(500);
        expect(ledgerRes.body.data.ledger[0].description).toBe('Supplier Penalty');
    });

    it('should correctly update customer ledger via manual journal', async () => {
        // Goodwill adjustment: Credit AR 200 (They owe less), Debit Expense 200
        const res = await request(app).post('/api/v1/accounts/journal').set('Authorization', authHeader).send({
            date: new Date(),
            description: 'Customer Refund',
            customer_id: testCustomer.id,
            entries: [
                { account_id: arAccount.id, amount: 200, type: 'credit' },
                { account_id: expenseAccount.id, amount: 200, type: 'debit' }
            ]
        });
        expect(res.status).toBe(200);

        // Verify Customer Ledger
        const ledgerRes = await request(app).get(`/api/v1/customers/${testCustomer.id}/ledger`).set('Authorization', authHeader);
        // Customer Ledger: Debit increases debt, Credit decreases debt.
        // Balance: -200 (Credit balance means they have overpaid or we owe them)
        expect(Number(ledgerRes.body.data.current_balance)).toBe(-200);
    });

    it('should reject an unbalanced journal entry', async () => {
        const res = await request(app).post('/api/v1/accounts/journal').set('Authorization', authHeader).send({
            date: new Date(),
            description: 'Fraudulent Entry',
            entries: [
                { account_id: cashAccount.id, amount: 1000, type: 'debit' },
                { account_id: expenseAccount.id, amount: 999, type: 'credit' }
            ]
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Journal does not balance');
    });
});
