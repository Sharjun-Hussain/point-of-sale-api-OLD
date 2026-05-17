module.exports = (sequelize, DataTypes) => {
    const TextLkTemplate = sequelize.define('TextLkTemplate', {
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
        body: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        dlt_template_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'textlk_templates',
        underscored: true
    });

    TextLkTemplate.associate = (models) => {
        TextLkTemplate.belongsTo(models.Organization, { foreignKey: 'organization_id' });
    };

    return TextLkTemplate;
};
