module.exports = (sequelize, DataTypes) => {
    const SaleItem = sequelize.define('SaleItem', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        sale_id: {
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
        discount_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        tax_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        product_batch_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'sale_items',
        underscored: true
    });

    SaleItem.associate = (models) => {
        SaleItem.belongsTo(models.Sale, { as: 'sale', foreignKey: 'sale_id' });
        SaleItem.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        SaleItem.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        SaleItem.belongsTo(models.ProductBatch, { as: 'batch', foreignKey: 'product_batch_id' });
        SaleItem.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return SaleItem;
};
