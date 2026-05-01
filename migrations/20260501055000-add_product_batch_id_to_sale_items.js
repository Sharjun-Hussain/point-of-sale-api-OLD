'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sale_items', 'product_batch_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'product_batches',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('sale_items', 'product_batch_id');
  }
};
