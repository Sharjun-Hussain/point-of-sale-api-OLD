module.exports = (sequelize, DataTypes) => {
    const EmployeeBranch = sequelize.define('EmployeeBranch', {
        employee_id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,   // Composite PK part 1
            references: { model: 'employees', key: 'id' }
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,   // Composite PK part 2
            references: { model: 'branches', key: 'id' }
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
