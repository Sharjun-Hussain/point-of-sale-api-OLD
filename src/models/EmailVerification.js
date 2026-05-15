module.exports = (sequelize, DataTypes) => {
    const EmailVerification = sequelize.define('EmailVerification', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                isEmail: true
            }
        },
        code: {
            type: DataTypes.STRING,
            allowNull: false
        },
        is_verified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'email_verifications',
        underscored: true,
        indexes: [
            {
                name: 'email_verifications_email_idx',
                fields: ['email']
            },
            {
                name: 'email_verifications_org_email_idx',
                fields: ['organization_id', 'email']
            }
        ]
    });

    EmailVerification.associate = (models) => {
        EmailVerification.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return EmailVerification;
};
