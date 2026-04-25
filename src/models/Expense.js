module.exports = (sequelize, DataTypes) => {
    const Expense = sequelize.define('Expense', {
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
        expense_category_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        expense_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false // User who recorded the expense
        },
        payment_method: {
            type: DataTypes.STRING,
            allowNull: true
        },
        receipt_image: {
            type: DataTypes.STRING,
            allowNull: true
        },
        reference_no: {
            type: DataTypes.STRING,
            allowNull: true
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'expenses',
        underscored: true
    });

    Expense.associate = (models) => {
        Expense.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Expense.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        Expense.belongsTo(models.ExpenseCategory, { as: 'category', foreignKey: 'expense_category_id' });
        Expense.belongsTo(models.User, { as: 'recorded_by_user', foreignKey: 'user_id' });
        Expense.belongsTo(models.User, { as: 'cashier', foreignKey: 'user_id' }); // Alias for reports
        Expense.hasMany(models.Cheque, { as: 'cheques', foreignKey: 'reference_id', constraints: false });
        Expense.hasMany(models.ExpensePaymentMethod, { as: 'payment_methods', foreignKey: 'expense_id' });
        Expense.hasMany(models.ExpensePaymentMethod, { as: 'payments', foreignKey: 'expense_id' }); // Alias for reports


    };

    return Expense;
};
