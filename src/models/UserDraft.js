module.exports = (sequelize, DataTypes) => {
    const UserDraft = sequelize.define('UserDraft', {
        id: {
            type: DataTypes.STRING(100),
            primaryKey: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        form_type: {
            type: DataTypes.STRING,
            allowNull: false
        },
        summary: {
            type: DataTypes.STRING,
            allowNull: true
        },
        payload: {
            type: DataTypes.JSON,
            allowNull: false
        }
    }, {
        tableName: 'user_drafts',
        underscored: true
    });

    UserDraft.associate = (models) => {
        UserDraft.belongsTo(models.User, { as: 'user', foreignKey: 'user_id' });
        UserDraft.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return UserDraft;
};
