module.exports = (sequelize, DataTypes) => {
    const Container = sequelize.define('Container', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false // e.g., "Box", "Packet", "Bottle"
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'containers',
        underscored: true
    });

    return Container;
};
