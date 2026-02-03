module.exports = (sequelize, DataTypes) => {
    const Supplier = sequelize.define('Supplier', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        contact_person: {
            type: DataTypes.STRING,
            allowNull: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'suppliers',
        underscored: true
    });

    return Supplier;
};
