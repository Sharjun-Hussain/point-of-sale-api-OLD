'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sales', 'earned_points', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });
    await queryInterface.addColumn('sales', 'redeemed_points', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('sales', 'earned_points');
    await queryInterface.removeColumn('sales', 'redeemed_points');
  }
};
