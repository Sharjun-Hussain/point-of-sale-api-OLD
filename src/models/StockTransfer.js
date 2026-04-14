module.exports = (sequelize, DataTypes) => {
    const StockTransfer = sequelize.define('StockTransfer', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        from_branch_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        to_branch_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        transfer_number: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        transfer_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        status: {
            type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
            defaultValue: 'pending'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'stock_transfers',
        underscored: true
    });

    StockTransfer.associate = (models) => {
        StockTransfer.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        StockTransfer.belongsTo(models.Branch, { as: 'from_branch', foreignKey: 'from_branch_id' });
        StockTransfer.belongsTo(models.Branch, { as: 'to_branch', foreignKey: 'to_branch_id' });
        StockTransfer.belongsTo(models.User, { as: 'user', foreignKey: 'user_id' });
        StockTransfer.hasMany(models.StockTransferItem, { as: 'items', foreignKey: 'stock_transfer_id' });
    };

    return StockTransfer;
};
