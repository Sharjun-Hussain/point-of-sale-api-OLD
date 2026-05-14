'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add the code column
    await queryInterface.addColumn('suppliers', 'code', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // 2. Add composite unique index for multi-tenant support
    await queryInterface.addIndex('suppliers', ['organization_id', 'code'], {
      unique: true,
      name: 'suppliers_org_code_unique_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    // 1. Remove the index first
    await queryInterface.removeIndex('suppliers', 'suppliers_org_code_unique_idx');
    
    // 2. Remove the column
    await queryInterface.removeColumn('suppliers', 'code');
  }
};
