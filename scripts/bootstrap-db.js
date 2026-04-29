const db = require('../src/models');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DataTypes } = require('sequelize');

/**
 * MASTER BOOTSTRAP CONFIGURATION
 * Industrial Grade Setup for Enterprise Production
 */
const MASTER_EMAIL = 'mrjoon005@gmail.com';
const MASTER_PASSWORD = 'Inzeedo@99';
const MASTER_ORG_NAME = 'Inzeedo';

// Environment Detection
const isDesktop = process.env.APP_PLATFORM === 'DESKTOP' || process.env.ELECTRON_RUNNING === 'true';
const isClearMode = process.argv.includes('--clear');

if (isDesktop) {
    console.log('🖥️  DESKTOP MODE DETECTED: Optimizing bootstrap for local environment...');
}

async function bootstrap() {
    try {
        console.log(`📡 Connecting as user: ${process.env.DB_USER || 'root'}`);

        if (isClearMode) {
            console.log('⚠️  CRITICAL: TOTAL database reset (--clear detected)...');
            // Disable FK checks so we can drop tables in any order
            await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
            // Drop every table manually — avoids Sequelize cyclic-reference bug with force:true
            const [tables] = await db.sequelize.query('SHOW TABLES');
            for (const row of tables) {
                const tableName = Object.values(row)[0];
                await db.sequelize.query(`DROP TABLE IF EXISTS \`${tableName}\``);
                console.log(`  🗑️  Dropped: ${tableName}`);
            }
            await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
            console.log('✅ All tables cleared.');
        }

        // 1. Sync Base Models
        // alter: true ensures ALL missing columns are added to existing tables.
        await db.sequelize.sync({ alter: true });

        // 2. Explicitly sync Join Tables
        // BelongsToMany associations sometimes skip custom columns (like is_primary) 
        // when auto-creating join tables. We force-sync each model to guarantee 'One Pattern' integrity.
        const joinModels = [
            'UserRole', 'RolePermission', 'UserBranch', 'EmployeeBranch',
            'SaleEmployee', 'ProductAttribute', 'ProductSupplier'
        ];

        console.log('🛡️  Applying Industrial One-Pattern to join tables...');
        for (const modelName of joinModels) {
            if (db[modelName]) {
                await db[modelName].sync({ alter: true });
                console.log(`   ✅ Validated: ${modelName}`);
            }
        }


        console.log('✅ Database schema synchronized.');
        console.log('🌱 Seeding master enterprise data...');

        // ── Permissions (98 entries — exact mirror of local DB) ──────────────
        const permissionsSeed = [
            // Attribute
            { name: 'attr:create', group_name: 'Attribute', description: 'Create attributes' },
            { name: 'attr:delete', group_name: 'Attribute', description: 'Delete attributes' },
            { name: 'attr:edit', group_name: 'Attribute', description: 'Edit attributes' },
            { name: 'attr:manage', group_name: 'Attribute', description: 'Manage attributes' },
            { name: 'attr:view', group_name: 'Attribute', description: 'View attributes' },
            // Branch
            { name: 'branch:create', group_name: 'Branch', description: 'Create branches' },
            { name: 'branch:delete', group_name: 'Branch', description: 'Delete branches' },
            { name: 'branch:edit', group_name: 'Branch', description: 'Edit branches' },
            { name: 'branch:view', group_name: 'Branch', description: 'View branches' },
            // Brand
            { name: 'brand:create', group_name: 'Brand', description: 'Create brands' },
            { name: 'brand:delete', group_name: 'Brand', description: 'Delete brands' },
            { name: 'brand:edit', group_name: 'Brand', description: 'Edit brands' },
            { name: 'brand:manage', group_name: 'Product', description: 'Manage brands' },
            { name: 'brand:view', group_name: 'Brand', description: 'View brands' },
            // Category
            { name: 'category:create', group_name: 'Category', description: 'Create categories' },
            { name: 'category:delete', group_name: 'Category', description: 'Delete categories' },
            { name: 'category:edit', group_name: 'Category', description: 'Edit categories' },
            { name: 'category:manage', group_name: 'Category', description: 'Manage categories' },
            { name: 'category:manage_main', group_name: 'Category', description: 'Manage main categories' },
            { name: 'category:manage_sub', group_name: 'Category', description: 'Manage sub categories' },
            { name: 'category:view', group_name: 'Category', description: 'View categories' },
            // Container
            { name: 'container:create', group_name: 'Container', description: 'Create containers' },
            { name: 'container:delete', group_name: 'Container', description: 'Delete containers' },
            { name: 'container:edit', group_name: 'Container', description: 'Edit containers' },
            { name: 'container:view', group_name: 'Container', description: 'View containers' },
            // Customer
            { name: 'customer:create', group_name: 'Customer', description: 'Create customers' },
            { name: 'customer:delete', group_name: 'Customer', description: 'Delete customers' },
            { name: 'customer:edit', group_name: 'Customer', description: 'Edit customers' },
            { name: 'customer:view', group_name: 'Customer', description: 'View customers' },
            // Dashboard
            { name: 'dashboard:view', group_name: 'Dashboard', description: 'View dashboard' },
            // Employee
            { name: 'employee:create', group_name: 'Employee', description: 'Enroll employees' },
            { name: 'employee:delete', group_name: 'Employee', description: 'Remove employees' },
            { name: 'employee:edit', group_name: 'Employee', description: 'Update HR records' },
            { name: 'employee:view', group_name: 'Employee', description: 'View HR records' },
            // Finance
            { name: 'account:manage', group_name: 'Finance', description: 'Manage chart of accounts' },
            { name: 'cheque:manage', group_name: 'Finance', description: 'Manage cheque transactions' },
            { name: 'expense:create', group_name: 'Finance', description: 'Record expenditure' },
            { name: 'expense:delete', group_name: 'Finance', description: 'Delete expense records' },
            { name: 'expense:edit', group_name: 'Finance', description: 'Modify expenditure' },
            { name: 'expense:manage', group_name: 'Finance', description: 'Manage expenses' },
            { name: 'expense:view', group_name: 'Finance', description: 'View expenses' },
            { name: 'finance:manage', group_name: 'Finance', description: 'Perform ledger entries' },
            { name: 'finance:view', group_name: 'Finance', description: 'Monitor accounts' },
            // Inventory (Stock movements logged under Inventory)
            { name: 'stock:adjust', group_name: 'Inventory', description: 'Adjust stock levels' },
            { name: 'stock:transfer', group_name: 'Inventory', description: 'Transfer stock between branches' },
            // Organization
            { name: 'org:create', group_name: 'Organization', description: 'Create organizations' },
            { name: 'org:delete', group_name: 'Organization', description: 'Delete organizations' },
            { name: 'org:edit', group_name: 'Organization', description: 'Update organization profile' },
            { name: 'org:view', group_name: 'Organization', description: 'View organization metadata' },
            // POS
            { name: 'pos:access', group_name: 'POS', description: 'Access POS workstation' },
            { name: 'shift:create', group_name: 'POS', description: 'Open POS shifts' },
            { name: 'shift:manage', group_name: 'POS', description: 'Close and manage POS shifts' },
            { name: 'shift:view', group_name: 'POS', description: 'View shift history' },
            // Procurement (Purchase Returns)
            { name: 'purchase_return:create', group_name: 'Procurement', description: 'Create purchase returns' },
            { name: 'purchase_return:view', group_name: 'Procurement', description: 'View purchase returns' },
            // Product
            { name: 'brand:manage', group_name: 'Product', description: 'Manage brands (product group)' },
            { name: 'product:create', group_name: 'Product', description: 'Create products' },
            { name: 'product:delete', group_name: 'Product', description: 'Delete products' },
            { name: 'product:edit', group_name: 'Product', description: 'Edit product details' },
            { name: 'product:variant_status', group_name: 'Product', description: 'Toggle product variant status' },
            { name: 'product:view', group_name: 'Product', description: 'View product catalog' },
            { name: 'product_variant:create', group_name: 'Product', description: 'Create product variants' },
            { name: 'product_variant:edit', group_name: 'Product', description: 'Edit product variants' },
            { name: 'unit:manage', group_name: 'Product', description: 'Manage measurement units (product group)' },
            // Purchase
            { name: 'purchase:create', group_name: 'Purchase', description: 'Create purchase orders' },
            { name: 'purchase:delete', group_name: 'Purchase', description: 'Delete purchase orders' },
            { name: 'purchase:edit', group_name: 'Purchase', description: 'Edit purchase orders (GRN)' },
            { name: 'purchase:view', group_name: 'Purchase', description: 'View procurement logs' },
            // Reports
            { name: 'report:financial', group_name: 'Reports', description: 'View financial reports' },
            { name: 'report:inventory', group_name: 'Reports', description: 'View inventory reports' },
            { name: 'report:sales', group_name: 'Reports', description: 'View sales reports' },
            { name: 'report:view', group_name: 'Reports', description: 'Access reporting module' },
            // Role
            { name: 'role:create', group_name: 'Role', description: 'Create access roles' },
            { name: 'role:delete', group_name: 'Role', description: 'Delete access roles' },
            { name: 'role:edit', group_name: 'Role', description: 'Edit role permissions' },
            { name: 'role:view', group_name: 'Role', description: 'View access roles' },
            // Sale
            { name: 'sale:create', group_name: 'Sale', description: 'Process new sales' },
            { name: 'sale:delete', group_name: 'Sale', description: 'Void processed sales' },
            { name: 'sale:edit', group_name: 'Sale', description: 'Edit sale records' },
            { name: 'sale:view', group_name: 'Sale', description: 'View sales history' },
            // Sale Returns
            { name: 'sale_return:create', group_name: 'Sales', description: 'Process sale returns' },
            { name: 'sale_return:view', group_name: 'Sales', description: 'View sale returns' },
            // Settings
            { name: 'settings:edit', group_name: 'Settings', description: 'Edit system settings' },
            { name: 'settings:view', group_name: 'Settings', description: 'View system settings' },
            // Stock
            { name: 'stock:create', group_name: 'Stock', description: 'Create stock records' },
            { name: 'stock:delete', group_name: 'Stock', description: 'Delete stock records' },
            { name: 'stock:edit', group_name: 'Stock', description: 'Edit stock records' },
            { name: 'stock:view', group_name: 'Stock', description: 'View stock levels' },
            // Supplier
            { name: 'supplier:create', group_name: 'Supplier', description: 'Enroll new suppliers' },
            { name: 'supplier:delete', group_name: 'Supplier', description: 'Remove suppliers' },
            { name: 'supplier:edit', group_name: 'Supplier', description: 'Update supplier details' },
            { name: 'supplier:view', group_name: 'Supplier', description: 'View supplier list' },
            // System
            { name: 'system:audit_log', group_name: 'System', description: 'View activity audit logs' },
            { name: 'system:settings', group_name: 'System', description: 'Manage system configuration' },
            // Unit
            { name: 'unit:create', group_name: 'Unit', description: 'Create measurement units' },
            { name: 'unit:delete', group_name: 'Unit', description: 'Delete measurement units' },
            { name: 'unit:edit', group_name: 'Unit', description: 'Edit measurement units' },
            { name: 'unit:view', group_name: 'Unit', description: 'View measurement units' },
            // User
            { name: 'user:create', group_name: 'User', description: 'Create system users' },
            { name: 'user:delete', group_name: 'User', description: 'Delete system users' },
            { name: 'user:edit', group_name: 'User', description: 'Edit user profiles' },
            { name: 'user:view', group_name: 'User', description: 'View system users' },
        ];

        // Remove duplicates (brand:manage appears in both Brand and Product group in local DB)
        const uniquePerms = permissionsSeed.filter(
            (p, idx, self) => idx === self.findIndex(q => q.name === p.name)
        );

        for (const perm of uniquePerms) {
            await db.Permission.findOrCreate({
                where: { name: perm.name },
                defaults: { ...perm, id: crypto.randomUUID() }
            });
        }
        console.log(`✅ Seeded ${uniquePerms.length} permissions.`);

        // ── Super Admin Role ──────────────────────────────────────────────────
        const [adminRole] = await db.Role.findOrCreate({
            where: { name: 'Super Admin' },
            defaults: { id: crypto.randomUUID(), description: 'Global Industrial Access' }
        });
        const allPerms = await db.Permission.findAll();
        await adminRole.setPermissions(allPerms);
        console.log(`✅ Super Admin role assigned ${allPerms.length} permissions.`);

        // ── Master Organization ───────────────────────────────────────────────
        const [org] = await db.Organization.findOrCreate({
            where: { email: MASTER_EMAIL },
            defaults: {
                id: crypto.randomUUID(),
                name: MASTER_ORG_NAME,
                email: MASTER_EMAIL,
                phone: '0112233445',
                address: 'Main Enterprise Headquarters',
                business_type: 'Industrial Retail',
                subscription_tier: 'Enterprise',
                billing_cycle: 'Lifetime',
                subscription_status: 'Active',
                is_active: true
            }
        });
        console.log(`✅ Organization [${org.name}] ready.`);

        // ── Main Branch ───────────────────────────────────────────────────────
        const [branch] = await db.Branch.findOrCreate({
            where: { name: 'Main Branch', organization_id: org.id },
            defaults: {
                id: crypto.randomUUID(),
                email: MASTER_EMAIL,
                address: 'Central Station',
                is_main: true,
                is_active: true,
                organization_id: org.id
            }
        });
        console.log(`✅ Branch [${branch.name}] ready.`);

        // ── Super Admin User ──────────────────────────────────────────────────
        const passwordHash = await bcrypt.hash(MASTER_PASSWORD, 10);
        const [adminUser] = await db.User.findOrCreate({
            where: { email: MASTER_EMAIL },
            defaults: {
                id: crypto.randomUUID(),
                name: 'Super Admin',
                email: MASTER_EMAIL,
                password: passwordHash,
                organization_id: org.id,
                is_active: true
            }
        });
        await adminUser.setRoles([adminRole]);
        await adminUser.setBranches([branch]);
        console.log(`✅ Super Admin user [${MASTER_EMAIL}] ready.`);

        // ── Charts of Accounts ────────────────────────────────────────────────
        const accounts = [
            { code: '1000', name: 'Cash on Hand', type: 'asset' },
            { code: '1010', name: 'Bank Account', type: 'asset' },
            { code: '1100', name: 'Accounts Receivable', type: 'asset' },
            { code: '2100', name: 'Accounts Payable', type: 'liability' },
            { code: '4000', name: 'Sales Revenue', type: 'revenue' },
            { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
            { code: '6000', name: 'General Expenses', type: 'expense' }
        ];
        for (const acc of accounts) {
            await db.Account.findOrCreate({
                where: { code: acc.code, organization_id: org.id },
                defaults: { ...acc, organization_id: org.id, is_active: true }
            });
        }
        console.log('✅ Charts of Accounts seeded.');

        // ── Measurement Units ─────────────────────────────────────────────────
        const mUnits = [
            { name: 'Piece', short_name: 'pcs' },
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Gram', short_name: 'g' },
            { name: 'Liter', short_name: 'l' }
        ];
        for (const u of mUnits) {
            await db.MeasurementUnit.findOrCreate({ where: { short_name: u.short_name }, defaults: u });
        }
        console.log('✅ Measurement Units seeded.');

        console.log('\n╔══════════════════════════════════════╗');
        console.log('║  ✨ MASTER BOOTSTRAP SUCCESSFUL!      ║');
        if (isClearMode)
            console.log('║  ⚠️  Database was TOTALLY reset.      ║');
        console.log(`║  👤 ${MASTER_EMAIL}  ║`);
        console.log(`║  🔑 ${MASTER_PASSWORD}                     ║`);
        console.log('╚══════════════════════════════════════╝\n');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Master Bootstrap failed:', error);
        process.exit(1);
    }
}

bootstrap();
