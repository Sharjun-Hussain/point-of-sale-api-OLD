'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add custom_ecommerce_enabled to organizations
    await queryInterface.addColumn('organizations', 'custom_ecommerce_enabled', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });

    // 2. Add custom_ecommerce_sync_enabled to products
    await queryInterface.addColumn('products', 'custom_ecommerce_sync_enabled', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });

    // 3. Add source column to sales
    await queryInterface.addColumn('sales', 'source', {
      type: Sequelize.STRING(50),
      defaultValue: 'pos',
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // 1. Remove source from sales
    await queryInterface.removeColumn('sales', 'source');

    // 2. Remove custom_ecommerce_sync_enabled from products
    await queryInterface.removeColumn('products', 'custom_ecommerce_sync_enabled');

    // 3. Remove custom_ecommerce_enabled from organizations
    await queryInterface.removeColumn('organizations', 'custom_ecommerce_enabled');
  }
};
