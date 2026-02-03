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
        }
    }, {
        tableName: 'stock_transfer_items',
        underscored: true
    });

    return StockTransferItem;
};
