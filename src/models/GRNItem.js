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

    return GRNItem;
};
