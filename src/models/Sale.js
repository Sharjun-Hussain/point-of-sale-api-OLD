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

    return Sale;
};
