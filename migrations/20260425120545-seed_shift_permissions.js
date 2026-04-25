'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const permissions = [
      {
        id: uuidv4(),
        name: 'shift:create',
        group_name: 'POS',
        description: 'Open POS shifts',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'shift:manage',
        group_name: 'POS',
        description: 'Close and manage POS shifts',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'shift:view',
        group_name: 'POS',
        description: 'View shift history',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    // Using bulkInsert with IGNORE-like behavior (checking for name existence)
    for (const perm of permissions) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM permissions WHERE name = '${perm.name}'`
      );
      
      if (existing.length === 0) {
        await queryInterface.bulkInsert('permissions', [perm]);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('permissions', {
      name: ['shift:create', 'shift:manage', 'shift:view']
    });
  }
};
