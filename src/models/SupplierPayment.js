module.exports = (sequelize, DataTypes) => {
    const SupplierPayment = sequelize.define('SupplierPayment', {
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
        voucher_number: {
            type: DataTypes.STRING,
            allowNull: false
        },
        payment_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'supplier_payments',
        underscored: true,
        timestamps: true
    });

    SupplierPayment.associate = (models) => {
        SupplierPayment.belongsTo(models.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });
        SupplierPayment.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        SupplierPayment.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        SupplierPayment.hasMany(models.SupplierPaymentMethod, { as: 'methods', foreignKey: 'supplier_payment_id' });
    };

    return SupplierPayment;
};
