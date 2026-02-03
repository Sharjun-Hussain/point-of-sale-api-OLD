const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const SaleEmployee = sequelize.define('SaleEmployee', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        sale_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'sales',
                key: 'id'
            }
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        contribution_percentage: {
            type: DataTypes.DECIMAL(5, 2),
            defaultValue: 100.00,
            validate: {
                min: 0,
                max: 100
            }
        }
    }, {
        tableName: 'sale_employees',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false // No updates to this table
    });

    SaleEmployee.associate = (models) => {
        // Belongs to Sale
        SaleEmployee.belongsTo(models.Sale, {
            foreignKey: 'sale_id',
            as: 'sale'
        });

        // Belongs to User (Employee)
        SaleEmployee.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'employee'
        });
    };

    return SaleEmployee;
};
