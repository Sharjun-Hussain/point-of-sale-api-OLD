const db = require('../src/models');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function bootstrap() {
    try {
        console.log('🚀 Starting Database Bootstrap from Models...');

        // 1. Sync Schema (Create tables if they don't exist)
        // We use force: false to avoid accidental data loss if some tables exist
        await db.sequelize.sync({ force: false });
        console.log('✅ Database schema created/synced with models.');

        // 2. Seed Essential Data
        console.log('🌱 Seeding essential system data...');

        // 2a. Seed Permissions
        const modules = [
            'USER', 'ROLE', 'PERMISSION', 'ORGANIZATION', 'BRANCH', 'PRODUCT', 
            'SUPPLIER', 'CUSTOMER', 'PURCHASE_ORDER', 'PURCHASE_RETURN', 'BRAND', 
            'CATEGORY', 'UNIT', 'EXPENSE', 'SETTING', 'SALE', 'ACCOUNT', 'CHEQUE', 
            'STOCK', 'REPORT', 'AUDIT'
        ];
        
        const actions = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT'];
        const permissionData = [];

        for (const module of modules) {
            for (const action of actions) {
                permissionData.push({
                    id: crypto.randomUUID(),
                    name: `${action}_${module}`,
                    group_name: module,
                    description: `Can ${action.toLowerCase()} ${module.toLowerCase()}s`,
                    created_at: new Date(),
                    updated_at: new Date()
                });
            }
        }

        // Insert permissions avoiding duplicates
        for (const perm of permissionData) {
            await db.Permission.findOrCreate({
                where: { name: perm.name },
                defaults: perm
            });
        }
        console.log(`✅ ${permissionData.length} permissions verified/created.`);

        // 2b. Seed Admin Role
        const [adminRole] = await db.Role.findOrCreate({
            where: { name: 'Admin' },
            defaults: {
                id: crypto.randomUUID(),
                description: 'Super Administrator with full system access',
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        // Link all permissions to Admin
        const allPermissions = await db.Permission.findAll();
        await adminRole.setPermissions(allPermissions);
        console.log('✅ Admin role created and fully authorized.');

        // 2c. Seed Business Plans
        const plans = [
            {
                id: crypto.randomUUID(),
                name: 'Basic',
                description: 'Standard plan for single branch shops',
                price_monthly: 0.00,
                price_yearly: 0.00,
                max_branches: 1,
                max_users: 5,
                features: ['basic_pos', 'inventory_management'],
                is_active: true
            },
            {
                id: crypto.randomUUID(),
                name: 'Pro',
                description: 'Perfect for growing businesses with multiple branches',
                price_monthly: 29.99,
                price_yearly: 299.00,
                max_branches: 5,
                max_users: 20,
                features: ['basic_pos', 'inventory_management', 'advanced_reports', 'multiple_branches'],
                is_active: true
            },
            {
                id: crypto.randomUUID(),
                name: 'Enterprise',
                description: 'Unlimited power for large retail chains',
                price_monthly: 99.99,
                price_yearly: 999.00,
                max_branches: -1,
                max_users: -1,
                features: ['all_features', 'dedicated_support', 'unlimited_branches'],
                is_active: true
            }
        ];

        for (const plan of plans) {
            await db.BusinessPlan.findOrCreate({
                where: { name: plan.name },
                defaults: {
                    ...plan,
                    features: plan.features, // JSON
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });
        }
        console.log('✅ Default business plans created.');

        // 3. Mark all migrations as completed in SequelizeMeta
        console.log('📑 Synchronizing migration history...');
        const migrationsDir = path.join(__dirname, '../migrations');
        if (fs.existsSync(migrationsDir)) {
            const migrationFiles = fs.readdirSync(migrationsDir)
                .filter(file => file.endsWith('.js'))
                .sort();

            // Create SequelizeMeta table if it doesn't exist
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
        console.log('You can now log in and use the application.');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Bootstrap failed:', error);
        process.exit(1);
    }
}

bootstrap();
