require('dotenv').config();
const {
    sequelize,
    Permission,
    Role,
    Organization,
    Branch,
    User,
    Account,
    MainCategory,
    SubCategory,
    Brand,
    Unit,
    MeasurementUnit,
    Container
} = require('../models');
const bcrypt = require('bcryptjs');

const seed = async () => {
    try {
        console.log('🌱 Starting Master Seed...');

        // 0. Sync Database
        await sequelize.sync({ alter: true });
        console.log('✅ Database schema synchronized.');

        // 1. Permissions
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
            await Permission.findOrCreate({
                where: { name: perm.name },
                defaults: perm
            });
        }
        console.log(`✅ Seeded ${permissionsSeed.length} permissions.`);

        // 2. Roles
        const [adminRole] = await Role.findOrCreate({
            where: { name: 'Super Admin' },
            defaults: { description: 'Full system access' }
        });
        const [managerRole] = await Role.findOrCreate({
            where: { name: 'Manager' },
            defaults: { description: 'Branch management access' }
        });

        // Assign all permissions to Super Admin
        const allPermissionInstances = await Permission.findAll();
        await adminRole.setPermissions(allPermissionInstances);
        console.log('✅ Created Super Admin role and assigned all permissions.');

        // 3. Organization & Branch
        const [org] = await Organization.findOrCreate({
            where: { name: 'Main Organization' },
            defaults: {
                email: 'mrjoon005@gmail.com',
                phone: '0757340891',
                address: 'No 1, Main Street, Colombo',
                business_type: 'Retail',
                status: 'active'
            }
        });

        const [branch] = await Branch.findOrCreate({
            where: { name: 'Central Branch', organization_id: org.id },
            defaults: {
                email: 'hello@inzeedo.com',
                phone: '0112233446',
                address: 'Colombo 01',
                status: 'active'
            }
        });
        console.log('✅ Created default Organization and Branch.');

        // 4. Super Admin User
        const passwordHash = await bcrypt.hash('admin123', 10);
        const [adminUser] = await User.findOrCreate({
            where: { email: 'mrjoon005@gmail.com' },
            defaults: {
                name: 'Super Admin',
                password: passwordHash,
                organization_id: org.id,
                status: 'active'
            }
        });

        await adminUser.setRoles([adminRole]);
        await adminUser.setBranches([branch]);
        console.log('✅ Created Super Admin user (mrjoon005@gmail.com / admin123).');

        // 5. Default Charts of Accounts
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
            await Account.findOrCreate({
                where: { code: acc.code, organization_id: org.id },
                defaults: { ...acc, status: 'active' }
            });
        }
        console.log('✅ Seeded default Charts of Accounts.');

        // 6. Inventory Data (Brands, Units, Categories)

        // 6.1 Measurement Units
        const measurementUnits = [
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Gram', short_name: 'g' },
            { name: 'Liter', short_name: 'l' },
            { name: 'Milliliter', short_name: 'ml' },
            { name: 'Piece', short_name: 'pcs' },
            { name: 'Meter', short_name: 'm' },
            { name: 'Centimeter', short_name: 'cm' }
        ];
        for (const item of measurementUnits) {
            await MeasurementUnit.findOrCreate({ where: { short_name: item.short_name }, defaults: item });
        }
        console.log('✅ Seeded Measurement Units.');

        // 6.2 Base Units
        const units = [
            { name: 'Piece', short_name: 'pc' },
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Liter', short_name: 'l' },
            { name: 'Box', short_name: 'box' },
            { name: 'Dozen', short_name: 'doz' }
        ];
        for (const item of units) {
            await Unit.findOrCreate({ where: { short_name: item.short_name }, defaults: item });
        }
        console.log('✅ Seeded Base Units.');

        // 6.3 Containers
        const containers = [
            { name: 'Box', description: 'Standard cardboard box' },
            { name: 'Crate', description: 'Plastic crate' },
            { name: 'Bottle', description: 'Glass or plastic bottle' },
            { name: 'Can', description: 'Metal can' },
            { name: 'Bag', description: 'Plastic or paper bag' },
            { name: 'Drum', description: 'Industrial drum' }
        ];
        for (const item of containers) {
            await Container.findOrCreate({ where: { name: item.name }, defaults: item });
        }
        console.log('✅ Seeded Containers.');

        // 6.4 Brands
        const brands = [
            { name: 'Generic', description: 'Non-branded items' },
            { name: 'In-House', description: 'Store brand' },
            { name: 'Samsung', description: 'Electronics' },
            { name: 'Apple', description: 'Electronics' },
            { name: 'Nike', description: 'Apparel' },
            { name: 'Coca Cola', description: 'Beverages' },
            { name: 'Nestle', description: 'Food & Beverage' }
        ];
        for (const item of brands) {
            await Brand.findOrCreate({ where: { name: item.name }, defaults: item });
        }
        console.log('✅ Seeded Brands.');

        // 6.5 Categories (Main & Sub)
        const categories = {
            'Electronics': ['Mobile Phones', 'Laptops', 'Accessories', 'Tablets'],
            'Groceries': ['Vegetables', 'Fruits', 'Dairy', 'Beverages', 'Snacks'],
            'Clothing': ['Men', 'Women', 'Kids', 'Shoes'],
            'Home & Kitchen': ['Furniture', 'Cookware', 'Decor']
        };

        for (const [mainName, subNames] of Object.entries(categories)) {
            const [mainCategory] = await MainCategory.findOrCreate({
                where: { name: mainName },
                defaults: { description: `Category for ${mainName}` }
            });

            for (const subName of subNames) {
                await SubCategory.findOrCreate({
                    where: { name: subName, main_category_id: mainCategory.id },
                    defaults: { description: `${subName} items` }
                });
            }
        }
        console.log('✅ Seeded Categories (Main & Sub).');

        console.log('🌱 Mastering Seeding Completed Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seed();
