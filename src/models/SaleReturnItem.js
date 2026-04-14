module.exports = (sequelize, DataTypes) => {
    const SaleReturnItem = sequelize.define('SaleReturnItem', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        sale_return_id: {
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
        unit_price: {
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
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'sale_return_items',
        underscored: true
    });

    SaleReturnItem.associate = (models) => {
        SaleReturnItem.belongsTo(models.SaleReturn, { as: 'sale_return', foreignKey: 'sale_return_id' });
        SaleReturnItem.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        SaleReturnItem.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        SaleReturnItem.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return SaleReturnItem;
};
