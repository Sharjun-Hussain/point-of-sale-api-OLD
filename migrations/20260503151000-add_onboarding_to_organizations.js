'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('organizations', 'onboarding_completed', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    await queryInterface.addColumn('organizations', 'force_onboarding', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('organizations', 'onboarding_completed');
    await queryInterface.removeColumn('organizations', 'force_onboarding');
  }
};
