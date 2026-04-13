const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Models will be imported here
// Models will be imported here
db.User = require('./User')(sequelize, DataTypes);
db.Employee = require('./Employee')(sequelize, DataTypes);
db.Role = require('./Role')(sequelize, DataTypes);
db.Permission = require('./Permission')(sequelize, DataTypes);
db.Organization = require('./Organization')(sequelize, DataTypes);
db.Branch = require('./Branch')(sequelize, DataTypes);
db.MainCategory = require('./MainCategory')(sequelize, DataTypes);
db.SubCategory = require('./SubCategory')(sequelize, DataTypes);
db.Brand = require('./Brand')(sequelize, DataTypes);
db.Unit = require('./Unit')(sequelize, DataTypes);
db.Product = require('./Product')(sequelize, DataTypes);
db.ProductVariant = require('./ProductVariant')(sequelize, DataTypes);
db.Customer = require('./Customer')(sequelize, DataTypes);
db.Supplier = require('./Supplier')(sequelize, DataTypes);
db.Sale = require('./Sale')(sequelize, DataTypes);
db.SaleItem = require('./SaleItem')(sequelize, DataTypes);
db.PurchaseOrder = require('./PurchaseOrder')(sequelize, DataTypes);
db.PurchaseOrderItem = require('./PurchaseOrderItem')(sequelize, DataTypes);
db.Stock = require('./Stock')(sequelize, DataTypes);
db.StockAdjustment = require('./StockAdjustment')(sequelize, DataTypes);
db.ExpenseCategory = require('./ExpenseCategory')(sequelize, DataTypes);
db.Expense = require('./Expense')(sequelize, DataTypes);
db.Account = require('./Account')(sequelize, DataTypes);
db.Transaction = require('./Transaction')(sequelize, DataTypes);
db.MeasurementUnit = require('./MeasurementUnit')(sequelize, DataTypes);
db.Container = require('./Container')(sequelize, DataTypes);
db.GRN = require('./GRN')(sequelize, DataTypes);
db.GRNItem = require('./GRNItem')(sequelize, DataTypes);
db.ProductBatch = require('./ProductBatch')(sequelize, DataTypes);
db.StockOpening = require('./StockOpening')(sequelize, DataTypes);
db.Attribute = require('./Attribute')(sequelize, DataTypes);
db.AttributeValue = require('./AttributeValue')(sequelize, DataTypes);
db.VariantAttributeValue = require('./VariantAttributeValue')(sequelize, DataTypes);
db.ProductAttribute = require('./ProductAttribute')(sequelize, DataTypes);
db.ProductSupplier = require('./ProductSupplier')(sequelize, DataTypes);
db.Setting = require('./Setting')(sequelize, DataTypes);
db.PurchaseReturn = require('./PurchaseReturn')(sequelize, DataTypes);
db.PurchaseReturnItem = require('./PurchaseReturnItem')(sequelize, DataTypes);
db.AuditLog = require('./AuditLog')(sequelize, DataTypes);
db.SaleEmployee = require('./SaleEmployee')(sequelize, DataTypes);
db.Cheque = require('./Cheque')(sequelize, DataTypes);
db.SaleReturn = require('./SaleReturn')(sequelize, DataTypes);
db.SaleReturnItem = require('./SaleReturnItem')(sequelize, DataTypes);
db.StockTransfer = require('./StockTransfer')(sequelize, DataTypes);
db.StockTransferItem = require('./StockTransferItem')(sequelize, DataTypes);
db.SubscriptionHistory = require('./SubscriptionHistory')(sequelize, DataTypes);
db.RefreshToken = require('./RefreshToken')(sequelize, DataTypes);
db.BusinessPlan = require('./BusinessPlan')(sequelize, DataTypes);

// Associations
// Many-to-Many: User and Role
db.User.belongsToMany(db.Role, {
    through: 'user_roles',
    as: 'roles',
    foreignKey: 'user_id',
    otherKey: 'role_id'
});
db.Role.belongsToMany(db.User, {
    through: 'user_roles',
    as: 'users',
    foreignKey: 'role_id',
    otherKey: 'user_id'
});

// Setting associations
db.Setting.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Setting.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.Organization.hasMany(db.Setting, { as: 'settings', foreignKey: 'organization_id' });
db.Branch.hasMany(db.Setting, { as: 'settings', foreignKey: 'branch_id' });

// Many-to-Many: Role and Permission
db.Role.belongsToMany(db.Permission, {
    through: 'role_permissions',
    as: 'permissions',
    foreignKey: 'role_id',
    otherKey: 'permission_id'
});
db.Permission.belongsToMany(db.Role, {
    through: 'role_permissions',
    as: 'roles',
    foreignKey: 'permission_id',
    otherKey: 'role_id'
});

// Organization & Branch
db.Organization.hasMany(db.Branch, { as: 'branches', foreignKey: 'organization_id' });
db.Branch.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });

// Organization & SubscriptionHistory
db.Organization.hasMany(db.SubscriptionHistory, { as: 'subscription_histories', foreignKey: 'organization_id' });
db.SubscriptionHistory.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });

// Organization & BusinessPlan
db.Organization.belongsTo(db.BusinessPlan, { as: 'plan', foreignKey: 'plan_id' });
db.BusinessPlan.hasMany(db.Organization, { as: 'organizations', foreignKey: 'plan_id' });

// User associations with Organization and Branch
db.User.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.User.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });

// User & RefreshToken
db.User.hasMany(db.RefreshToken, { as: 'refresh_tokens', foreignKey: 'user_id' });
db.RefreshToken.belongsTo(db.User, { as: 'user', foreignKey: 'user_id' });
db.Organization.hasMany(db.User, { as: 'users', foreignKey: 'organization_id' });

// Employee Associations
db.User.hasOne(db.Employee, { as: 'employee', foreignKey: 'user_id' });
db.Employee.belongsTo(db.User, { as: 'user', foreignKey: 'user_id' });
db.Organization.hasMany(db.Employee, { as: 'employees', foreignKey: 'organization_id' });
db.Employee.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });

// Primary Master Branch
db.Branch.hasMany(db.Employee, { as: 'primaryEmployees', foreignKey: 'branch_id' });
db.Employee.belongsTo(db.Branch, { as: 'primaryBranch', foreignKey: 'branch_id' });

// Multi-Branch Assignments
db.Employee.belongsToMany(db.Branch, {
    through: 'employee_branches',
    as: 'branches',
    foreignKey: 'employee_id',
    otherKey: 'branch_id'
});
db.Branch.belongsToMany(db.Employee, {
    through: 'employee_branches',
    as: 'employees',
    foreignKey: 'branch_id',
    otherKey: 'employee_id'
});

db.User.belongsToMany(db.Branch, {
    through: 'user_branches',
    as: 'branches',
    foreignKey: 'user_id',
    otherKey: 'branch_id'
});
db.Branch.belongsToMany(db.User, {
    through: 'user_branches',
    as: 'users',
    foreignKey: 'branch_id',
    otherKey: 'user_id'
});

// Category Associations
db.MainCategory.hasMany(db.SubCategory, { as: 'sub_categories', foreignKey: 'main_category_id' });
db.SubCategory.belongsTo(db.MainCategory, { as: 'main_category', foreignKey: 'main_category_id' });

// Product Associations
db.Product.belongsTo(db.MainCategory, { as: 'main_category', foreignKey: 'main_category_id' });
db.Product.belongsTo(db.SubCategory, { as: 'sub_category', foreignKey: 'sub_category_id' });
db.Product.belongsTo(db.Brand, { as: 'brand', foreignKey: 'brand_id' });
db.Product.belongsTo(db.Unit, { as: 'unit', foreignKey: 'unit_id' });
db.Product.belongsTo(db.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });

db.Product.hasMany(db.ProductVariant, { as: 'variants', foreignKey: 'product_id' });
db.ProductVariant.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });

db.Product.belongsTo(db.MeasurementUnit, { as: 'measurement', foreignKey: 'measurement_id' });
db.Product.belongsTo(db.Container, { as: 'container', foreignKey: 'container_id' });

// Container Associations
db.Container.belongsTo(db.MeasurementUnit, { as: 'measurement_unit', foreignKey: 'measurement_unit_id' });
db.Container.belongsTo(db.Unit, { as: 'base_unit', foreignKey: 'base_unit_id' });


// Customer & Supplier Associations
db.Customer.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Supplier.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Supplier.hasMany(db.Product, { as: 'products', foreignKey: 'supplier_id' });

// Multi-Supplier Association
db.Product.belongsToMany(db.Supplier, {
    through: db.ProductSupplier,
    as: 'suppliers',
    foreignKey: 'product_id',
    otherKey: 'supplier_id'
});
db.Supplier.belongsToMany(db.Product, {
    through: db.ProductSupplier,
    as: 'supplied_products',
    foreignKey: 'supplier_id',
    otherKey: 'product_id'
});

// Sale Associations
db.Sale.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Sale.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.Sale.belongsTo(db.User, { as: 'cashier', foreignKey: 'user_id' });
db.Sale.belongsTo(db.Customer, { as: 'customer', foreignKey: 'customer_id' });
db.Sale.belongsToMany(db.User, { through: db.SaleEmployee, as: 'sellers', foreignKey: 'sale_id', otherKey: 'user_id' });
db.User.belongsToMany(db.Sale, { through: db.SaleEmployee, as: 'sales', foreignKey: 'user_id', otherKey: 'sale_id' });
db.Sale.hasMany(db.SaleItem, { as: 'items', foreignKey: 'sale_id' });
db.SaleItem.belongsTo(db.Sale, { as: 'sale', foreignKey: 'sale_id' });
db.SaleItem.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.SaleItem.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });

// Sale Return Associations
db.SaleReturn.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.SaleReturn.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.SaleReturn.belongsTo(db.Customer, { as: 'customer', foreignKey: 'customer_id' });
db.SaleReturn.belongsTo(db.Sale, { as: 'sale', foreignKey: 'sale_id' });
db.SaleReturn.belongsTo(db.User, { as: 'cashier', foreignKey: 'user_id' });
db.SaleReturn.hasMany(db.SaleReturnItem, { as: 'items', foreignKey: 'sale_return_id' });

db.SaleReturnItem.belongsTo(db.SaleReturn, { as: 'sale_return', foreignKey: 'sale_return_id' });
db.SaleReturnItem.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.SaleReturnItem.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });

// Stock Transfer Associations
db.StockTransfer.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.StockTransfer.belongsTo(db.Branch, { as: 'from_branch', foreignKey: 'from_branch_id' });
db.StockTransfer.belongsTo(db.Branch, { as: 'to_branch', foreignKey: 'to_branch_id' });
db.StockTransfer.belongsTo(db.User, { as: 'user', foreignKey: 'user_id' });
db.StockTransfer.hasMany(db.StockTransferItem, { as: 'items', foreignKey: 'stock_transfer_id' });

db.StockTransferItem.belongsTo(db.StockTransfer, { as: 'stock_transfer', foreignKey: 'stock_transfer_id' });
db.StockTransferItem.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.StockTransferItem.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });

// Purchase Associations
db.PurchaseOrder.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.PurchaseOrder.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.PurchaseOrder.belongsTo(db.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });
db.PurchaseOrder.belongsTo(db.User, { as: 'created_by_user', foreignKey: 'user_id' });
db.PurchaseOrder.hasMany(db.PurchaseOrderItem, { as: 'items', foreignKey: 'purchase_order_id' });
db.PurchaseOrder.hasMany(db.GRN, { as: 'grns', foreignKey: 'purchase_order_id' });
db.PurchaseOrder.hasMany(db.PurchaseReturn, { as: 'returns', foreignKey: 'purchase_order_id' });
db.PurchaseOrderItem.belongsTo(db.PurchaseOrder, { as: 'purchase_order', foreignKey: 'purchase_order_id' });
db.PurchaseOrderItem.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.PurchaseOrderItem.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });

// Purchase Return Associations
db.PurchaseReturn.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.PurchaseReturn.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.PurchaseReturn.belongsTo(db.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });
db.PurchaseReturn.belongsTo(db.User, { as: 'created_by_user', foreignKey: 'user_id' });
db.PurchaseReturn.belongsTo(db.PurchaseOrder, { as: 'purchase_order', foreignKey: 'purchase_order_id' });
db.PurchaseReturn.belongsTo(db.GRN, { as: 'grn', foreignKey: 'grn_id' });
db.PurchaseReturn.hasMany(db.PurchaseReturnItem, { as: 'items', foreignKey: 'purchase_return_id' });

db.PurchaseReturnItem.belongsTo(db.PurchaseReturn, { as: 'purchase_return', foreignKey: 'purchase_return_id' });
db.PurchaseReturnItem.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.PurchaseReturnItem.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
db.PurchaseReturnItem.belongsTo(db.ProductBatch, { as: 'batch', foreignKey: 'product_batch_id' });

// Stock Associations
db.Stock.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.Stock.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.Stock.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });

db.StockAdjustment.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.StockAdjustment.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.StockAdjustment.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
db.StockAdjustment.belongsTo(db.User, { as: 'adjusted_by_user', foreignKey: 'user_id' });

// Expense Associations
db.ExpenseCategory.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Expense.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Expense.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.Expense.belongsTo(db.ExpenseCategory, { as: 'category', foreignKey: 'expense_category_id' });
db.Expense.belongsTo(db.User, { as: 'recorded_by_user', foreignKey: 'user_id' });

// Accounting Associations
db.Account.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Transaction.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Transaction.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.Transaction.belongsTo(db.Account, { as: 'account', foreignKey: 'account_id' });
db.Transaction.belongsTo(db.Customer, { as: 'customer', foreignKey: 'customer_id' });
db.Transaction.belongsTo(db.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });

// Cheque Associations
db.Cheque.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Cheque.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.Cheque.belongsTo(db.Account, { as: 'account', foreignKey: 'account_id' });
db.Cheque.belongsTo(db.Sale, { as: 'sale', foreignKey: 'reference_id', constraints: false });
db.Cheque.belongsTo(db.GRN, { as: 'grn', foreignKey: 'reference_id', constraints: false });
db.Cheque.belongsTo(db.Expense, { as: 'expense', foreignKey: 'reference_id', constraints: false });

// GRN Associations
db.GRN.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.GRN.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.GRN.belongsTo(db.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });
db.GRN.belongsTo(db.PurchaseOrder, { as: 'purchase_order', foreignKey: 'purchase_order_id' });
db.GRN.belongsTo(db.User, { as: 'received_by_user', foreignKey: 'user_id' });
db.GRN.hasMany(db.GRNItem, { as: 'items', foreignKey: 'grn_id' });
db.GRNItem.belongsTo(db.GRN, { as: 'grn', foreignKey: 'grn_id' });
db.GRNItem.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.GRNItem.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });

// Product Batch Associations
db.ProductBatch.belongsTo(db.Product, { as: 'product', foreignKey: 'product_id' });
db.ProductBatch.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
db.ProductBatch.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.ProductBatch.hasMany(db.GRNItem, { as: 'grn_items', foreignKey: 'product_batch_id' });
db.GRNItem.belongsTo(db.ProductBatch, { as: 'batch', foreignKey: 'product_batch_id' });

// Stock Opening Associations
db.StockOpening.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.StockOpening.belongsTo(db.Branch, { as: 'branch', foreignKey: 'branch_id' });
db.StockOpening.belongsTo(db.User, { as: 'user', foreignKey: 'user_id' });
db.ProductBatch.belongsTo(db.StockOpening, { as: 'opening', foreignKey: 'opening_stock_id' });
db.StockOpening.hasMany(db.ProductBatch, { as: 'batches', foreignKey: 'opening_stock_id' });

// Attribute Associations
db.Attribute.belongsTo(db.Organization, { as: 'organization', foreignKey: 'organization_id' });
db.Attribute.hasMany(db.AttributeValue, { as: 'values', foreignKey: 'attribute_id' });
db.AttributeValue.belongsTo(db.Attribute, { as: 'attribute', foreignKey: 'attribute_id' });

// Product Attribute Associations
db.Product.belongsToMany(db.Attribute, {
    through: db.ProductAttribute,
    as: 'attributes',
    foreignKey: 'product_id',
    otherKey: 'attribute_id'
});
db.Attribute.belongsToMany(db.Product, {
    through: db.ProductAttribute,
    as: 'products',
    foreignKey: 'attribute_id',
    otherKey: 'product_id'
});

db.ProductVariant.belongsToMany(db.AttributeValue, {
    through: db.VariantAttributeValue,
    as: 'attribute_values',
    foreignKey: 'product_variant_id',
    otherKey: 'attribute_value_id',
    uniqueKey: false
});
db.AttributeValue.belongsToMany(db.ProductVariant, {
    through: db.VariantAttributeValue,
    as: 'variants',
    foreignKey: 'attribute_value_id',
    otherKey: 'product_variant_id',
    uniqueKey: false
});

db.VariantAttributeValue.belongsTo(db.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
db.VariantAttributeValue.belongsTo(db.AttributeValue, { as: 'attribute_value', foreignKey: 'attribute_value_id' });

// AuditLog associations
if (db.AuditLog && db.AuditLog.associate) {
    db.AuditLog.associate(db);
}

// SaleEmployee associations
if (db.SaleEmployee && db.SaleEmployee.associate) {
    db.SaleEmployee.associate(db);
}

module.exports = db;
