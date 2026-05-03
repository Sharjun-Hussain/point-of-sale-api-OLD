'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const permissions = [
      {
        id: uuidv4(),
        name: 'crm:view',
        group_name: 'CRM',
        description: 'View CRM and WhatsApp templates',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'crm:manage',
        group_name: 'CRM',
        description: 'Manage CRM settings and send messages',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    for (const perm of permissions) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM permissions WHERE name = '${perm.name}' LIMIT 1`
      );
      if (existing.length === 0) {
        await queryInterface.bulkInsert('permissions', [perm]);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('permissions', {
      name: ['crm:view', 'crm:manage']
    });
  }
};
