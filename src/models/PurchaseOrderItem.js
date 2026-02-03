module.exports = (sequelize, DataTypes) => {
    const PurchaseOrderItem = sequelize.define('PurchaseOrderItem', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        purchase_order_id: {
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
        }
    }, {
        tableName: 'purchase_order_items',
        underscored: true
    });

    return PurchaseOrderItem;
};
