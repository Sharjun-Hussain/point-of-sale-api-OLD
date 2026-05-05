'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const permissions = [
      {
        id: uuidv4(),
        name: 'distributors:view',
        group_name: 'Distribution',
        description: 'View distributors and ledger',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'distributors:create',
        group_name: 'Distribution',
        description: 'Create new distributors',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'distributors:edit',
        group_name: 'Distribution',
        description: 'Edit distributor details',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'distributors:delete',
        group_name: 'Distribution',
        description: 'Delete distributors',
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
      name: ['distributors:view', 'distributors:create', 'distributors:edit', 'distributors:delete']
    });
  }
};
