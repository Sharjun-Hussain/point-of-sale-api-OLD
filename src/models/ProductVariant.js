module.exports = (sequelize, DataTypes) => {
    const ProductVariant = sequelize.define('ProductVariant', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        product_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true // Made nullable - variant name is optional
        },
        code: {
            type: DataTypes.STRING,
            allowNull: true
        },
        sku: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true
        },
        barcode: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true
        },
        price: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        wholesale_price: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        cost_price: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        stock_quantity: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        low_stock_threshold: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 10.00
        },
        image: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        // Industry standard fields mentioned by user
        imei_number: {
            type: DataTypes.STRING,
            allowNull: true
        },
        warranty_period: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'product_variants',
        underscored: true
    });

    ProductVariant.associate = (models) => {
        // Parent & Meta
        ProductVariant.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        ProductVariant.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });

        // Transactions
        ProductVariant.hasMany(models.SaleItem, { as: 'sale_items', foreignKey: 'product_variant_id' });
        ProductVariant.hasMany(models.SaleReturnItem, { as: 'sale_return_items', foreignKey: 'product_variant_id' });
        ProductVariant.hasMany(models.StockTransferItem, { as: 'transfer_items', foreignKey: 'product_variant_id' });
        ProductVariant.hasMany(models.PurchaseOrderItem, { as: 'purchase_items', foreignKey: 'product_variant_id' });
        ProductVariant.hasMany(models.PurchaseReturnItem, { as: 'purchase_return_items', foreignKey: 'product_variant_id' });
        ProductVariant.hasMany(models.Stock, { as: 'stocks', foreignKey: 'product_variant_id' });
        ProductVariant.hasMany(models.StockAdjustment, { as: 'stock_adjustments', foreignKey: 'product_variant_id' });
        ProductVariant.hasMany(models.GRNItem, { as: 'grn_items', foreignKey: 'product_variant_id' });
        ProductVariant.hasMany(models.ProductBatch, { as: 'batches', foreignKey: 'product_variant_id' });

        // Many-to-Many Attributes
        ProductVariant.belongsToMany(models.AttributeValue, {
            through: models.VariantAttributeValue,
            as: 'attribute_values',
            foreignKey: 'product_variant_id',
            otherKey: 'attribute_value_id',
            uniqueKey: false
        });
        ProductVariant.hasMany(models.VariantAttributeValue, { as: 'variant_attribute_links', foreignKey: 'product_variant_id' });
    };

    return ProductVariant;
};
