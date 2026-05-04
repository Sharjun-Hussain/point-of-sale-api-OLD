module.exports = (sequelize, DataTypes) => {
    const ProductionOrder = sequelize.define('ProductionOrder', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        recipe_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        order_number: {
            type: DataTypes.STRING,
            allowNull: false
        },
        product_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        product_variant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        quantity_planned: {
            type: DataTypes.DECIMAL(15, 3),
            allowNull: false
        },
        quantity_produced: {
            type: DataTypes.DECIMAL(15, 3),
            defaultValue: 0.000
        },
        total_cost: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        status: {
            type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
            defaultValue: 'pending'
        },
        start_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        end_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'production_orders',
        underscored: true
    });

    ProductionOrder.associate = (models) => {
        ProductionOrder.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        ProductionOrder.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        ProductionOrder.belongsTo(models.Recipe, { as: 'recipe', foreignKey: 'recipe_id' });
        ProductionOrder.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        ProductionOrder.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        ProductionOrder.belongsTo(models.User, { as: 'user', foreignKey: 'user_id' });
        ProductionOrder.hasMany(models.ProductionOrderItem, { as: 'items', foreignKey: 'production_order_id' });
    };

    return ProductionOrder;
};
