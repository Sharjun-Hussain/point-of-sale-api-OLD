module.exports = (sequelize, DataTypes) => {
    const ProductAttribute = sequelize.define('ProductAttribute', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        product_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        attribute_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'product_attributes',
        underscored: true,
        indexes: [
            {
                unique: true,
                name: 'idx_product_attr_unique',
                fields: ['product_id', 'attribute_id']
            }
        ]
    });

    return ProductAttribute;
};
