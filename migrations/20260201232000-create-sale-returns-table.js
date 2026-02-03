'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('sale_returns', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            organization_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            branch_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            customer_id: {
                type: Sequelize.UUID,
                allowNull: true
            },
            sale_id: {
                type: Sequelize.UUID,
                allowNull: true
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            return_number: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            return_date: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW
            },
            total_amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            refund_amount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0.00
            },
            refund_method: {
                type: Sequelize.STRING,
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('completed', 'pending', 'cancelled'),
                defaultValue: 'completed'
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        await queryInterface.createTable('sale_return_items', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            sale_return_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            product_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            product_variant_id: {
                type: Sequelize.UUID,
                allowNull: true
            },
            quantity: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            unit_price: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            total_amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            reason: {
                type: Sequelize.STRING,
                allowNull: true
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('sale_return_items');
        await queryInterface.dropTable('sale_returns');
    }
};
