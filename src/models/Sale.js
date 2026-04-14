module.exports = (sequelize, DataTypes) => {
    const Sale = sequelize.define('Sale', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        customer_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false // Key for the cashier
        },
        invoice_number: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        sale_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        discount_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        tax_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        payable_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        paid_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        payment_status: {
            type: DataTypes.ENUM('unpaid', 'partially_paid', 'paid'),
            defaultValue: 'unpaid'
        },
        payment_method: {
            type: DataTypes.STRING,
            allowNull: true // Cash, Card, Mobile, etc.
        },
        status: {
            type: DataTypes.ENUM('completed', 'draft', 'returned', 'cancelled'),
            defaultValue: 'completed'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        is_wholesale: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'sales',
        underscored: true
    });

    Sale.associate = (models) => {
        Sale.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Sale.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        Sale.belongsTo(models.User, { as: 'cashier', foreignKey: 'user_id' });
        Sale.belongsTo(models.Customer, { as: 'customer', foreignKey: 'customer_id' });
        Sale.belongsToMany(models.User, { 
            through: models.SaleEmployee, 
            as: 'sellers', 
            foreignKey: 'sale_id', 
            otherKey: 'user_id' 
        });
        Sale.hasMany(models.SaleItem, { as: 'items', foreignKey: 'sale_id' });
        Sale.hasMany(models.SaleReturn, { as: 'returns', foreignKey: 'sale_id' });
        Sale.hasMany(models.Cheque, { as: 'cheques', foreignKey: 'reference_id', constraints: false });
    };

    return Sale;
};
