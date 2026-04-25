module.exports = (sequelize, DataTypes) => {
    const Shift = sequelize.define('Shift', {
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
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        opening_time: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
        },
        closing_time: {
            type: DataTypes.DATE,
            allowNull: true
        },
        opening_cash: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        closing_cash: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true
        },
        expected_cash: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true
        },
        variance: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('open', 'closed'),
            defaultValue: 'open'
        }
    }, {
        tableName: 'shifts',
        underscored: true
    });

    Shift.associate = (models) => {
        Shift.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Shift.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        Shift.belongsTo(models.User, { as: 'cashier', foreignKey: 'user_id' });
        Shift.hasMany(models.ShiftTransaction, { as: 'transactions', foreignKey: 'shift_id' });
        Shift.hasMany(models.Sale, { as: 'sales', foreignKey: 'shift_id' });
    };

    return Shift;
};
