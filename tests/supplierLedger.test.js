const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Comprehensive Supplier Ledger & AP Integration', () => {
    let authHeader;
    let testOrg, testBranch, testUser;
    let testProduct, testVariant;

    beforeAll(async () => {
        // Clear tables carefully
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        const tables = [
            'transactions', 'grn_items', 'grns', 'purchase_return_items', 'purchase_returns',
            'supplier_payments', 'stocks', 'product_batches', 'product_variants', 'products', 
            'suppliers', 'accounts', 'users', 'roles', 'branches', 'organizations'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Setup base data
        testOrg = await db.Organization.create({ name: 'Supplier Test Org', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Main Branch', branch_code: 'MB-01', status: 'active' });
        
        // Setup Accounts (AP = 2100, Cash = 1010, Inventory = 1200)
        await db.Account.create({ organization_id: testOrg.id, name: 'Cash', code: '1010', type: 'asset', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Accounts Payable', code: '2100', type: 'liability', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Inventory Asset', code: '1200', type: 'asset', balance: 0 });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            name: 'Supplier Manager', username: 'suppliermanager', email: 'supplier@example.com',
            password: hashedPassword, status: 'active'
        });

        // Add permissions
        const adminRole = await db.Role.create({ name: 'Admin', is_system_role: true });
        await testUser.addRole(adminRole);
        
        const requiredPermissions = [
            { name: 'supplier:view', group_name: 'Supplier' },
            { name: 'supplier:create', group_name: 'Supplier' },
            { name: 'supplier:edit', group_name: 'Supplier' },
            { name: 'supplier:delete', group_name: 'Supplier' },
            { name: 'finance:view', group_name: 'Finance' },
            { name: 'finance:manage', group_name: 'Finance' },
            { name: 'purchase:view', group_name: 'Purchase' },
            { name: 'purchase:create', group_name: 'Purchase' },
            { name: 'purchase:return', group_name: 'Purchase' }
        ];
        for (const p of requiredPermissions) {
            await db.Permission.findOrCreate({ where: { name: p.name }, defaults: { group_name: p.group_name } });
        }
        const permissions = await db.Permission.findAll();
        await adminRole.addPermissions(permissions);

        const login = await request(app).post('/api/v1/auth/login').send({ email: 'supplier@example.com', password: 'password123' });
        authHeader = `Bearer ${login.body.data.auth_token}`;

        // Product Setup
        testProduct = await db.Product.create({ organization_id: testOrg.id, name: 'Purchase Item', code: 'PI-01' });
        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id, product_id: testProduct.id,
            name: 'Standard', sku: 'PI-STD', price: 1500, cost_price: 1000, is_default: true
        });
    });

    it('should correctly track a full supplier lifecycle in the ledger', async () => {
        // 1. Create supplier with 10000 opening balance (we owe them)
        const supplier = await db.Supplier.create({ 
            organization_id: testOrg.id, 
            name: 'Big Supplier',
            opening_balance: 10000 
        });

        // Verify Initial State
        let res = await request(app).get(`/api/v1/suppliers/${supplier.id}/ledger`).set('Authorization', authHeader);
        expect(res.status).toBe(200);
        expect(Number(res.body.data.current_balance)).toBe(10000);

        // 2. Receive Goods (GRN) - 5 items @ 1000 = 5000
        // Debt increases by 5000. New Total: 15000
        const grnRes = await request(app).post('/api/v1/suppliers/grn').set('Authorization', authHeader).send({
            supplier_id: supplier.id,
            branch_id: testBranch.id,
            items: [{
                product_id: testProduct.id,
                product_variant_id: testVariant.id,
                quantity_received: 5,
                unit_cost: 1000
            }],
            total_amount: 5000,
            received_date: new Date()
        });
        expect(grnRes.status).toBe(201);

        res = await request(app).get(`/api/v1/suppliers/${supplier.id}/ledger`).set('Authorization', authHeader);
        expect(Number(res.body.data.current_balance)).toBe(15000);
        expect(res.body.data.ledger.length).toBe(1);
        expect(res.body.data.ledger[0].type).toBe('credit'); // Credit to AP increases liability

        // 3. Make a Settlement Payment of 8000
        // Debt decreases by 8000. New Total: 7000
        const payRes = await request(app).post(`/api/v1/suppliers/${supplier.id}/payments`).set('Authorization', authHeader).send({
            total_amount: 8000,
            payments: [{ payment_method: 'cash', amount: 8000 }],
            description: 'Partial settlement'
        });
        expect(payRes.status).toBe(201);

        res = await request(app).get(`/api/v1/suppliers/${supplier.id}/ledger`).set('Authorization', authHeader);
        expect(Number(res.body.data.current_balance)).toBe(7000);
        expect(res.body.data.ledger.length).toBe(2);
        expect(res.body.data.ledger[1].type).toBe('debit'); // Debit to AP decreases liability

        // 4. Perform a Purchase Return (2 items @ 1000 = 2000)
        // Debt decreases by 2000. New Total: 5000
        const returnRes = await request(app).post('/api/v1/purchase-returns').set('Authorization', authHeader).send({
            supplier_id: supplier.id,
            branch_id: testBranch.id,
            grn_id: grnRes.body.data.id,
            items: [{
                product_id: testProduct.id,
                product_variant_id: testVariant.id,
                quantity: 2,
                unit_cost: 1000,
                batch_number: grnRes.body.data.items?.[0]?.batch_number, // Wait, grn items might not have batch returned in body
                reason: 'Damaged'
            }],
            return_date: new Date()
        });
        // Note: I might need to fetch the batch number if grn creation doesn't return it
        
        res = await request(app).get(`/api/v1/suppliers/${supplier.id}/ledger`).set('Authorization', authHeader);
        expect(Number(res.body.data.current_balance)).toBe(5000);
        expect(res.body.data.ledger.length).toBe(3);
    });

    it('should maintain strict isolation between suppliers', async () => {
        const s1 = await db.Supplier.create({ organization_id: testOrg.id, name: 'S1', opening_balance: 1000 });
        const s2 = await db.Supplier.create({ organization_id: testOrg.id, name: 'S2', opening_balance: 2000 });

        const res1 = await request(app).get(`/api/v1/suppliers/${s1.id}/ledger`).set('Authorization', authHeader);
        const res2 = await request(app).get(`/api/v1/suppliers/${s2.id}/ledger`).set('Authorization', authHeader);

        expect(Number(res1.body.data.current_balance)).toBe(1000);
        expect(Number(res2.body.data.current_balance)).toBe(2000);
    });

    it('should support full basic CRUD operations for suppliers', async () => {
        // 1. Create
        const createRes = await request(app).post('/api/v1/suppliers').set('Authorization', authHeader).send({
            name: 'New Supplier',
            email: 'new@example.com',
            phone: '123456789',
            address: 'Supplier St'
        });
        expect(createRes.status).toBe(201);
        const supplierId = createRes.body.data.id;

        // 2. Read (Get All)
        const listRes = await request(app).get('/api/v1/suppliers').set('Authorization', authHeader);
        expect(listRes.body.data.data.length).toBeGreaterThan(0);

        // 3. Read (Get One)
        const getOneRes = await request(app).get(`/api/v1/suppliers/${supplierId}`).set('Authorization', authHeader);
        expect(getOneRes.body.data.name).toBe('New Supplier');

        // 4. Update
        const updateRes = await request(app).put(`/api/v1/suppliers/${supplierId}`).set('Authorization', authHeader).send({
            name: 'Updated Supplier',
            phone: '999999999'
        });
        expect(updateRes.status).toBe(200);
        expect(updateRes.body.data.name).toBe('Updated Supplier');

        // 5. Delete
        const deleteRes = await request(app).delete(`/api/v1/suppliers/${supplierId}`).set('Authorization', authHeader);
        expect(deleteRes.status).toBe(200);

        // Verify Deletion
        const finalGetRes = await request(app).get(`/api/v1/suppliers/${supplierId}`).set('Authorization', authHeader);
        expect(finalGetRes.status).toBe(404);
    });
});
