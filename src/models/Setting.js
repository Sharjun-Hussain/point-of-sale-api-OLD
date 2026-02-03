module.exports = (sequelize, DataTypes) => {
    const Setting = sequelize.define('Setting', {
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
            allowNull: true
        },
        category: {
            type: DataTypes.STRING, // 'general', 'pos', 'communication', 'receipt'
            allowNull: false
        },
        settings_data: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        }
    }, {
        tableName: 'settings',
        underscored: true,
        uniqueKeys: {
            unique_setting: {
                fields: ['organization_id', 'branch_id', 'category']
            }
        }
    });

    return Setting;
};
