module.exports = (sequelize, DataTypes) => {
    const Attachment = sequelize.define('Attachment', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        entity_type: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'e.g., PurchaseOrder, GRN, Expense'
        },
        entity_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        file_path: {
            type: DataTypes.STRING,
            allowNull: false
        },
        file_name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        file_size: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        file_type: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'attachments',
        underscored: true,
        indexes: [
            {
                fields: ['entity_type', 'entity_id']
            }
        ]
    });

    Attachment.associate = (models) => {
        Attachment.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
    };

    return Attachment;
};
