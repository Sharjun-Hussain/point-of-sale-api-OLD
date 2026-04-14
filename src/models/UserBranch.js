module.exports = (sequelize, DataTypes) => {
    const UserBranch = sequelize.define('UserBranch', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' }
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'branches', key: 'id' }
        }
    }, {
        tableName: 'user_branches',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return UserBranch;
};
