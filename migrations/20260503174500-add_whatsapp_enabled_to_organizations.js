'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('organizations');
    if (!tableInfo.whatsapp_enabled) {
      await queryInterface.addColumn('organizations', 'whatsapp_enabled', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        after: 'shopify_enabled'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('organizations', 'whatsapp_enabled');
  }
};
