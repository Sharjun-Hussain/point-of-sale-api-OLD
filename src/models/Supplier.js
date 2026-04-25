module.exports = (sequelize, DataTypes) => {
    const Supplier = sequelize.define('Supplier', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        contact_person: {
            type: DataTypes.STRING,
            allowNull: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'suppliers',
        underscored: true
    });

    Supplier.associate = (models) => {
        Supplier.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Supplier.hasMany(models.Product, { as: 'products', foreignKey: 'supplier_id' });
        Supplier.belongsToMany(models.Product, {
            through: models.ProductSupplier,
            as: 'supplied_products',
            foreignKey: 'supplier_id',
            otherKey: 'product_id'
        });
        Supplier.hasMany(models.PurchaseOrder, { as: 'purchase_orders', foreignKey: 'supplier_id' });
        Supplier.hasMany(models.PurchaseReturn, { as: 'purchase_returns', foreignKey: 'supplier_id' });
        Supplier.hasMany(models.Transaction, { as: 'transactions', foreignKey: 'supplier_id' });
        Supplier.hasMany(models.GRN, { as: 'grns', foreignKey: 'supplier_id' });
        Supplier.hasMany(models.SupplierPayment, { as: 'payments', foreignKey: 'supplier_id' });

    };

    return Supplier;
};
