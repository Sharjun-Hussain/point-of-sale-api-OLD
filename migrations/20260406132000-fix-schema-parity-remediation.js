'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Fix refresh_tokens table
    const [refreshTokenTable] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'is_active'"
    );

    if (refreshTokenTable[0].count === 0) {
      console.log('Adding is_active to refresh_tokens');
      await queryInterface.addColumn('refresh_tokens', 'is_active', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      });
    }

    const [refreshTokenOrg] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'organization_id'"
    );

    if (refreshTokenOrg[0].count === 0) {
      console.log('Adding organization_id to refresh_tokens');
      await queryInterface.addColumn('refresh_tokens', 'organization_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    // 2. Fix sale_employees table
    const [saleEmployeeOrg] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_employees' AND COLUMN_NAME = 'organization_id'"
    );

    if (saleEmployeeOrg[0].count === 0) {
      console.log('Adding organization_id to sale_employees');
      await queryInterface.addColumn('sale_employees', 'organization_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    console.log('✅ Database schema parity remediation completed!');
  },

  async down(queryInterface, Sequelize) {
    // Rollback logic
    await queryInterface.removeColumn('refresh_tokens', 'is_active');
    await queryInterface.removeColumn('refresh_tokens', 'organization_id');
    await queryInterface.removeColumn('sale_employees', 'organization_id');
  }
};
