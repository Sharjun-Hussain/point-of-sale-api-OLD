module.exports = (sequelize, DataTypes) => {
    const MainCategory = sequelize.define('MainCategory', {
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
        tableName: 'main_categories',
        underscored: true
    });

    MainCategory.associate = (models) => {
        MainCategory.hasMany(models.SubCategory, { as: 'sub_categories', foreignKey: 'main_category_id' });
        MainCategory.hasMany(models.Product, { as: 'products', foreignKey: 'main_category_id' });
        MainCategory.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return MainCategory;
};
