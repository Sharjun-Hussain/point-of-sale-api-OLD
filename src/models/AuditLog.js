module.exports = (sequelize, DataTypes) => {
    const AuditLog = sequelize.define('AuditLog', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'organizations',
                key: 'id'
            }
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: true, // Nullable for system events
            references: {
                model: 'users',
                key: 'id'
            }
        },
        action: {
            type: DataTypes.STRING(50),
            allowNull: false,
            comment: 'Action type: CREATE, UPDATE, DELETE, LOGIN, LOGOUT, etc.'
        },
        entity_type: {
            type: DataTypes.STRING(100),
            allowNull: true,
            comment: 'Type of entity affected: Sale, Product, User, etc.'
        },
        entity_id: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'ID of the affected entity'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Human-readable description of the action'
        },
        old_values: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'Previous state for updates/deletes'
        },
        new_values: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'New state for creates/updates'
        },
        ip_address: {
            type: DataTypes.STRING(45),
            allowNull: true,
            comment: 'IP address of the user (supports IPv6)'
        },
        user_agent: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Browser/client user agent string'
        },
        status: {
            type: DataTypes.ENUM('success', 'failure'),
            defaultValue: 'success',
            allowNull: false
        },
        error_message: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Error message if status is failure'
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'Additional context and information'
        }
    }, {
        tableName: 'audit_logs',
        timestamps: true,
        updatedAt: false, // Audit logs should be immutable
        indexes: [
            {
                name: 'idx_audit_org_created',
                fields: ['organization_id', 'created_at']
            },
            {
                name: 'idx_audit_user_created',
                fields: ['user_id', 'created_at']
            },
            {
                name: 'idx_audit_entity',
                fields: ['entity_type', 'entity_id']
            },
            {
                name: 'idx_audit_action',
                fields: ['action']
            },
            {
                name: 'idx_audit_created',
                fields: ['created_at']
            }
        ]
    });

    AuditLog.associate = (models) => {
        AuditLog.belongsTo(models.Organization, {
            foreignKey: 'organization_id',
            as: 'organization'
        });
        AuditLog.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user'
        });
    };

    return AuditLog;
};
