'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('organizations');
    
    if (!tableInfo.backup_enabled) {
      await queryInterface.addColumn('organizations', 'backup_enabled', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }

    if (!tableInfo.manual_download_enabled) {
      await queryInterface.addColumn('organizations', 'manual_download_enabled', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }

    if (!tableInfo.auto_backup_enabled) {
      await queryInterface.addColumn('organizations', 'auto_backup_enabled', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }

    if (!tableInfo.backup_frequency) {
      await queryInterface.addColumn('organizations', 'backup_frequency', {
        type: Sequelize.ENUM('Daily', 'Weekly', 'Monthly'),
        defaultValue: 'Weekly'
      });
    }

    if (!tableInfo.backup_email) {
      await queryInterface.addColumn('organizations', 'backup_email', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.last_backup_date) {
      await queryInterface.addColumn('organizations', 'last_backup_date', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('organizations', 'backup_enabled');
    await queryInterface.removeColumn('organizations', 'manual_download_enabled');
    await queryInterface.removeColumn('organizations', 'auto_backup_enabled');
    await queryInterface.removeColumn('organizations', 'backup_frequency');
    await queryInterface.removeColumn('organizations', 'backup_email');
    await queryInterface.removeColumn('organizations', 'last_backup_date');
  }
};
