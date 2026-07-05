module.exports = (sequelize, DataTypes) => {
    const Distributor = sequelize.define('Distributor', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        company_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        credit_limit: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        opening_balance: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'distributors',
        underscored: true,
        indexes: [
            {
                name: 'distributors_org_email_unique_idx',
                unique: true,
                fields: ['organization_id', 'email']
            },
            {
                name: 'distributors_org_phone_unique_idx',
                unique: true,
                fields: ['organization_id', 'phone']
            }
        ]
    });

    Distributor.associate = (models) => {
        Distributor.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Distributor.hasMany(models.Sale, { as: 'sales', foreignKey: 'distributor_id' });
        Distributor.hasMany(models.Transaction, { as: 'transactions', foreignKey: 'distributor_id' });
        Distributor.hasMany(models.SaleReturn, { as: 'sale_returns', foreignKey: 'distributor_id' });
    };

    return Distributor;
};
