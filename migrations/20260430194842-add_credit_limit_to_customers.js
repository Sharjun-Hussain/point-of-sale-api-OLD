'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'credit_limit', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00
    });
    await queryInterface.addColumn('customers', 'opening_balance', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('customers', 'credit_limit');
    await queryInterface.removeColumn('customers', 'opening_balance');
  }
};
