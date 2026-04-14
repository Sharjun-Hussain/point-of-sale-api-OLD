module.exports = (sequelize, DataTypes) => {
    const Branch = sequelize.define('Branch', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        organization_id: {
            type: DataTypes.UUID,
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
        address: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        city: {
            type: DataTypes.STRING,
            allowNull: true
        },
        code: {
            type: DataTypes.STRING,
            allowNull: true
        },
        opening_time: {
            type: DataTypes.STRING,
            allowNull: true
        },
        closing_time: {
            type: DataTypes.STRING,
            allowNull: true
        },
        is_main: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        manager_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'employees',
                key: 'id'
            }
        }
    }, {
        tableName: 'branches',
        underscored: true
    });

    Branch.associate = (models) => {
        Branch.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Branch.hasMany(models.Employee, { as: 'primaryEmployees', foreignKey: 'branch_id' });
        Branch.belongsTo(models.Employee, { as: 'manager', foreignKey: 'manager_id' });
        Branch.hasMany(models.Setting, { as: 'settings', foreignKey: 'branch_id' });
        Branch.belongsToMany(models.Employee, {
            through: models.EmployeeBranch,
            as: 'employees',
            foreignKey: 'branch_id',
            otherKey: 'employee_id'
        });
    };

    return Branch;
};
