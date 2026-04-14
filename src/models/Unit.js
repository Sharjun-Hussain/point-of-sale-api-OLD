module.exports = (sequelize, DataTypes) => {
    const Unit = sequelize.define('Unit', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false // e.g., "Piece", "Kilogram"
        },
        short_name: {
            type: DataTypes.STRING,
            allowNull: false // e.g., "pc", "kg"
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
        tableName: 'units',
        underscored: true
    });

    Unit.associate = (models) => {
        Unit.hasMany(models.Product, { as: 'products', foreignKey: 'unit_id' });
        Unit.hasMany(models.Container, { as: 'containers', foreignKey: 'base_unit_id' });
        Unit.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return Unit;
};
