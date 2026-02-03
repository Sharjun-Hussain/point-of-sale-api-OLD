module.exports = (sequelize, DataTypes) => {
    const SaleReturn = sequelize.define('SaleReturn', {
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
        sale_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        return_number: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        return_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        refund_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        refund_method: {
            type: DataTypes.STRING,
            allowNull: true // Cash, Bank, Store Credit
        },
        status: {
            type: DataTypes.ENUM('completed', 'pending', 'cancelled'),
            defaultValue: 'completed'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'sale_returns',
        underscored: true
    });

    return SaleReturn;
};
