module.exports = (sequelize, DataTypes) => {
    const EmployeeBranch = sequelize.define('EmployeeBranch', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        employee_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'employees',
                key: 'id'
            }
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'branches',
                key: 'id'
            }
        },
        is_primary: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'employee_branches',
        underscored: true
    });

    return EmployeeBranch;
};
