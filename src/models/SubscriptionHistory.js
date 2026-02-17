module.exports = (sequelize, DataTypes) => {
    const SubscriptionHistory = sequelize.define('SubscriptionHistory', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'organizations',
                key: 'id'
            }
        },
        subscription_tier: {
            type: DataTypes.ENUM('Basic', 'Pro', 'Enterprise'),
            allowNull: false
        },
        billing_cycle: {
            type: DataTypes.ENUM('Monthly', 'Yearly', 'Lifetime'),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        currency: {
            type: DataTypes.STRING,
            defaultValue: 'USD'
        },
        purchase_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        expiry_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        payment_status: {
            type: DataTypes.ENUM('Paid', 'Pending', 'Failed'),
            defaultValue: 'Paid'
        },
        transaction_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        payment_method: {
            type: DataTypes.STRING,
            allowNull: true
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'subscription_histories',
        underscored: true
    });

    SubscriptionHistory.associate = (models) => {
        SubscriptionHistory.belongsTo(models.Organization, {
            foreignKey: 'organization_id',
            as: 'organization'
        });
    };

    return SubscriptionHistory;
};
