'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add product_type to Products
    const tableInfo = await queryInterface.describeTable('products');
    
    if (!tableInfo.product_type) {
      await queryInterface.addColumn('products', 'product_type', {
        type: Sequelize.ENUM('Finished Good', 'Raw Material', 'Semi-Finished', 'Service'),
        defaultValue: 'Finished Good',
        allowNull: false,
        after: 'name'
      });
    }

    if (!tableInfo.can_be_manufactured) {
      await queryInterface.addColumn('products', 'can_be_manufactured', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        after: 'product_type'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('products', 'product_type');
    await queryInterface.removeColumn('products', 'can_be_manufactured');
  }
};
