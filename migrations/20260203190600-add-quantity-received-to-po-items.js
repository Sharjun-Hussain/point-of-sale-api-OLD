'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('purchase_order_items', 'quantity_received', {
      type: Sequelize.DECIMAL(15, 2),
      defaultValue: 0.00,
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('purchase_order_items', 'quantity_received');
  }
};
