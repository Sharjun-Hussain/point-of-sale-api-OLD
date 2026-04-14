module.exports = (sequelize, DataTypes) => {
    const GRNItem = sequelize.define('GRNItem', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        grn_id: {
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
        quantity_ordered: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        quantity_received: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        free_quantity: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        unit_cost: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        expiry_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        batch_number: {
            type: DataTypes.STRING,
            allowNull: true
        },
        product_batch_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'grn_items',
        underscored: true
    });

    GRNItem.associate = (models) => {
        GRNItem.belongsTo(models.GRN, { as: 'grn', foreignKey: 'grn_id' });
        GRNItem.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        GRNItem.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        GRNItem.belongsTo(models.ProductBatch, { as: 'batch', foreignKey: 'product_batch_id' });
        GRNItem.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return GRNItem;
};
