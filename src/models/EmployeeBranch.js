module.exports = (sequelize, DataTypes) => {
    const EmployeeBranch = sequelize.define('EmployeeBranch', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            // NOT primaryKey — the table already has a composite PK (employee_id + branch_id)
            // from the BelongsToMany association. Making this primaryKey too causes MySQL error
            // ER_MULTIPLE_PRI_KEY. We keep it as unique so it's still traceable.
            unique: true,
            allowNull: true
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
