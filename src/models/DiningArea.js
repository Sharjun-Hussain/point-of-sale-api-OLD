module.exports = (sequelize, DataTypes) => {
    const DiningArea = sequelize.define('DiningArea', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'dining_areas',
        underscored: true
    });

    DiningArea.associate = (models) => {
        DiningArea.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        DiningArea.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        DiningArea.hasMany(models.DiningTable, { as: 'tables', foreignKey: 'dining_area_id', onDelete: 'CASCADE' });
    };

    return DiningArea;
};
