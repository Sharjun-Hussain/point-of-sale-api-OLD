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

    return Expense;
};
