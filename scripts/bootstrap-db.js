const db = require('../src/models');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

async function bootstrap() {
    try {
        console.log('🚀 Starting Database Bootstrap (Fresh Installation)...');

        // 1. Sync Schema (Create tables if they don't exist)
        // force: false ensures we don't drop tables if they already exist
        await db.sequelize.sync({ force: false });
        console.log('✅ Database schema created/synced with models.');

        // 2. Seed Essential Data
        console.log('🌱 Seeding essential system data...');

        // 2a. Seed Permissions (Comprehensive list from masterSeed)
        const permissionsSeed = [
            // Settings
            { name: 'Settings View', group_name: 'Settings' },
            { name: 'Settings Edit', group_name: 'Settings' },
            // Organization & Branch
            { name: 'Organization View', group_name: 'Organization' },
            { name: 'Organization Create', group_name: 'Organization' },
            { name: 'Organization Edit', group_name: 'Organization' },
            { name: 'Organization Delete', group_name: 'Organization' },
            { name: 'Branch View', group_name: 'Branch' },
            { name: 'Branch Create', group_name: 'Branch' },
            { name: 'Branch Edit', group_name: 'Branch' },
            { name: 'Branch Delete', group_name: 'Branch' },
            // User & Role
            { name: 'User View', group_name: 'User' },
            { name: 'User Create', group_name: 'User' },
            { name: 'User Edit', group_name: 'User' },
            { name: 'User Delete', group_name: 'User' },
            { name: 'Role View', group_name: 'Role' },
            { name: 'Role Create', group_name: 'Role' },
            { name: 'Role Edit', group_name: 'Role' },
            { name: 'Role Delete', group_name: 'Role' },
            // Product & Inventory
            { name: 'Product View', group_name: 'Product' },
            { name: 'Product Create', group_name: 'Product' },
            { name: 'Product Edit', group_name: 'Product' },
            { name: 'Product Delete', group_name: 'Product' },
            { name: 'Product Variant View', group_name: 'Product' },
            { name: 'Product Variant Create', group_name: 'Product' },
            { name: 'Product Variant Edit', group_name: 'Product' },
            { name: 'Product Variant Delete', group_name: 'Product' },
            { name: 'Product Variant Status', group_name: 'Product' },
            { name: 'Main Category View', group_name: 'Category' },
            { name: 'Main Category Create', group_name: 'Category' },
            { name: 'Main Category Edit', group_name: 'Category' },
            { name: 'Main Category Delete', group_name: 'Category' },
            { name: 'Sub Category View', group_name: 'Category' },
            { name: 'Sub Category Create', group_name: 'Category' },
            { name: 'Sub Category Edit', group_name: 'Category' },
            { name: 'Sub Category Delete', group_name: 'Category' },
            { name: 'Brand View', group_name: 'Brand' },
            { name: 'Brand Create', group_name: 'Brand' },
            { name: 'Brand Edit', group_name: 'Brand' },
            { name: 'Brand Delete', group_name: 'Brand' },
            { name: 'Unit View', group_name: 'Unit' },
            { name: 'Unit Create', group_name: 'Unit' },
            { name: 'Unit Edit', group_name: 'Unit' },
            { name: 'Unit Delete', group_name: 'Unit' },
            { name: 'Container View', group_name: 'Container' },
            { name: 'Container Create', group_name: 'Container' },
            { name: 'Container Edit', group_name: 'Container' },
            { name: 'Container Delete', group_name: 'Container' },
            // Sales & Customers
            { name: 'Sale View', group_name: 'Sale' },
            { name: 'Sale Create', group_name: 'Sale' },
            { name: 'Sale Edit', group_name: 'Sale' },
            { name: 'Sale Delete', group_name: 'Sale' },
            { name: 'Customer View', group_name: 'Customer' },
            { name: 'Customer Create', group_name: 'Customer' },
            { name: 'Customer Edit', group_name: 'Customer' },
            { name: 'Customer Delete', group_name: 'Customer' },
            { name: 'POS Access', group_name: 'POS' },
            // Purchases & Suppliers
            { name: 'Supplier View', group_name: 'Supplier' },
            { name: 'Supplier Create', group_name: 'Supplier' },
            { name: 'Supplier Edit', group_name: 'Supplier' },
            { name: 'Supplier Delete', group_name: 'Supplier' },
            { name: 'Purchase Order View', group_name: 'Purchase' },
            { name: 'Purchase Order Create', group_name: 'Purchase' },
            { name: 'Purchase Order Edit', group_name: 'Purchase' },
            { name: 'Purchase Order Delete', group_name: 'Purchase' },
            { name: 'GRN View', group_name: 'Purchase' },
            { name: 'GRN Create', group_name: 'Purchase' },
            // Finance & Accounting
            { name: 'Expense View', group_name: 'Finance' },
            { name: 'Expense Create', group_name: 'Finance' },
            { name: 'Expense Edit', group_name: 'Finance' },
            { name: 'Expense Delete', group_name: 'Finance' },
            { name: 'Accounting View', group_name: 'Finance' },
            { name: 'Report View', group_name: 'Report' }
        ];

        for (const perm of permissionsSeed) {
            await db.Permission.findOrCreate({
                where: { name: perm.name },
                defaults: {
                    ...perm,
                    id: crypto.randomUUID()
                }
            });
        }
        console.log(`✅ Verified/Created ${permissionsSeed.length} system permissions.`);

        // 2b. Seed Roles
        const [adminRole] = await db.Role.findOrCreate({
            where: { name: 'Super Admin' },
            defaults: { 
                id: crypto.randomUUID(),
                description: 'Full system access with all management capabilities' 
            }
        });
        
        // Assign all permissions to Super Admin
        const allPermissionInstances = await db.Permission.findAll();
        await adminRole.setPermissions(allPermissionInstances);
        console.log('✅ Created Super Admin role and assigned all permissions.');

        // 2c. Seed Master Organization & Branch
        const [org] = await db.Organization.findOrCreate({
            where: { email: 'admin@inzeedo.com' },
            defaults: {
                id: crypto.randomUUID(),
                name: 'Main Organization',
                email: 'admin@inzeedo.com',
                phone: '0112233445',
                address: 'No 1, Main Street, Colombo',
                business_type: 'Retail',
                status: 'active'
            }
        });

        const [branch] = await db.Branch.findOrCreate({
            where: { name: 'Central Branch', organization_id: org.id },
            defaults: {
                id: crypto.randomUUID(),
                email: 'central@inzeedo.com',
                phone: '0112233446',
                address: 'Colombo 01',
                status: 'active',
                organization_id: org.id
            }
        });
        console.log('✅ Created default Organization and Branch.');

        // 2d. Seed Super Admin User
        const passwordHash = await bcrypt.hash('Admin@123', 10);
        const [adminUser] = await db.User.findOrCreate({
            where: { email: 'admin@inzeedo.com' },
            defaults: {
                id: crypto.randomUUID(),
                name: 'Super Admin',
                email: 'admin@inzeedo.com',
                password: passwordHash,
                organization_id: org.id,
                status: 'active'
            }
        });

        await adminUser.setRoles([adminRole]);
        await adminUser.setBranches([branch]);
        console.log('✅ Created Super Admin user (admin@emipos.com / admin123).');

        // 2e. Seed Charts of Accounts
        const accounts = [
            { code: '1000', name: 'Cash on Hand', type: 'asset' },
            { code: '1010', name: 'Bank Account', type: 'asset' },
            { code: '1100', name: 'Accounts Receivable', type: 'asset' },
            { code: '1200', name: 'Inventory', type: 'asset' },
            { code: '2100', name: 'Accounts Payable', type: 'liability' },
            { code: '4000', name: 'Sales Revenue', type: 'revenue' },
            { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
            { code: '6000', name: 'General Expenses', type: 'expense' }
        ];

        for (const acc of accounts) {
            await db.Account.findOrCreate({
                where: { code: acc.code, organization_id: org.id },
                defaults: { ...acc, organization_id: org.id, status: 'active' }
            });
        }
        console.log('✅ Seeded default Charts of Accounts.');

        // 2f. Seed Basic Measurement Units
        const mUnits = [
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Gram', short_name: 'g' },
            { name: 'Liter', short_name: 'l' },
            { name: 'Piece', short_name: 'pcs' }
        ];
        for (const item of mUnits) {
            await db.MeasurementUnit.findOrCreate({ where: { short_name: item.short_name }, defaults: item });
        }
        console.log('✅ Seeded basic Measurement Units.');

        // 3. Mark all migrations as completed in SequelizeMeta
        console.log('📑 Synchronizing migration history...');
        const migrationsDir = path.join(__dirname, '../migrations');
        if (fs.existsSync(migrationsDir)) {
            const migrationFiles = fs.readdirSync(migrationsDir)
                .filter(file => file.endsWith('.js'))
                .sort();

            await db.sequelize.query(`
                CREATE TABLE IF NOT EXISTS SequelizeMeta (
                    name VARCHAR(255) NOT NULL,
                    PRIMARY KEY (name)
                ) ENGINE=InnoDB;
            `);

            for (const file of migrationFiles) {
                await db.sequelize.query(
                    'INSERT IGNORE INTO SequelizeMeta (name) VALUES (?)',
                    { replacements: [file] }
                );
            }
            console.log(`✅ Marked ${migrationFiles.length} migrations as completed.`);
        }

        console.log('\n✨ Database Bootstrap Successful!');
        console.log('Credentials: admin@inzeedo.com / Admin@123');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Bootstrap failed:', error);
        process.exit(1);
    }
}

bootstrap();
