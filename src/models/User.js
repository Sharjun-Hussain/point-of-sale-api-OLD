module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        profile_image: {
            type: DataTypes.STRING,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        last_login: {
            type: DataTypes.DATE,
            allowNull: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        reset_password_token: {
            type: DataTypes.STRING,
            allowNull: true
        },
        reset_password_expires: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'users',
        underscored: true
    });

    User.associate = (models) => {
        User.belongsToMany(models.Role, {
            through: 'user_roles',
            as: 'roles',
            foreignKey: 'user_id',
            otherKey: 'role_id'
        });
        User.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        User.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        User.hasMany(models.RefreshToken, { as: 'refresh_tokens', foreignKey: 'user_id' });
        User.hasOne(models.Employee, { as: 'employee', foreignKey: 'user_id' });
        User.belongsToMany(models.Branch, {
            through: 'user_branches',
            as: 'branches',
            foreignKey: 'user_id',
            otherKey: 'branch_id'
        });
        User.belongsTo(models.Employee, { as: 'managerProfile', foreignKey: 'id', targetKey: 'user_id', constraints: false });
    };

    return User;
};
