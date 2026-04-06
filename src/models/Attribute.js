module.exports = (sequelize, DataTypes) => {
    const Attribute = sequelize.define('Attribute', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
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
        }
    }, {
        tableName: 'attributes',
        underscored: true,
        indexes: [
            {
                fields: ['name']
            }
        ]
    });

    Attribute.associate = (models) => {
        Attribute.hasMany(models.AttributeValue, { foreignKey: 'attribute_id', as: 'values' });
    };

    return Attribute;
};
