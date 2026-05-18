'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add columns to sales table
    await queryInterface.addColumn('sales', 'dining_type', {
      type: Sequelize.ENUM('dine_in', 'takeaway', 'delivery'),
      defaultValue: 'takeaway',
      allowNull: false
    });

    await queryInterface.addColumn('sales', 'dining_table_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'dining_tables', key: 'id' },
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('sales', 'kot_status', {
      type: Sequelize.ENUM('pending', 'sent_to_kitchen', 'preparing', 'ready', 'served'),
      defaultValue: 'pending',
      allowNull: false
    });

    await queryInterface.addColumn('sales', 'waiter_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL'
    });

    // 2. Add columns to sale_items table
    await queryInterface.addColumn('sale_items', 'cooking_status', {
      type: Sequelize.ENUM('pending', 'preparing', 'ready', 'served'),
      defaultValue: 'pending',
      allowNull: false
    });

    await queryInterface.addColumn('sale_items', 'cooking_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // 1. Remove columns from sale_items table
    await queryInterface.removeColumn('sale_items', 'cooking_status');
    await queryInterface.removeColumn('sale_items', 'cooking_notes');

    // 2. Remove columns from sales table
    await queryInterface.removeColumn('sales', 'dining_type');
    await queryInterface.removeColumn('sales', 'dining_table_id');
    await queryInterface.removeColumn('sales', 'kot_status');
    await queryInterface.removeColumn('sales', 'waiter_id');
  }
};
