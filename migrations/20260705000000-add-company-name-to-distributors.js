'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('distributors', 'company_name', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'name'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('distributors', 'company_name');
  }
};
