'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column exists first
    const tableInfo = await queryInterface.describeTable('sale_items');
    if (!tableInfo.manual_discount) {
      await queryInterface.addColumn('sale_items', 'manual_discount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('sale_items', 'manual_discount');
  }
};
