module.exports = (sequelize, DataTypes) => {
    const Wastage = sequelize.define('Wastage', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        branch_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        product_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        product_variant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        quantity: {
            type: DataTypes.DECIMAL(15, 4),
            allowNull: false
        },
        wastage_type: {
            type: DataTypes.ENUM('raw_material', 'finished_good', 'semi_finished'),
            defaultValue: 'finished_good'
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: false
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false
        }
    }, {
        tableName: 'wastages',
        underscored: true
    });

    Wastage.associate = (models) => {
        Wastage.belongsTo(models.Organization, { as: 'organization', foreignKey: 'organization_id' });
        Wastage.belongsTo(models.Branch, { as: 'branch', foreignKey: 'branch_id' });
        Wastage.belongsTo(models.Product, { as: 'product', foreignKey: 'product_id' });
        Wastage.belongsTo(models.ProductVariant, { as: 'variant', foreignKey: 'product_variant_id' });
        Wastage.belongsTo(models.User, { as: 'user', foreignKey: 'user_id' });
    };

    return Wastage;
};
