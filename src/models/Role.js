module.exports = (sequelize, DataTypes) => {
    const Role = sequelize.define('Role', {
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
        underscored: true
    });

    Role.associate = (models) => {
        Role.belongsToMany(models.User, {
            through: 'user_roles',
            as: 'users',
            foreignKey: 'role_id',
            otherKey: 'user_id'
        });
        Role.belongsToMany(models.Permission, {
            through: 'role_permissions',
            as: 'permissions',
            foreignKey: 'role_id',
            otherKey: 'permission_id'
        });
    };

    return Role;
};
