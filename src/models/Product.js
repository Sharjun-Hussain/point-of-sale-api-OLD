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
        }
    }, {
        tableName: 'products',
        underscored: true
    });

    return Product;
};
