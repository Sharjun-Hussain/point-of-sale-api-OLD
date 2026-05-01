const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Purchase Order Lifecycle & GRN Integration', () => {
    let authHeader;
    let testOrg, testBranch, testUser;
    let testProduct, testVariant, testSupplier;

    beforeAll(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        const tables = [
            'transactions', 'grn_items', 'grns', 'purchase_order_items', 'purchase_orders',
            'stocks', 'product_batches', 'product_variants', 'products', 
            'suppliers', 'accounts', 'users', 'roles', 'branches', 'organizations'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        testOrg = await db.Organization.create({ name: 'PO Test Org', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Warehouse', branch_code: 'WH-01', status: 'active' });
        
        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            name: 'PO Manager', username: 'pomanager', email: 'po@example.com',
            password: hashedPassword, status: 'active'
        });

        // Add permissions
        const adminRole = await db.Role.create({ name: 'Admin', is_system_role: true });
        await testUser.addRole(adminRole);
        
        const requiredPermissions = [
            { name: 'supplier:view', group_name: 'Supplier' },
            { name: 'purchase:view', group_name: 'Purchase' },
            { name: 'purchase:create', group_name: 'Purchase' },
            { name: 'purchase:edit', group_name: 'Purchase' },
            { name: 'purchase:manage', group_name: 'Purchase' },
            { name: 'purchase:delete', group_name: 'Purchase' }
        ];
        for (const p of requiredPermissions) {
            await db.Permission.findOrCreate({ where: { name: p.name }, defaults: { group_name: p.group_name } });
        }
        const permissions = await db.Permission.findAll();
        await adminRole.addPermissions(permissions);

        const login = await request(app).post('/api/v1/auth/login').send({ email: 'po@example.com', password: 'password123' });
        authHeader = `Bearer ${login.body.data.auth_token}`;

        testSupplier = await db.Supplier.create({ organization_id: testOrg.id, name: 'Primary Supplier' });
        testProduct = await db.Product.create({ organization_id: testOrg.id, name: 'PO Product', code: 'PO-P1' });
        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id, product_id: testProduct.id,
            name: 'Standard', sku: 'PO-P1-S', price: 1500, cost_price: 1000, is_default: true
        });
    });

    it('should correctly handle the full PO lifecycle', async () => {
        // 1. Create Purchase Order (Draft/Pending)
        const createRes = await request(app).post('/api/v1/purchase-orders').set('Authorization', authHeader).send({
            supplier_id: testSupplier.id,
            branch_id: testBranch.id,
            order_date: new Date(),
            items: [{
                product_id: testProduct.id,
                product_variant_id: testVariant.id,
                quantity: 10,
                unit_cost: 1000
            }]
        });
        expect(createRes.status).toBe(201);
        expect(createRes.body.data.status).toBe('pending');
        expect(Number(createRes.body.data.total_amount)).toBe(10000);
        const poId = createRes.body.data.id;

        // 2. Approve PO (status -> ordered)
        const approveRes = await request(app).patch(`/api/v1/purchase-orders/${poId}/approve`).set('Authorization', authHeader);
        expect(approveRes.status).toBe(200);
        expect(approveRes.body.data.status).toBe('ordered');

        // 3. Partial Receipt via GRN (Receive 4 items)
        // PO status should become 'partially_received'
        const partialGrnRes = await request(app).post('/api/v1/suppliers/grn').set('Authorization', authHeader).send({
            supplier_id: testSupplier.id,
            branch_id: testBranch.id,
            purchase_order_id: poId,
            items: [{
                product_id: testProduct.id,
                product_variant_id: testVariant.id,
                quantity_received: 4,
                unit_cost: 1000
            }],
            total_amount: 4000
        });
        expect(partialGrnRes.status).toBe(201);

        let poCheck = await request(app).get(`/api/v1/purchase-orders/${poId}`).set('Authorization', authHeader);
        expect(poCheck.body.data.status).toBe('partially_received');

        // 4. Full Receipt via GRN (Receive remaining 6 items)
        // PO status should become 'received'
        const fullGrnRes = await request(app).post('/api/v1/suppliers/grn').set('Authorization', authHeader).send({
            supplier_id: testSupplier.id,
            branch_id: testBranch.id,
            purchase_order_id: poId,
            items: [{
                product_id: testProduct.id,
                product_variant_id: testVariant.id,
                quantity_received: 6,
                unit_cost: 1000
            }],
            total_amount: 6000
        });
        expect(fullGrnRes.status).toBe(201);

        poCheck = await request(app).get(`/api/v1/purchase-orders/${poId}`).set('Authorization', authHeader);
        expect(poCheck.body.data.status).toBe('received');
    });

    it('should allow cancelling a pending purchase order', async () => {
        const createRes = await request(app).post('/api/v1/purchase-orders').set('Authorization', authHeader).send({
            supplier_id: testSupplier.id,
            branch_id: testBranch.id,
            items: [{ product_id: testProduct.id, quantity: 5, unit_cost: 1000 }]
        });
        if (createRes.status !== 201) throw new Error(`PO Create Failed: ${JSON.stringify(createRes.body)}`);
        const poId = createRes.body.data.id;

        const cancelRes = await request(app).patch(`/api/v1/purchase-orders/${poId}/cancel`).set('Authorization', authHeader);
        expect(cancelRes.status).toBe(200);
        expect(cancelRes.body.data.status).toBe('cancelled');
    });
});
