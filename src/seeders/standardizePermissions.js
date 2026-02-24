require('dotenv').config();
const { sequelize, Permission, Role } = require('../models');

const permissionsSeed = [
    // Organization
    { name: 'org:view', group_name: 'Organization', description: 'View organization details' },
    { name: 'org:create', group_name: 'Organization', description: 'Create new organization' },
    { name: 'org:edit', group_name: 'Organization', description: 'Edit organization details' },
    { name: 'org:delete', group_name: 'Organization', description: 'Delete organization' },

    // Branch
    { name: 'branch:view', group_name: 'Branch', description: 'View branch details' },
    { name: 'branch:create', group_name: 'Branch', description: 'Create new branch' },
    { name: 'branch:edit', group_name: 'Branch', description: 'Edit branch details' },
    { name: 'branch:delete', group_name: 'Branch', description: 'Delete branch' },

    // Role
    { name: 'role:view', group_name: 'Role', description: 'View roles' },
    { name: 'role:create', group_name: 'Role', description: 'Create new role' },
    { name: 'role:edit', group_name: 'Role', description: 'Edit role' },
    { name: 'role:delete', group_name: 'Role', description: 'Delete role' },

    // User
    { name: 'user:view', group_name: 'User', description: 'View users' },
    { name: 'user:create', group_name: 'User', description: 'Create new user' },
    { name: 'user:edit', group_name: 'User', description: 'Edit user' },
    { name: 'user:delete', group_name: 'User', description: 'Delete user' },

    // Product
    { name: 'product:view', group_name: 'Product', description: 'View products' },
    { name: 'product:create', group_name: 'Product', description: 'Create new product' },
    { name: 'product:edit', group_name: 'Product', description: 'Edit product' },
    { name: 'product:delete', group_name: 'Product', description: 'Delete product' },
    { name: 'product_variant:create', group_name: 'Product', description: 'Create product variant' },
    { name: 'product_variant:edit', group_name: 'Product', description: 'Edit product variant' },

    // Category
    { name: 'category:view', group_name: 'Category', description: 'View categories' },
    { name: 'category:create', group_name: 'Category', description: 'Create new category' },
    { name: 'category:edit', group_name: 'Category', description: 'Edit category' },
    { name: 'category:delete', group_name: 'Category', description: 'Delete category' },

    // Brand
    { name: 'brand:view', group_name: 'Brand', description: 'View brands' },
    { name: 'brand:create', group_name: 'Brand', description: 'Create new brand' },
    { name: 'brand:edit', group_name: 'Brand', description: 'Edit brand' },
    { name: 'brand:delete', group_name: 'Brand', description: 'Delete brand' },

    // Unit
    { name: 'unit:view', group_name: 'Unit', description: 'View units' },
    { name: 'unit:create', group_name: 'Unit', description: 'Create new unit' },
    { name: 'unit:edit', group_name: 'Unit', description: 'Edit unit' },
    { name: 'unit:delete', group_name: 'Unit', description: 'Delete unit' },

    // Attribute
    { name: 'attr:view', group_name: 'Attribute', description: 'View attributes' },
    { name: 'attr:create', group_name: 'Attribute', description: 'Create new attribute' },
    { name: 'attr:edit', group_name: 'Attribute', description: 'Edit attribute' },
    { name: 'attr:delete', group_name: 'Attribute', description: 'Delete attribute' },

    // Supplier
    { name: 'supplier:view', group_name: 'Supplier', description: 'View suppliers' },
    { name: 'supplier:create', group_name: 'Supplier', description: 'Create new supplier' },
    { name: 'supplier:edit', group_name: 'Supplier', description: 'Edit supplier' },
    { name: 'supplier:delete', group_name: 'Supplier', description: 'Delete supplier' },

    // Customer
    { name: 'customer:view', group_name: 'Customer', description: 'View customers' },
    { name: 'customer:create', group_name: 'Customer', description: 'Create new customer' },
    { name: 'customer:edit', group_name: 'Customer', description: 'Edit customer' },
    { name: 'customer:delete', group_name: 'Customer', description: 'Delete customer' },

    // Purchase
    { name: 'purchase:view', group_name: 'Purchase', description: 'View purchases' },
    { name: 'purchase:create', group_name: 'Purchase', description: 'Create new purchase' },
    { name: 'purchase:edit', group_name: 'Purchase', description: 'Edit purchase' },
    { name: 'purchase:delete', group_name: 'Purchase', description: 'Delete purchase' },

    // Sale
    { name: 'sale:view', group_name: 'Sale', description: 'View sales' },
    { name: 'sale:create', group_name: 'Sale', description: 'Create new sale' },
    { name: 'sale:edit', group_name: 'Sale', description: 'Edit sale' },
    { name: 'sale:delete', group_name: 'Sale', description: 'Delete sale' },

    // Stock
    { name: 'stock:view', group_name: 'Stock', description: 'View stock' },
    { name: 'stock:create', group_name: 'Stock', description: 'Create new stock' },
    { name: 'stock:edit', group_name: 'Stock', description: 'Edit stock' },
    { name: 'stock:delete', group_name: 'Stock', description: 'Delete stock' },

    // Expense
    { name: 'expense:view', group_name: 'Finance', description: 'View expenses' },
    { name: 'expense:create', group_name: 'Finance', description: 'Create new expense' },
    { name: 'expense:edit', group_name: 'Finance', description: 'Edit expense' },
    { name: 'expense:delete', group_name: 'Finance', description: 'Delete expense' },

    // Finance
    { name: 'finance:view', group_name: 'Finance', description: 'View financial data' },
    { name: 'finance:manage', group_name: 'Finance', description: 'Manage finances' },

    // System
    { name: 'system:settings', group_name: 'System', description: 'Manage system settings' },
    { name: 'system:audit_log', group_name: 'System', description: 'View system audit logs' },

    // Reports
    { name: 'report:view', group_name: 'Reports', description: 'View reports' },
];

const seed = async () => {
    try {
        console.log('🌱 Starting Standardized Permissions Seed...');

        // 1. Permissions
        for (const perm of permissionsSeed) {
            await Permission.findOrCreate({
                where: { name: perm.name },
                defaults: perm
            });
        }
        console.log(`✅ Seeded ${permissionsSeed.length} permissions.`);

        // 2. Assign to Super Admin Role
        const [adminRole] = await Role.findOrCreate({
            where: { name: 'Super Admin' },
            defaults: { description: 'Full system access' }
        });

        const allPermissionInstances = await Permission.findAll();
        await adminRole.setPermissions(allPermissionInstances);
        console.log('✅ Assigned all permissions to Super Admin role.');

        console.log('🌱 Standardized Permissions Seeding Completed Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seed();
