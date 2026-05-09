module.exports = (sequelize, DataTypes) => {
    const Customer = sequelize.define('Customer', {
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
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        loyalty_points: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        credit_limit: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        opening_balance: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'customers',
        underscored: true,
        indexes: [
            {
                name: 'customers_org_email_unique_idx',
                unique: true,
                fields: ['organization_id', 'email']
            },
            {
                name: 'customers_org_phone_unique_idx',
                unique: true,
                fields: ['organization_id', 'phone']
            }
        ]
    });

    Customer.associate = (models) => {
        Customer.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Customer.hasMany(models.Sale, { as: 'sales', foreignKey: 'customer_id' });
        Customer.hasMany(models.Transaction, { as: 'transactions', foreignKey: 'customer_id' });
        Customer.hasMany(models.SaleReturn, { as: 'sale_returns', foreignKey: 'customer_id' });
    };

    return Customer;
};
