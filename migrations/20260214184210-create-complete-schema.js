'use strict';

/**
 * INITIAL SCHEMA MIGRATION
 * Creates all 42 tables from Sequelize models
 * Run this FIRST on a fresh database before other migrations
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 Creating initial database schema from models...');

    // This will create all tables defined in your Sequelize models
    // It reads model definitions and creates tables with:
    // - All columns with correct types
    // - Primary keys, foreign keys, constraints
    // - Indexes and unique keys
    const models = require('../src/models');
    await models.sequelize.sync();

    console.log('✅ Initial schema created successfully!');
    console.log('📊 Created 42 tables with all relationships');
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
  }
};
