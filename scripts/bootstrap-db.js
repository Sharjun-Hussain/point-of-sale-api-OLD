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
        // Note: alter: true is disabled here to avoid "Too many keys specified" errors on some systems.
        // Schema changes should be handled via migrations for production stability.
        await db.sequelize.sync({ alter: false });

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
                await db[modelName].sync({ alter: false });
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
            // Attribute Management
            { name: 'attr:view', group_name: 'Attribute', description: 'View product attributes' },
            { name: 'attr:create', group_name: 'Attribute', description: 'Create product attributes' },
            { name: 'attr:edit', group_name: 'Attribute', description: 'Edit product attributes' },
            { name: 'attr:delete', group_name: 'Attribute', description: 'Delete product attributes' },
            
            // Brand Management
            { name: 'brand:view', group_name: 'Brand', description: 'View brands' },
            { name: 'brand:create', group_name: 'Brand', description: 'Create brands' },
            { name: 'brand:edit', group_name: 'Brand', description: 'Edit brands' },
            { name: 'brand:delete', group_name: 'Brand', description: 'Delete brands' },
            { name: 'brand:manage', group_name: 'Brand', description: 'Manage brand groups' },
            
            // Branch Management
            { name: 'branch:view', group_name: 'Branch', description: 'View branch details' },
            { name: 'branch:create', group_name: 'Branch', description: 'Create new branches' },
            { name: 'branch:edit', group_name: 'Branch', description: 'Edit branch configuration' },
            { name: 'branch:delete', group_name: 'Branch', description: 'Decommission branches' },
            
            // Category Management
            { name: 'category:view', group_name: 'Category', description: 'View categories' },
            { name: 'category:create', group_name: 'Category', description: 'Create product categories' },
            { name: 'category:edit', group_name: 'Category', description: 'Edit category structures' },
            { name: 'category:delete', group_name: 'Category', description: 'Delete categories' },
            { name: 'category:manage', group_name: 'Category', description: 'Full category administration' },
            { name: 'category:manage_main', group_name: 'Category', description: 'Manage parent categories' },
            { name: 'category:manage_sub', group_name: 'Category', description: 'Manage child categories' },
            
            // Container Management
            { name: 'container:view', group_name: 'Container', description: 'View storage containers' },
            { name: 'container:create', group_name: 'Container', description: 'Create containers' },
            { name: 'container:edit', group_name: 'Container', description: 'Modify containers' },
            { name: 'container:delete', group_name: 'Container', description: 'Remove containers' },
            
            // Customer Management
            { name: 'customer:view', group_name: 'Customer', description: 'View customer database' },
            { name: 'customer:create', group_name: 'Customer', description: 'Register new customers' },
            { name: 'customer:edit', group_name: 'Customer', description: 'Edit customer profiles' },
            { name: 'customer:delete', group_name: 'Customer', description: 'Remove customers' },
            
            // Employee Management
            { name: 'employee:view', group_name: 'Employee', description: 'View employee records' },
            { name: 'employee:create', group_name: 'Employee', description: 'Enroll new staff' },
            { name: 'employee:edit', group_name: 'Employee', description: 'Update HR files' },
            { name: 'employee:delete', group_name: 'Employee', description: 'Terminate employment records' },
            
            // Expense Management
            { name: 'expense:view', group_name: 'Finance', description: 'View expenditure' },
            { name: 'expense:create', group_name: 'Finance', description: 'Record expenses' },
            { name: 'expense:edit', group_name: 'Finance', description: 'Modify expense logs' },
            { name: 'expense:delete', group_name: 'Finance', description: 'Delete expenses' },
            { name: 'expense:manage', group_name: 'Finance', description: 'Manage expense categories' },
            
            // Finance & Accounting
            { name: 'finance:view', group_name: 'Finance', description: 'Access financial data' },
            { name: 'finance:manage', group_name: 'Finance', description: 'Manage ledger and accounts' },
            { name: 'account:manage', group_name: 'Finance', description: 'Configure chart of accounts' },
            { name: 'cheque:manage', group_name: 'Finance', description: 'Process cheque payments' },
            
            // Organization Control
            { name: 'org:view', group_name: 'Organization', description: 'Monitor organization health' },
            { name: 'org:create', group_name: 'Organization', description: 'Onboard new organizations' },
            { name: 'org:edit', group_name: 'Organization', description: 'Edit organizational identity' },
            { name: 'org:delete', group_name: 'Organization', description: 'Purge organization data' },
            
            // Product Management
            { name: 'product:view', group_name: 'Product', description: 'View product catalog' },
            { name: 'product:create', group_name: 'Product', description: 'Create new products' },
            { name: 'product:edit', group_name: 'Product', description: 'Edit existing products' },
            { name: 'product:delete', group_name: 'Product', description: 'Remove from catalog' },
            { name: 'product:variant_status', group_name: 'Product', description: 'Toggle variant availability' },
            { name: 'product_variant:view', group_name: 'Product', description: 'View specific variants' },
            { name: 'product_variant:create', group_name: 'Product', description: 'Create product variants' },
            { name: 'product_variant:edit', group_name: 'Product', description: 'Modify variants' },
            
            // Purchase & Procurement
            { name: 'purchase:view', group_name: 'Purchase', description: 'View purchase history' },
            { name: 'purchase:create', group_name: 'Purchase', description: 'Initiate purchase orders' },
            { name: 'purchase:edit', group_name: 'Purchase', description: 'Edit GRN and orders' },
            { name: 'purchase:delete', group_name: 'Purchase', description: 'Cancel procurement' },
            { name: 'purchase_return:view', group_name: 'Purchase', description: 'View purchase returns' },
            { name: 'purchase_return:create', group_name: 'Purchase', description: 'Process returns to supplier' },
            
            // Role Management
            { name: 'role:view', group_name: 'Role', description: 'View security roles' },
            { name: 'role:create', group_name: 'Role', description: 'Define new roles' },
            { name: 'role:edit', group_name: 'Role', description: 'Edit role permissions' },
            { name: 'role:delete', group_name: 'Role', description: 'Delete access roles' },
            
            // Sale & POS
            { name: 'sale:view', group_name: 'Sale', description: 'View sale transactions' },
            { name: 'sale:create', group_name: 'Sale', description: 'Perform new sales' },
            { name: 'sale:edit', group_name: 'Sale', description: 'Modify sale records' },
            { name: 'sale:delete', group_name: 'Sale', description: 'Void sales' },
            { name: 'pos:access', group_name: 'Sale', description: 'Authorize POS login' },
            { name: 'shift:view', group_name: 'Sale', description: 'View POS shifts' },
            { name: 'shift:create', group_name: 'Sale', description: 'Open new shifts' },
            { name: 'shift:manage', group_name: 'Sale', description: 'Close and reconcile shifts' },
            { name: 'sale_return:view', group_name: 'Sale', description: 'View sale returns' },
            { name: 'sale_return:create', group_name: 'Sale', description: 'Process customer returns' },
            
            // Stock & Inventory
            { name: 'stock:view', group_name: 'Inventory', description: 'View live inventory' },
            { name: 'stock:create', group_name: 'Inventory', description: 'Initialize inventory' },
            { name: 'stock:edit', group_name: 'Inventory', description: 'Modify stock counts' },
            { name: 'stock:delete', group_name: 'Inventory', description: 'Purge stock records' },
            { name: 'stock:adjust', group_name: 'Inventory', description: 'Perform stock adjustments' },
            { name: 'stock:transfer', group_name: 'Inventory', description: 'Transfer between branches' },
            
            // Supplier Management
            { name: 'supplier:view', group_name: 'Purchase', description: 'View suppliers' },
            { name: 'supplier:create', group_name: 'Purchase', description: 'Add suppliers' },
            { name: 'supplier:edit', group_name: 'Purchase', description: 'Edit supplier details' },
            { name: 'supplier:delete', group_name: 'Purchase', description: 'Remove suppliers' },
            
            // Unit of Measurement
            { name: 'unit:view', group_name: 'Unit', description: 'View units' },
            { name: 'unit:create', group_name: 'Unit', description: 'Create units' },
            { name: 'unit:edit', group_name: 'Unit', description: 'Edit units' },
            { name: 'unit:delete', group_name: 'Unit', description: 'Delete units' },
            { name: 'unit:manage', group_name: 'Unit', description: 'Global unit management' },
            
            // System Settings
            { name: 'settings:general:update', group_name: 'Settings', description: 'Manage regional settings' },
            { name: 'settings:business:update', group_name: 'Settings', description: 'Manage business identity' },
            { name: 'settings:pos:update', group_name: 'Settings', description: 'Configure terminal settings' },
            { name: 'settings:communication:update', group_name: 'Settings', description: 'Manage notifications' },
            { name: 'settings:import:update', group_name: 'Settings', description: 'Manage data migrations' },
            { name: 'settings:ai:update', group_name: 'Settings', description: 'Manage AI models' },
            { name: 'settings:health:update', group_name: 'Settings', description: 'Monitor system health' },
            { name: 'settings:report:update', group_name: 'Settings', description: 'Manage report templates' },
            { name: 'system:settings', group_name: 'Settings', description: 'Full root configuration' },
            { name: 'system:audit_log', group_name: 'Settings', description: 'Access forensic audit logs' },
            
            // Reports
            { name: 'report:view', group_name: 'Reports', description: 'Access report center' },
            { name: 'report:sales', group_name: 'Reports', description: 'View sales analytics' },
            { name: 'report:inventory', group_name: 'Reports', description: 'View inventory analytics' },
            { name: 'report:financial', group_name: 'Reports', description: 'View accounting reports' },
            
            // User Management
            { name: 'user:view', group_name: 'User', description: 'View user accounts' },
            { name: 'user:create', group_name: 'User', description: 'Create user logins' },
            { name: 'user:edit', group_name: 'User', description: 'Update user profiles' },
            { name: 'user:delete', group_name: 'User', description: 'Disable user access' },

            // Dashboard
            { name: 'dashboard:view', group_name: 'Dashboard', description: 'Access main dashboard' },
        ];

        // Remove duplicates
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

        // ── Organization Admin Role ───────────────────────────────────────────
        const [orgAdminRole] = await db.Role.findOrCreate({
            where: { name: 'Organization Admin' },
            defaults: { id: crypto.randomUUID(), description: 'Tenant Administrator Access' }
        });
        
        // Filter out restricted permissions for Org Admin
        const restrictedPerms = [
            'org:create', 'org:delete', 'org:edit', 'org:view',
            'system:audit_log'
        ];
        const orgAdminPerms = allPerms.filter(p => !restrictedPerms.includes(p.name));
        await orgAdminRole.setPermissions(orgAdminPerms);
        console.log(`✅ Organization Admin role assigned ${orgAdminPerms.length} permissions.`);

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
