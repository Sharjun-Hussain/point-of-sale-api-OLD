module.exports = (sequelize, DataTypes) => {
    const StockTransferItem = sequelize.define('StockTransferItem', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        stock_transfer_id: {
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
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'stock_transfer_items',
        underscored: true
    });

    StockTransferItem.associate = (models) => {
        StockTransferItem.belongsTo(models.StockTransfer, { as: 'stock_transfer', foreignKey: 'stock_transfer_id' });
        StockTransferItem.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        StockTransferItem.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        StockTransferItem.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return StockTransferItem;
};
