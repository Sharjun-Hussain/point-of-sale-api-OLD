module.exports = (sequelize, DataTypes) => {
    const Cheque = sequelize.define('Cheque', {
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
        type: {
            type: DataTypes.ENUM('receivable', 'payable'),
            allowNull: false
        },
        cheque_number: {
            type: DataTypes.STRING,
            allowNull: false
        },
        bank_name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        branch_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        cheque_date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        received_issued_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        status: {
            type: DataTypes.ENUM('pending', 'cleared', 'bounced', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending'
        },
        cleared_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        payee_payor_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        reference_type: {
            type: DataTypes.ENUM('sale', 'purchase', 'expense', 'manual'),
            allowNull: true,
            defaultValue: 'manual'
        },
        reference_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        account_id: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'Target bank account for clearing'
        },
        note: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'cheques',
        underscored: true
    });

    Cheque.associate = (models) => {
        Cheque.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Cheque.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        Cheque.belongsTo(models.Account, { as: 'account', foreignKey: 'account_id' });
        
        // Polymorphic-style associations
        Cheque.belongsTo(models.Sale, { as: 'sale', foreignKey: 'reference_id', constraints: false });
        Cheque.belongsTo(models.GRN, { as: 'grn', foreignKey: 'reference_id', constraints: false });
        Cheque.belongsTo(models.Expense, { as: 'expense', foreignKey: 'reference_id', constraints: false });
    };

    return Cheque;
};
