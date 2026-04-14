module.exports = (sequelize, DataTypes) => {
    const RolePermission = sequelize.define('RolePermission', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        role_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'roles', key: 'id' }
        },
        permission_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'permissions', key: 'id' }
        }
    }, {
        tableName: 'role_permissions',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return RolePermission;
};
