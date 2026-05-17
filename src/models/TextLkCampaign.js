module.exports = (sequelize, DataTypes) => {
    const TextLkCampaign = sequelize.define('TextLkCampaign', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        contact_list_id: {
            type: DataTypes.STRING,
            allowNull: false
        },
        dlt_template_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        schedule_time: {
            type: DataTypes.DATE,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('Pending', 'Scheduled', 'Sent', 'Failed'),
            defaultValue: 'Pending'
        },
        response_data: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        tableName: 'textlk_campaigns',
        underscored: true
    });

    TextLkCampaign.associate = (models) => {
        TextLkCampaign.belongsTo(models.Organization, { foreignKey: 'organization_id' });
    };

    return TextLkCampaign;
};
