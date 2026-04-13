module.exports = (sequelize, DataTypes) => {
    const Employee = sequelize.define('Employee', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        first_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        last_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true
        },
        nic: {
            type: DataTypes.STRING,
            allowNull: true
        },
        joined_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        designation: {
            type: DataTypes.STRING,
            allowNull: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'employees',
        underscored: true
    });

    Employee.associate = (models) => {
        Employee.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        Employee.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
        
        // Primary Master Branch
        Employee.belongsTo(models.Branch, { foreignKey: 'branch_id', as: 'primaryBranch' });
        
        // All Assigned Branches (including secondary)
        Employee.belongsToMany(models.Branch, {
            through: 'employee_branches',
            as: 'branches',
            foreignKey: 'employee_id',
            otherKey: 'branch_id'
        });
    };

    return Employee;
};
