module.exports = (sequelize, DataTypes) => {
    const Recipe = sequelize.define('Recipe', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        product_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        product_variant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        batch_size: {
            type: DataTypes.DECIMAL(15, 3),
            defaultValue: 1.000,
            allowNull: false
        },
        total_cost: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00,
            allowNull: false
        },
        instructions: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'recipes',
        underscored: true
    });

    Recipe.associate = (models) => {
        Recipe.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        Recipe.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        Recipe.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Recipe.hasMany(models.RecipeItem, { as: 'items', foreignKey: 'recipe_id' });
    };

    return Recipe;
};
