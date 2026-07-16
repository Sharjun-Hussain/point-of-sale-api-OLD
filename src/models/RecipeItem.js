module.exports = (sequelize, DataTypes) => {
    const RecipeItem = sequelize.define('RecipeItem', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        recipe_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        raw_material_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        raw_material_variant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        quantity: {
            type: DataTypes.DECIMAL(15, 4),
            allowNull: false
        },
        unit_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        waste_percentage: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 0.00
        },
        cost_at_creation: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true
        }
    }, {
        tableName: 'recipe_items',
        underscored: true
    });

    RecipeItem.associate = (models) => {
        RecipeItem.belongsTo(models.Recipe, { as: 'recipe', foreignKey: 'recipe_id' });
        RecipeItem.belongsTo(models.Product, { as: 'raw_material', foreignKey: 'raw_material_id' });
        RecipeItem.belongsTo(models.ProductVariant, { as: 'raw_material_variant', foreignKey: 'raw_material_variant_id' });
        RecipeItem.belongsTo(models.Unit, { as: 'unit', foreignKey: 'unit_id' });
    };

    return RecipeItem;
};
