module.exports = (sequelize, DataTypes) => {
    const StockOpening = sequelize.define('StockOpening', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false // Who did the opening
        },
        reference_number: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        opening_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        notes: {
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
        },
        total_value: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        }
    }, {
        tableName: 'stock_openings',
        underscored: true
    });

    StockOpening.associate = (models) => {
        StockOpening.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        StockOpening.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        StockOpening.belongsTo(models.User, { as: 'user', foreignKey: 'user_id' });
        StockOpening.hasMany(models.ProductBatch, { as: 'batches', foreignKey: 'opening_stock_id' });
    };

    return StockOpening;
};
