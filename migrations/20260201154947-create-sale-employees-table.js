'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sale_employees', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      sale_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'sales',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contribution_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 100.00,
        comment: 'Percentage of sale attributed to this employee'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for performance
    await queryInterface.addIndex('sale_employees', ['sale_id'], {
      name: 'idx_sale_employees_sale'
    });

    await queryInterface.addIndex('sale_employees', ['user_id'], {
      name: 'idx_sale_employees_user'
    });

    await queryInterface.addIndex('sale_employees', ['sale_id', 'user_id'], {
      name: 'idx_sale_employees_sale_user',
      unique: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('sale_employees');
  }
};
