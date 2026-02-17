'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { Role, Permission } = require('../src/models');

    // 1. Create 'Admin' role (Organization Admin) if not exists
    const [adminRole] = await Role.findOrCreate({
      where: { name: 'Admin' },
      defaults: { description: 'Organization Administrator with full access to organization resources' }
    });

    // 2. Fetch all permissions to assign to Admin
    // In a real scenario, you might want to exclude some "System" level permissions, 
    // but for now, we'll give them all permissions available in the system.
    const allPermissions = await Permission.findAll();

    if (adminRole && allPermissions.length > 0) {
      await adminRole.setPermissions(allPermissions);
      console.log(`✅ Assigned ${allPermissions.length} permissions to 'Admin' role.`);
    }
  },

  async down(queryInterface, Sequelize) {
    // We generally don't delete roles in down migration to avoid data loss on rollback
    // but strict reversibility would mean deleting it.
    // For safety, we will do nothing or just remove permissions.
    const { Role } = require('../src/models');
    const adminRole = await Role.findOne({ where: { name: 'Admin' } });
    if (adminRole) {
      await adminRole.setPermissions([]);
      await adminRole.destroy();
    }
  }
};
