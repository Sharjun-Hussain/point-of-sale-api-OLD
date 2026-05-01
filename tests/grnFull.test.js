const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('GRN (Goods Received Note) Deep Dive Verification', () => {
    let authHeader;
    let testOrg, testBranch, testUser;
    let testProduct, testVariant, testSupplier;

    beforeAll(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        const tables = [
            'transactions', 'grn_items', 'grns', 'stocks', 'product_batches', 
            'product_variants', 'products', 'suppliers', 'accounts', 'users', 
            'roles', 'branches', 'organizations'
        ];
        for (const table of tables) {
            try { await db.sequelize.query(`DELETE FROM ${table}`); } catch (err) {}
        }
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        testOrg = await db.Organization.create({ name: 'GRN Test Org', status: 'active' });
        testBranch = await db.Branch.create({ organization_id: testOrg.id, name: 'Warehouse', branch_code: 'WH-01', status: 'active' });
        
        // Setup Accounts
        await db.Account.create({ organization_id: testOrg.id, name: 'Accounts Payable', code: '2100', type: 'liability', balance: 0 });
        await db.Account.create({ organization_id: testOrg.id, name: 'Inventory Asset', code: '1200', type: 'asset', balance: 0 });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id, branch_id: testBranch.id,
            name: 'GRN Manager', username: 'grnmanager', email: 'grn@example.com',
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

        const login = await request(app).post('/api/v1/auth/login').send({ email: 'grn@example.com', password: 'password123' });
        authHeader = `Bearer ${login.body.data.auth_token}`;

        testSupplier = await db.Supplier.create({ organization_id: testOrg.id, name: 'GRN Supplier' });
        testProduct = await db.Product.create({ organization_id: testOrg.id, name: 'Stock Item', code: 'SI-01' });
        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id, product_id: testProduct.id,
            name: 'Standard', sku: 'SI-STD', cost_price: 100, price: 200, is_default: true
        });
    });

    it('should correctly process a complex GRN with free quantities and price updates', async () => {
        // 1. Create GRN
        // Received: 10 units @ 500
        // Free: 2 units
        // Selling Price: 800
        const grnRes = await request(app).post('/api/v1/suppliers/grn').set('Authorization', authHeader).send({
            supplier_id: testSupplier.id,
            branch_id: testBranch.id,
            items: [{
                product_id: testProduct.id,
                product_variant_id: testVariant.id,
                quantity_received: 10,
                free_qty: 2,
                unit_cost: 500,
                selling_price: 800,
                batch_number: 'B-100'
            }],
            total_amount: 5000, // 10 * 500
            received_date: new Date()
        });
        expect(grnRes.status).toBe(201);

        // 2. Verify Stock Quantity (10 received + 2 free = 12 total)
        const stock = await db.Stock.findOne({
            where: { product_id: testProduct.id, product_variant_id: testVariant.id }
        });
        expect(Number(stock.quantity)).toBe(12);

        // 3. Verify Batch Quantity and Prices
        const batch = await db.ProductBatch.findOne({
            where: { product_id: testProduct.id, batch_number: 'B-100' }
        });
        expect(Number(batch.quantity)).toBe(12);
        expect(Number(batch.cost_price)).toBe(500);
        expect(Number(batch.selling_price)).toBe(800);

        // 4. Verify Master Price Update (ProductVariant should be updated)
        const variant = await db.ProductVariant.findByPk(testVariant.id);
        expect(Number(variant.cost_price)).toBe(500);
        expect(Number(variant.price)).toBe(800);

        // 5. Verify Accounting (AP Credit: 5000, Inventory Debit: 5000)
        // Free quantities should NOT increase the ledger total
        const apAccount = await db.Account.findOne({ where: { organization_id: testOrg.id, code: '2100' } });
        const invAccount = await db.Account.findOne({ where: { organization_id: testOrg.id, code: '1200' } });

        const txs = await db.Transaction.findAll({ where: { reference_id: grnRes.body.data.id } });
        expect(txs.length).toBe(2);

        const apTx = txs.find(t => t.account_id === apAccount.id);
        const invTx = txs.find(t => t.account_id === invAccount.id);

        expect(apTx.type).toBe('credit');
        expect(Number(apTx.amount)).toBe(5000);

        expect(invTx.type).toBe('debit');
        expect(Number(invTx.amount)).toBe(5000);
    });

    it('should correctly link GRN to a Purchase Order and update it', async () => {
        // 1. Create PO for 20 units
        const po = await db.PurchaseOrder.create({
            organization_id: testOrg.id, branch_id: testBranch.id, supplier_id: testSupplier.id,
            user_id: testUser.id,
            po_number: 'PO-GRN-1', status: 'ordered', total_amount: 20000
        });
        await db.PurchaseOrderItem.create({
            organization_id: testOrg.id, purchase_order_id: po.id,
            product_id: testProduct.id, product_variant_id: testVariant.id,
            quantity: 20, unit_cost: 1000, total_amount: 20000
        });

        // 2. Receive 20 units via GRN
        const grnRes = await request(app).post('/api/v1/suppliers/grn').set('Authorization', authHeader).send({
            supplier_id: testSupplier.id,
            branch_id: testBranch.id,
            purchase_order_id: po.id,
            items: [{
                product_id: testProduct.id,
                product_variant_id: testVariant.id,
                quantity_received: 20,
                unit_cost: 1000
            }],
            total_amount: 20000
        });
        expect(grnRes.status).toBe(201);

        // 3. Verify PO Status is now 'received'
        const updatedPo = await db.PurchaseOrder.findByPk(po.id);
        expect(updatedPo.status).toBe('received');
        
        // 4. Verify PO Item quantity_received
        const poItem = await db.PurchaseOrderItem.findOne({ where: { purchase_order_id: po.id } });
        expect(Number(poItem.quantity_received)).toBe(20);
    });
});
