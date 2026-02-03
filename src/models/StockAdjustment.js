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
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'stock_adjustments',
        underscored: true
    });

    return StockAdjustment;
};
