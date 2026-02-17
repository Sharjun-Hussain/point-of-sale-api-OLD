'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('branches');

    if (!tableInfo.city) {
      await queryInterface.addColumn('branches', 'city', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.code) {
      await queryInterface.addColumn('branches', 'code', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.opening_time) {
      await queryInterface.addColumn('branches', 'opening_time', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.closing_time) {
      await queryInterface.addColumn('branches', 'closing_time', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('branches');

    if (tableInfo.closing_time) {
      await queryInterface.removeColumn('branches', 'closing_time');
    }
    if (tableInfo.opening_time) {
      await queryInterface.removeColumn('branches', 'opening_time');
    }
    if (tableInfo.code) {
      await queryInterface.removeColumn('branches', 'code');
    }
    if (tableInfo.city) {
      await queryInterface.removeColumn('branches', 'city');
    }
  }
};
