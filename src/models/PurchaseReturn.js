module.exports = (sequelize, DataTypes) => {
    const PurchaseReturn = sequelize.define('PurchaseReturn', {
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
        supplier_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        purchase_order_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        grn_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        return_number: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        return_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
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
        tableName: 'purchase_returns',
        underscored: true
    });

    PurchaseReturn.associate = (models) => {
        PurchaseReturn.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        PurchaseReturn.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        PurchaseReturn.belongsTo(models.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });
        PurchaseReturn.belongsTo(models.User, { as: 'created_by_user', foreignKey: 'user_id' });
        PurchaseReturn.belongsTo(models.PurchaseOrder, { as: 'purchase_order', foreignKey: 'purchase_order_id' });
        PurchaseReturn.belongsTo(models.GRN, { as: 'grn', foreignKey: 'grn_id' });
        PurchaseReturn.hasMany(models.PurchaseReturnItem, { as: 'items', foreignKey: 'purchase_return_id' });
    };

    return PurchaseReturn;
};
