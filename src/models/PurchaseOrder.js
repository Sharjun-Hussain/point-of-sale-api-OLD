module.exports = (sequelize, DataTypes) => {
    const PurchaseOrder = sequelize.define('PurchaseOrder', {
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
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        po_number: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        order_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        expected_delivery_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        status: {
            type: DataTypes.ENUM('ordered', 'pending', 'received', 'partially_received', 'cancelled'),
            defaultValue: 'ordered'
        }
    }, {
        tableName: 'purchase_orders',
        underscored: true
    });

    PurchaseOrder.associate = (models) => {
        PurchaseOrder.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        PurchaseOrder.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        PurchaseOrder.belongsTo(models.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });
        PurchaseOrder.belongsTo(models.User, { as: 'created_by_user', foreignKey: 'user_id' });
        PurchaseOrder.hasMany(models.PurchaseOrderItem, { as: 'items', foreignKey: 'purchase_order_id' });
        PurchaseOrder.hasMany(models.GRN, { as: 'grns', foreignKey: 'purchase_order_id' });
        PurchaseOrder.hasMany(models.PurchaseReturn, { as: 'returns', foreignKey: 'purchase_order_id' });
    };

    return PurchaseOrder;
};
