module.exports = (sequelize, DataTypes) => {
    const VariantAttributeValue = sequelize.define('VariantAttributeValue', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        product_variant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        attribute_value_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'variant_attr_values',
        underscored: true,
        indexes: [
            {
                unique: true,
                name: 'idx_variant_attr_unique',
                fields: ['product_variant_id', 'attribute_value_id']
            }
        ]
    });

    VariantAttributeValue.associate = (models) => {
        VariantAttributeValue.belongsTo(models.ProductVariant, { foreignKey: 'product_variant_id', as: 'variant' });
        VariantAttributeValue.belongsTo(models.AttributeValue, { foreignKey: 'attribute_value_id', as: 'attribute_value' });
    };

    return VariantAttributeValue;
};
