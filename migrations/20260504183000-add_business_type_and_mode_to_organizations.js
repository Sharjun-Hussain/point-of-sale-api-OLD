'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add business_mode to Organizations
    const tableInfo = await queryInterface.describeTable('organizations');
    if (!tableInfo.business_mode) {
      await queryInterface.addColumn('organizations', 'business_mode', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'business_type'
      });
    }

    // 2. Change RefreshToken token column to TEXT
    await queryInterface.changeColumn('refresh_tokens', 'token', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    // 3. Change RefreshToken replaced_by_token column to TEXT
    await queryInterface.changeColumn('refresh_tokens', 'replaced_by_token', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // We don't want to lose data by going back to STRING(500) if tokens are long,
    // so we keep it as TEXT in down or just remove business_mode.
    await queryInterface.removeColumn('organizations', 'business_mode');
    
    await queryInterface.changeColumn('refresh_tokens', 'token', {
      type: Sequelize.STRING(500),
      allowNull: false
    });

    await queryInterface.changeColumn('refresh_tokens', 'replaced_by_token', {
      type: Sequelize.STRING(500),
      allowNull: true
    });
  }
};
