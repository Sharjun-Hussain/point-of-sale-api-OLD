'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('product_variants');
    if (!tableInfo.is_default) {
      await queryInterface.addColumn('product_variants', 'is_default', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        after: 'is_active'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('product_variants', 'is_default');
  }
};
