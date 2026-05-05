'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('distributors', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
                allowNull: false
            },
            organization_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'organizations',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            phone: {
                type: Sequelize.STRING,
                allowNull: true
            },
            email: {
                type: Sequelize.STRING,
                allowNull: true
            },
            address: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            credit_limit: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0.00
            },
            current_balance: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0.00
            },
            status: {
                type: Sequelize.ENUM('active', 'inactive'),
                defaultValue: 'active'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false
            }
        });

        // Add distributor_id to sales
        await queryInterface.addColumn('sales', 'distributor_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'distributors',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });

        // Add distributor_id to transactions
        await queryInterface.addColumn('transactions', 'distributor_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'distributors',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });

        // Add distributor_id to sale_returns
        await queryInterface.addColumn('sale_returns', 'distributor_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'distributors',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('sale_returns', 'distributor_id');
        await queryInterface.removeColumn('transactions', 'distributor_id');
        await queryInterface.removeColumn('sales', 'distributor_id');
        await queryInterface.dropTable('distributors');
    }
};
