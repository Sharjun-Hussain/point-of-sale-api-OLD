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
        quantity_received: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        unit_cost: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'purchase_order_items',
        underscored: true
    });

    PurchaseOrderItem.associate = (models) => {
        PurchaseOrderItem.belongsTo(models.PurchaseOrder, { as: 'purchase_order', foreignKey: 'purchase_order_id' });
        PurchaseOrderItem.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        PurchaseOrderItem.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        PurchaseOrderItem.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return PurchaseOrderItem;
};
