module.exports = (sequelize, DataTypes) => {
    const PurchaseReturnItem = sequelize.define('PurchaseReturnItem', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        purchase_return_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        product_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        product_variant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        batch_number: {
            type: DataTypes.STRING,
            allowNull: true
        },
        quantity: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        unit_cost: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'purchase_return_items',
        underscored: true
    });

    return PurchaseReturnItem;
};
