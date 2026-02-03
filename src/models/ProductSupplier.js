module.exports = (sequelize, DataTypes) => {
    const ProductSupplier = sequelize.define('ProductSupplier', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        product_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        supplier_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        cost_price: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true,
            comment: 'Cost price specific to this supplier'
        },
        supplier_sku: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Product code/SKU used by this supplier'
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'product_suppliers',
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['product_id', 'supplier_id']
            }
        ]
    });

    return ProductSupplier;
};
