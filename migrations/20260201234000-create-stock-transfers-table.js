'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('stock_transfers', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            organization_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            from_branch_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            to_branch_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            transfer_number: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            transfer_date: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW
            },
            status: {
                type: Sequelize.ENUM('pending', 'completed', 'cancelled'),
                defaultValue: 'pending'
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

        await queryInterface.createTable('stock_transfer_items', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            stock_transfer_id: {
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
        await queryInterface.dropTable('stock_transfer_items');
        await queryInterface.dropTable('stock_transfers');
    }
};
