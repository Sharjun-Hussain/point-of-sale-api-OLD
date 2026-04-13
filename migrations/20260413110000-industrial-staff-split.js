'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create employees table
    await queryInterface.createTable('employees', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      first_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      nic: {
        type: Sequelize.STRING,
        allowNull: true
      },
      joined_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      designation: {
        type: Sequelize.STRING,
        allowNull: true
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id'
        }
      },
      branch_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'branches',
          key: 'id'
        }
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    // 2. Data Migration: Copy data from users to employees
    const [users] = await queryInterface.sequelize.query(
      'SELECT id, name, first_name, last_name, email, phone, nic, joined_date, organization_id, branch_id, is_active FROM users'
    );

    if (users && users.length > 0) {
      // Filter out users without organization_id (system admins)
      const validUsers = users.filter(u => u.organization_id);
      
      if (validUsers.length > 0) {
        const crypto = require('crypto');
        const employeesWithIds = validUsers.map(user => ({
          id: crypto.randomUUID(),
          user_id: user.id,
          name: user.name,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          nic: user.nic,
          joined_date: user.joined_date,
          organization_id: user.organization_id,
          branch_id: user.branch_id,
          is_active: user.is_active,
          created_at: new Date(),
          updated_at: new Date()
        }));

        await queryInterface.bulkInsert('employees', employeesWithIds);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('employees');
  }
};
