module.exports = (sequelize, DataTypes) => {
    const SupplierPaymentMethod = sequelize.define('SupplierPaymentMethod', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        supplier_payment_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        payment_method: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        reference_number: {
            type: DataTypes.STRING,
            allowNull: true
        },
        transaction_id: {
            type: DataTypes.UUID,
            allowNull: true // Link to general ledger Transaction
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'supplier_payment_methods',
        underscored: true,
        timestamps: true
    });

    SupplierPaymentMethod.associate = (models) => {
        SupplierPaymentMethod.belongsTo(models.SupplierPayment, { as: 'payment', foreignKey: 'supplier_payment_id' });
        SupplierPaymentMethod.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        SupplierPaymentMethod.belongsTo(models.Transaction, { as: 'transaction', foreignKey: 'transaction_id' });
    };

    return SupplierPaymentMethod;
};
