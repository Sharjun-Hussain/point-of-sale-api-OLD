'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Check if table exists and column exists to be idempotent
    const tableInfo = await queryInterface.describeTable('product_batches');
    if (!tableInfo.expiration_status) {
      await queryInterface.addColumn('product_batches', 'expiration_status', {
        type: Sequelize.ENUM('normal', 'warning', 'critical', 'expired'),
        defaultValue: 'normal',
        after: 'is_active'
      });
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('product_batches', 'expiration_status');
    // Note: This won't remove the ENUM type from the DB automatically in some dialects, 
    // but column removal is safe enough for a rollback.
  }
};
