module.exports = (sequelize, DataTypes) => {
    const AttributeValue = sequelize.define('AttributeValue', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        attribute_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        value: {
            type: DataTypes.STRING,
            allowNull: false
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
        tableName: 'attribute_values',
        underscored: true,
        indexes: [
            {
                fields: ['attribute_id', 'value']
            }
        ]
    });

    AttributeValue.associate = (models) => {
        AttributeValue.belongsTo(models.Attribute, { foreignKey: 'attribute_id', as: 'attribute' });
        AttributeValue.hasMany(models.VariantAttributeValue, { foreignKey: 'attribute_value_id', as: 'variant_values' });
    };

    return AttributeValue;
};
