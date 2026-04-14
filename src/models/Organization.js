module.exports = (sequelize, DataTypes) => {
    const Organization = sequelize.define('Organization', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        tax_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        website: {
            type: DataTypes.STRING,
            allowNull: true
        },
        business_type: {
            type: DataTypes.STRING,
            allowNull: true
        },
        logo: {
            type: DataTypes.STRING,
            allowNull: true
        },
        city: {
            type: DataTypes.STRING,
            allowNull: true
        },
        state: {
            type: DataTypes.STRING,
            allowNull: true
        },
        zip_code: {
            type: DataTypes.STRING,
            allowNull: true
        },
        subscription_tier: {
            type: DataTypes.ENUM('Basic', 'Pro', 'Enterprise'),
            allowNull: true
        },
        billing_cycle: {
            type: DataTypes.ENUM('Monthly', 'Yearly', 'Lifetime'),
            allowNull: true
        },
        subscription_expiry_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        subscription_status: {
            type: DataTypes.ENUM('Active', 'Expired', 'Trial', 'Suspended'),
            defaultValue: 'Trial'
        },
        purchase_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        plan_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'business_plans',
                key: 'id'
            }
        },
        is_multi_branch: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'organizations',
        underscored: true
    });

    Organization.associate = (models) => {
        Organization.hasMany(models.Branch, { as: 'branches', foreignKey: 'organization_id' });
        Organization.hasMany(models.SubscriptionHistory, { as: 'subscription_histories', foreignKey: 'organization_id' });
        Organization.belongsTo(models.BusinessPlan, { as: 'plan', foreignKey: 'plan_id' });
        Organization.hasMany(models.User, { as: 'users', foreignKey: 'organization_id' });
        Organization.hasMany(models.Employee, { as: 'employees', foreignKey: 'organization_id' });
        Organization.hasMany(models.Setting, { as: 'settings', foreignKey: 'organization_id' });
        Organization.hasMany(models.Customer, { as: 'customers', foreignKey: 'organization_id' });
        Organization.hasMany(models.Supplier, { as: 'suppliers', foreignKey: 'organization_id' });
        Organization.hasMany(models.Sale, { as: 'sales', foreignKey: 'organization_id' });
        Organization.hasMany(models.ExpenseCategory, { as: 'expense_categories', foreignKey: 'organization_id' });
        Organization.hasMany(models.Expense, { as: 'expenses', foreignKey: 'organization_id' });
        Organization.hasMany(models.Account, { as: 'accounts', foreignKey: 'organization_id' });
        Organization.hasMany(models.Transaction, { as: 'transactions', foreignKey: 'organization_id' });
        Organization.hasMany(models.Cheque, { as: 'cheques', foreignKey: 'organization_id' });
        Organization.hasMany(models.GRN, { as: 'grns', foreignKey: 'organization_id' });
        Organization.hasMany(models.ProductBatch, { as: 'batches', foreignKey: 'organization_id' });
        Organization.hasMany(models.Attribute, { as: 'attributes', foreignKey: 'organization_id' });
    };

    return Organization;
};
