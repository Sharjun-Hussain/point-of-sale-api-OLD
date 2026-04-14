module.exports = (sequelize, DataTypes) => {
    const StockAdjustment = sequelize.define('StockAdjustment', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        branch_id: {
            type: DataTypes.UUID,
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
        quantity: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM('addition', 'subtraction', 'set_to'),
            allowNull: false
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: true
        },
        reason_category: {
            type: DataTypes.STRING,
            allowNull: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'stock_adjustments',
        underscored: true
    });

    StockAdjustment.associate = (models) => {
        StockAdjustment.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        StockAdjustment.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        StockAdjustment.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        StockAdjustment.belongsTo(models.User, { as: 'adjusted_by_user', foreignKey: 'user_id' });
        StockAdjustment.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return StockAdjustment;
};
