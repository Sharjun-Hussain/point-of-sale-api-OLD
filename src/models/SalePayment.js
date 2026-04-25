module.exports = (sequelize, DataTypes) => {
    const SalePayment = sequelize.define('SalePayment', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        sale_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        payment_method: {
            type: DataTypes.STRING(50),
            allowNull: false // cash, card, bank_transfer, cheque, etc.
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        transaction_reference: {
            type: DataTypes.STRING,
            allowNull: true // Card transaction ID, Cheque number, etc.
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'sale_payments',
        underscored: true,
        timestamps: true
    });

    SalePayment.associate = (models) => {
        SalePayment.belongsTo(models.Sale, { foreignKey: 'sale_id', as: 'sale' });
        SalePayment.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    };

    return SalePayment;
};
