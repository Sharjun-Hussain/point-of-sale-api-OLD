module.exports = (sequelize, DataTypes) => {
    const Brand = sequelize.define('Brand', {
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
            type: DataTypes.STRING,
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
        tableName: 'brands',
        underscored: true
    });

    Brand.associate = (models) => {
        Brand.hasMany(models.Product, { as: 'products', foreignKey: 'brand_id' });
        Brand.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return Brand;
};
