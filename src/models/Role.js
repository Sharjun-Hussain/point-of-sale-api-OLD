module.exports = (sequelize, DataTypes) => {
    const Role = sequelize.define('Role', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'roles',
        underscored: true,
        indexes: [
            {
                name: 'roles_org_name_unique_idx',
                unique: true,
                fields: ['organization_id', 'name']
            }
        ]
    });

    Role.associate = (models) => {
        Role.belongsToMany(models.User, {
            through: models.UserRole,
            as: 'users',
            foreignKey: 'role_id',
            otherKey: 'user_id'
        });
        Role.belongsToMany(models.Permission, {
            through: models.RolePermission,
            as: 'permissions',
            foreignKey: 'role_id',
            otherKey: 'permission_id'
        });
    };

    return Role;
};
