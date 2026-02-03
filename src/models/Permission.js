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

    return Permission;
};
