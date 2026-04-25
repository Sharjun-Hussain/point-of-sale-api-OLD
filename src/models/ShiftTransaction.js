module.exports = (sequelize, DataTypes) => {
    const ShiftTransaction = sequelize.define('ShiftTransaction', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        shift_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM('pay_in', 'drop', 'payout'),
            allowNull: false // pay_in = adding cash to drawer mid-day, drop = safe drop, payout = paying vendor from drawer
        },
        amount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'shift_transactions',
        underscored: true
    });

    ShiftTransaction.associate = (models) => {
        ShiftTransaction.belongsTo(models.Shift, { as: 'shift', foreignKey: 'shift_id' });
    };

    return ShiftTransaction;
};
