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
        slug: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        },
        measurement_unit_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'measurement_units',
                key: 'id'
            }
        },
        base_unit_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'units',
                key: 'id'
            }
        },
        capacity: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: 0
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
