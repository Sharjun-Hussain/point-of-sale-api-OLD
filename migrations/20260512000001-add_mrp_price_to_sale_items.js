'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sale_items', 'mrp_price', {
      type: Sequelize.DECIMAL(15, 2),
      defaultValue: 0.00,
      after: 'unit_price'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('sale_items', 'mrp_price');
  }
};
