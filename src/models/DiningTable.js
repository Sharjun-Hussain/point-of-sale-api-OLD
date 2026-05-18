module.exports = (sequelize, DataTypes) => {
    const DiningTable = sequelize.define('DiningTable', {
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
        dining_area_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        table_number: {
            type: DataTypes.STRING,
            allowNull: false
        },
        capacity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 4
        },
        status: {
            type: DataTypes.ENUM('free', 'occupied', 'reserved'),
            defaultValue: 'free',
            allowNull: false
        },
        current_sale_id: {
            type: DataTypes.UUID,
            allowNull: true
        }
    }, {
        tableName: 'dining_tables',
        underscored: true
    });

    DiningTable.associate = (models) => {
        DiningTable.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        DiningTable.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        DiningTable.belongsTo(models.DiningArea, { as: 'area', foreignKey: 'dining_area_id' });
        DiningTable.belongsTo(models.Sale, { as: 'current_sale', foreignKey: 'current_sale_id', constraints: false });
    };

    return DiningTable;
};
