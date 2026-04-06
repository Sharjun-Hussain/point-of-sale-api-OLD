module.exports = (sequelize, DataTypes) => {
    const Stock = sequelize.define('Stock', {
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
            defaultValue: 0.00
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'stocks',
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['branch_id', 'product_id', 'product_variant_id']
            }
        ]
    });

    return Stock;
};
