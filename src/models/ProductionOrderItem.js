module.exports = (sequelize, DataTypes) => {
    const ProductionOrderItem = sequelize.define('ProductionOrderItem', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        production_order_id: {
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
        quantity_planned: {
            type: DataTypes.DECIMAL(15, 3),
            allowNull: false
        },
        quantity_consumed: {
            type: DataTypes.DECIMAL(15, 3),
            defaultValue: 0.000
        },
        unit_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        cost_per_unit: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true
        }
    }, {
        tableName: 'production_order_items',
        underscored: true
    });

    ProductionOrderItem.associate = (models) => {
        ProductionOrderItem.belongsTo(models.ProductionOrder, { as: 'production_order', foreignKey: 'production_order_id' });
        ProductionOrderItem.belongsTo(models.Product, { as: 'raw_material', foreignKey: 'raw_material_id' });
        ProductionOrderItem.belongsTo(models.ProductVariant, { as: 'raw_material_variant', foreignKey: 'raw_material_variant_id' });
        ProductionOrderItem.belongsTo(models.Unit, { as: 'unit', foreignKey: 'unit_id' });
    };

    return ProductionOrderItem;
};
