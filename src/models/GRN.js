module.exports = (sequelize, DataTypes) => {
    const GRN = sequelize.define('GRN', {
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
        purchase_order_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        supplier_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false // Received by
        },
        grn_number: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        received_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 2),
            defaultValue: 0.00
        },
        status: {
            type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
            defaultValue: 'completed'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        invoice_number: {
            type: DataTypes.STRING,
            allowNull: true
        },
        invoice_file: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'grns',
        underscored: true
    });

    return GRN;
};
