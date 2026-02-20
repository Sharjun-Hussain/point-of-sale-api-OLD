module.exports = (sequelize, DataTypes) => {
    const RefreshToken = sequelize.define('RefreshToken', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        token: {
            type: DataTypes.STRING(500),
            allowNull: false,
            unique: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        revoked_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        replaced_by_token: {
            type: DataTypes.STRING(500),
            allowNull: true
        }
    }, {
        tableName: 'refresh_tokens',
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['token']
            },
            {
                fields: ['user_id']
            }
        ]
    });

    return RefreshToken;
};
