module.exports = (sequelize, DataTypes) => {
    const SaleReturnPayment = sequelize.define('SaleReturnPayment', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        sale_return_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        payment_method: {
            type: DataTypes.STRING(50),
            allowNull: false // cash, bank, store_credit
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00
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
        tableName: 'sale_return_payments',
        underscored: true,
        timestamps: true
    });

    SaleReturnPayment.associate = (models) => {
        SaleReturnPayment.belongsTo(models.SaleReturn, { as: 'sale_return', foreignKey: 'sale_return_id' });
        SaleReturnPayment.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        SaleReturnPayment.belongsTo(models.Transaction, { as: 'transaction', foreignKey: 'transaction_id' });
    };

    return SaleReturnPayment;
};
