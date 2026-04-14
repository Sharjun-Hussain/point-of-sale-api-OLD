'use strict';

/**
 * MIGRATION: MAKE AUDIT LOG ORGANIZATION NULLABLE
 * This ensures that system-level events (like failed logins) can be recorded
 * even when an organization context is not yet established.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🏗️  Altering audit_logs table to allow NULL organization_id...');
    
    await queryInterface.changeColumn('audit_logs', 'organization_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    console.log('✅ AuditLog organization_id is now nullable.');
  },

  async down(queryInterface, Sequelize) {
    console.log('⏪ Reverting audit_logs organization_id to NOT NULL...');
    
    await queryInterface.changeColumn('audit_logs', 'organization_id', {
      type: Sequelize.UUID,
      allowNull: false
    });
  }
};
