'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('suppliers', 'opening_balance', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('suppliers', 'opening_balance');
  }
};
