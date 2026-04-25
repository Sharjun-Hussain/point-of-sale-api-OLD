module.exports = (sequelize, DataTypes) => {
    const Transaction = sequelize.define('Transaction', {
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
        account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM('debit', 'credit'),
            allowNull: false
        },
        transaction_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        reference_type: {
            type: DataTypes.STRING, // 'sale', 'purchase', 'expense', etc.
            allowNull: true
        },
        reference_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        customer_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        supplier_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'transactions',
        underscored: true
    });

    Transaction.associate = (models) => {
        Transaction.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Transaction.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        Transaction.belongsTo(models.Account, { as: 'account', foreignKey: 'account_id' });
        Transaction.belongsTo(models.Customer, { as: 'customer', foreignKey: 'customer_id' });
        Transaction.belongsTo(models.Supplier, { as: 'supplier', foreignKey: 'supplier_id' });
        Transaction.hasOne(models.SupplierPaymentMethod, { as: 'supplier_payment_method', foreignKey: 'transaction_id' });

    };

    return Transaction;
};
