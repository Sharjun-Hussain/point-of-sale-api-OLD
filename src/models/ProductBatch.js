module.exports = (sequelize, DataTypes) => {
    const ProductBatch = sequelize.define('ProductBatch', {
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
        batch_number: {
            type: DataTypes.STRING,
            allowNull: true
        },
        expiry_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        purchase_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        cost_price: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        selling_price: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        wholesale_price: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        quantity: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        expiration_status: {
            type: DataTypes.ENUM('normal', 'warning', 'critical', 'expired'),
            defaultValue: 'normal'
        },
        opening_stock_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'product_batches',
        underscored: true,
        indexes: [
            {
                fields: ['branch_id']
            },
            {
                fields: ['product_id', 'product_variant_id']
            },
            {
                fields: ['batch_number']
            }
        ]
    });

    ProductBatch.associate = (models) => {
        ProductBatch.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
        ProductBatch.belongsTo(models.ProductVariant, { foreignKey: 'product_variant_id', as: 'variant' });
        ProductBatch.belongsTo(models.Branch, { foreignKey: 'branch_id', as: 'branch' });
        ProductBatch.hasMany(models.GRNItem, { foreignKey: 'product_batch_id', as: 'grn_items' });
    };

    return ProductBatch;
};
