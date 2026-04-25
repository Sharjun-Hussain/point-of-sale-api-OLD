module.exports = (sequelize, DataTypes) => {
    const ExpensePaymentMethod = sequelize.define('ExpensePaymentMethod', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        expense_id: {
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
        tableName: 'expense_payment_methods',
        underscored: true,
        timestamps: true
    });

    ExpensePaymentMethod.associate = (models) => {
        ExpensePaymentMethod.belongsTo(models.Expense, { as: 'expense', foreignKey: 'expense_id' });
        ExpensePaymentMethod.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        ExpensePaymentMethod.belongsTo(models.Transaction, { as: 'transaction', foreignKey: 'transaction_id' });
    };

    return ExpensePaymentMethod;
};
