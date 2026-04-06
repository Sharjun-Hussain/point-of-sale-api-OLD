module.exports = (sequelize, DataTypes) => {
    const MeasurementUnit = sequelize.define('MeasurementUnit', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false // e.g., "Kilogram", "Liter"
        },
        short_name: {
            type: DataTypes.STRING,
            allowNull: false // e.g., "kg", "l"
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
        tableName: 'measurement_units',
        underscored: true
    });

    return MeasurementUnit;
};
