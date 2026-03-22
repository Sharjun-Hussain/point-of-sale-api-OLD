module.exports = (sequelize, DataTypes) => {
    const BusinessPlan = sequelize.define('BusinessPlan', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        price_monthly: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        price_yearly: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        max_branches: {
            type: DataTypes.INTEGER,
            defaultValue: 1 // 1 for basic, -1 for unlimited
        },
        max_users: {
            type: DataTypes.INTEGER,
            defaultValue: 5
        },
        features: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'JSON array of enabled feature keys'
        },
        trial_days: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'business_plans',
        underscored: true
    });

    BusinessPlan.associate = (models) => {
        BusinessPlan.hasMany(models.Organization, {
            foreignKey: 'plan_id',
            as: 'organizations'
        });
    };

    return BusinessPlan;
};
