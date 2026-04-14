module.exports = (sequelize, DataTypes) => {
    const Permission = sequelize.define('Permission', {
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
        group_name: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'permissions',
        underscored: true
    });

    Permission.associate = (models) => {
        Permission.belongsToMany(models.Role, {
            through: 'role_permissions',
            as: 'roles',
            foreignKey: 'permission_id',
            otherKey: 'role_id'
        });
    };

    return Permission;
};
