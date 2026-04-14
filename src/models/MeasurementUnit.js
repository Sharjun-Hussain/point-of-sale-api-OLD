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

    MeasurementUnit.associate = (models) => {
        MeasurementUnit.hasMany(models.Product, { as: 'products', foreignKey: 'measurement_id' });
        MeasurementUnit.hasMany(models.Container, { as: 'containers', foreignKey: 'measurement_unit_id' });
        MeasurementUnit.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return MeasurementUnit;
};
