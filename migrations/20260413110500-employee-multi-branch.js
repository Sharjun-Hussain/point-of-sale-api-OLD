'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create employee_branches join table
    await queryInterface.createTable('employee_branches', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
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
      is_primary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // 2. Data Migration: Populate join table with existing primary branch assignments
    const [employees] = await queryInterface.sequelize.query(
      'SELECT id, branch_id FROM employees WHERE branch_id IS NOT NULL'
    );

    if (employees && employees.length > 0) {
      const crypto = require('crypto');
      const assignments = employees.map(emp => ({
        id: crypto.randomUUID(),
        employee_id: emp.id,
        branch_id: emp.branch_id,
        is_primary: true,
        created_at: new Date(),
        updated_at: new Date()
      }));

      await queryInterface.bulkInsert('employee_branches', assignments);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('employee_branches');
  }
};
