'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('product_variants', 'mrp_price', {
      type: Sequelize.DECIMAL(15, 2),
      defaultValue: 0.00,
      after: 'price'
    });
    await queryInterface.addColumn('product_batches', 'mrp_price', {
      type: Sequelize.DECIMAL(15, 2),
      defaultValue: 0.00,
      after: 'cost_price'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('product_variants', 'mrp_price');
    await queryInterface.removeColumn('product_batches', 'mrp_price');
  }
};
