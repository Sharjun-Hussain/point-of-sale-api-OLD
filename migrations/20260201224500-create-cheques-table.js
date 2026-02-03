'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('cheques', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
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
            branch_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'branches',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            type: {
                type: Sequelize.ENUM('receivable', 'payable'),
                allowNull: false
            },
            cheque_number: {
                type: Sequelize.STRING,
                allowNull: false
            },
            bank_name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            branch_name: {
                type: Sequelize.STRING,
                allowNull: true
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            cheque_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            received_issued_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('pending', 'cleared', 'bounced', 'cancelled'),
                allowNull: false,
                defaultValue: 'pending'
            },
            cleared_date: {
                type: Sequelize.DATE,
                allowNull: true
            },
            payee_payor_name: {
                type: Sequelize.STRING,
                allowNull: true
            },
            reference_type: {
                type: Sequelize.ENUM('sale', 'purchase', 'expense', 'manual'),
                allowNull: true,
                defaultValue: 'manual'
            },
            reference_id: {
                type: Sequelize.UUID,
                allowNull: true
            },
            account_id: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'accounts',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            note: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        // Add indexes for performance
        await queryInterface.addIndex('cheques', ['organization_id'], { name: 'idx_cheques_org' });
        await queryInterface.addIndex('cheques', ['branch_id'], { name: 'idx_cheques_branch' });
        await queryInterface.addIndex('cheques', ['type'], { name: 'idx_cheques_type' });
        await queryInterface.addIndex('cheques', ['status'], { name: 'idx_cheques_status' });
        await queryInterface.addIndex('cheques', ['cheque_date'], { name: 'idx_cheques_date' });
        await queryInterface.addIndex('cheques', ['reference_id'], { name: 'idx_cheques_ref' });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('cheques');
    }
};
