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
        distributor_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false // Key for the cashier
        },
        shift_id: {
            type: DataTypes.UUID,
            allowNull: true // Link to the active cash register shift
        },
        invoice_number: {
            type: DataTypes.STRING,
            allowNull: false
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
        },
        return_status: {
            type: DataTypes.ENUM('none', 'partial', 'full'),
            defaultValue: 'none'
        },
        earned_points: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        redeemed_points: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        dining_type: {
            type: DataTypes.ENUM('dine_in', 'takeaway', 'delivery'),
            defaultValue: 'takeaway',
            allowNull: false
        },
        dining_table_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        kot_status: {
            type: DataTypes.ENUM('pending', 'sent_to_kitchen', 'preparing', 'ready', 'served'),
            defaultValue: 'pending',
            allowNull: false
        },
        waiter_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'sales',
        underscored: true,
        indexes: [
            {
                name: 'sales_org_invoice_unique_idx',
                unique: true,
                fields: ['organization_id', 'invoice_number']
            }
        ]
    });

    Sale.associate = (models) => {
        Sale.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Sale.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        Sale.belongsTo(models.User, { as: 'cashier', foreignKey: 'user_id' });
        Sale.belongsTo(models.Customer, { as: 'customer', foreignKey: 'customer_id' });
        Sale.belongsTo(models.Distributor, { as: 'distributor', foreignKey: 'distributor_id' });
        Sale.belongsToMany(models.User, { 
            through: models.SaleEmployee, 
            as: 'sellers', 
            foreignKey: 'sale_id', 
            otherKey: 'user_id' 
        });
        Sale.hasMany(models.SaleItem, { as: 'items', foreignKey: 'sale_id' });
        Sale.hasMany(models.SalePayment, { as: 'payments', foreignKey: 'sale_id' });
        Sale.hasMany(models.SaleReturn, { as: 'returns', foreignKey: 'sale_id' });
        Sale.hasMany(models.Cheque, { as: 'cheques', foreignKey: 'reference_id', constraints: false });
        Sale.belongsTo(models.DiningTable, { as: 'table', foreignKey: 'dining_table_id' });
        Sale.belongsTo(models.User, { as: 'waiter', foreignKey: 'waiter_id' });
        if(models.Shift) {
            Sale.belongsTo(models.Shift, { as: 'shift', foreignKey: 'shift_id' });
        }
    };

    return Sale;
};
