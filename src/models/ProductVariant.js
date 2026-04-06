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

    return ProductVariant;
};
