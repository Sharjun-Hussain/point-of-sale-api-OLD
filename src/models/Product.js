module.exports = (sequelize, DataTypes) => {
    const Product = sequelize.define('Product', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        code: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        description: {
            type: DataTypes.TEXT,
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
        main_category_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        sub_category_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        brand_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        unit_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        measurement_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        container_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        supplier_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        image: {
            type: DataTypes.STRING,
            allowNull: true
        },
        is_variant: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'products',
        underscored: true
    });

    Product.associate = (models) => {
        // Core Category & Metadata
        Product.belongsTo(models.MainCategory, { as: 'main_category', foreignKey: 'main_category_id' });
        Product.belongsTo(models.SubCategory, { as: 'sub_category', foreignKey: 'sub_category_id' });
        Product.belongsTo(models.Brand, { as: 'brand', foreignKey: 'brand_id' });
        Product.belongsTo(models.Unit, { as: 'unit', foreignKey: 'unit_id' });
        Product.belongsTo(models.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });
        Product.belongsTo(models.MeasurementUnit, { as: 'measurement', foreignKey: 'measurement_id' });
        Product.belongsTo(models.Container, { as: 'container', foreignKey: 'container_id' });
        Product.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });

        // Variants
        Product.hasMany(models.ProductVariant, { as: 'variants', foreignKey: 'product_id' });

        // Inventory & Transactions
        Product.hasMany(models.SaleItem, { as: 'sale_items', foreignKey: 'product_id' });
        Product.hasMany(models.SaleReturnItem, { as: 'sale_return_items', foreignKey: 'product_id' });
        Product.hasMany(models.StockTransferItem, { as: 'transfer_items', foreignKey: 'product_id' });
        Product.hasMany(models.PurchaseOrderItem, { as: 'purchase_items', foreignKey: 'product_id' });
        Product.hasMany(models.PurchaseReturnItem, { as: 'purchase_return_items', foreignKey: 'product_id' });
        Product.hasMany(models.Stock, { as: 'stocks', foreignKey: 'product_id' });
        Product.hasMany(models.StockAdjustment, { as: 'stock_adjustments', foreignKey: 'product_id' });
        Product.hasMany(models.GRNItem, { as: 'grn_items', foreignKey: 'product_id' });
        Product.hasMany(models.ProductBatch, { as: 'batches', foreignKey: 'product_id' });

        // Many-to-Many
        Product.belongsToMany(models.Supplier, {
            through: models.ProductSupplier,
            as: 'suppliers',
            foreignKey: 'product_id',
            otherKey: 'supplier_id'
        });
        Product.belongsToMany(models.Attribute, {
            through: models.ProductAttribute,
            as: 'attributes',
            foreignKey: 'product_id',
            otherKey: 'attribute_id'
        });
    };

    return Product;
};
