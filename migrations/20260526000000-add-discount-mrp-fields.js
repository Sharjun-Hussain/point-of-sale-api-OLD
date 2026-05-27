'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // purchase_orders
      await queryInterface.addColumn('purchase_orders', 'discount_amount', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      }, { transaction });

      // purchase_order_items
      await queryInterface.addColumn('purchase_order_items', 'discount_percentage', {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0.00
      }, { transaction });

      // grn_items
      await queryInterface.addColumn('grn_items', 'selling_price', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      }, { transaction });

      await queryInterface.addColumn('grn_items', 'wholesale_price', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      }, { transaction });

      await queryInterface.addColumn('grn_items', 'mrp_price', {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      }, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('purchase_orders', 'discount_amount', { transaction });
      await queryInterface.removeColumn('purchase_order_items', 'discount_percentage', { transaction });
      await queryInterface.removeColumn('grn_items', 'selling_price', { transaction });
      await queryInterface.removeColumn('grn_items', 'wholesale_price', { transaction });
      await queryInterface.removeColumn('grn_items', 'mrp_price', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
