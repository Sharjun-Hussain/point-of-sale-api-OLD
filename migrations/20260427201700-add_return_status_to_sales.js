'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add return_status column to sales table
    // We check if it exists first to prevent errors in environments that use sync()
    const tableInfo = await queryInterface.describeTable('sales');
    if (!tableInfo.return_status) {
      await queryInterface.addColumn('sales', 'return_status', {
        type: Sequelize.ENUM('none', 'partial', 'full'),
        defaultValue: 'none',
        allowNull: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('sales', 'return_status');
    // Note: In some DBs like Postgres, deleting the ENUM type might require extra steps 
    // if it was created automatically.
  }
};
