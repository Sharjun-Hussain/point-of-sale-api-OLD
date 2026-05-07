'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add new columns to business_plans
    await queryInterface.addColumn('business_plans', 'price_per_additional_user', {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 1000.00,
      after: 'features'
    });

    // 2. Add new columns to organizations
    await queryInterface.addColumn('organizations', 'billing_model', {
      type: Sequelize.ENUM('SaaS', 'Perpetual'),
      defaultValue: 'SaaS',
      after: 'subscription_tier'
    });

    await queryInterface.addColumn('organizations', 'module_overrides', {
      type: Sequelize.JSON,
      allowNull: true,
      after: 'whatsapp_enabled'
    });

    // 3. Handle Tier Renaming (Essential, Professional, Enterprise)
    
    // First, expand the ENUM to include both old and new values to allow the transition
    await queryInterface.changeColumn('organizations', 'subscription_tier', {
      type: Sequelize.ENUM('Basic', 'Pro', 'Essential', 'Professional', 'Enterprise'),
      allowNull: true
    });

    await queryInterface.changeColumn('subscription_histories', 'subscription_tier', {
      type: Sequelize.ENUM('Basic', 'Pro', 'Essential', 'Professional', 'Enterprise'),
      allowNull: false
    });

    // Now update existing data
    await queryInterface.sequelize.query("UPDATE business_plans SET name = 'Essential' WHERE name = 'Basic'");
    await queryInterface.sequelize.query("UPDATE business_plans SET name = 'Professional' WHERE name = 'Pro'");

    await queryInterface.sequelize.query("UPDATE organizations SET subscription_tier = 'Essential' WHERE subscription_tier = 'Basic'");
    await queryInterface.sequelize.query("UPDATE organizations SET subscription_tier = 'Professional' WHERE subscription_tier = 'Pro'");
    
    await queryInterface.sequelize.query("UPDATE subscription_histories SET subscription_tier = 'Essential' WHERE subscription_tier = 'Basic'");
    await queryInterface.sequelize.query("UPDATE subscription_histories SET subscription_tier = 'Professional' WHERE subscription_tier = 'Pro'");

    // Finally, shrink the ENUM to only the new values
    await queryInterface.changeColumn('organizations', 'subscription_tier', {
      type: Sequelize.ENUM('Essential', 'Professional', 'Enterprise'),
      allowNull: true
    });

    await queryInterface.changeColumn('subscription_histories', 'subscription_tier', {
      type: Sequelize.ENUM('Essential', 'Professional', 'Enterprise'),
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert changes
    await queryInterface.removeColumn('business_plans', 'price_per_additional_user');
    await queryInterface.removeColumn('organizations', 'billing_model');
    await queryInterface.removeColumn('organizations', 'module_overrides');

    // Revert tier names in data
    await queryInterface.sequelize.query("UPDATE business_plans SET name = 'Basic' WHERE name = 'Essential'");
    await queryInterface.sequelize.query("UPDATE business_plans SET name = 'Pro' WHERE name = 'Professional'");

    await queryInterface.sequelize.query("UPDATE organizations SET subscription_tier = 'Basic' WHERE subscription_tier = 'Essential'");
    await queryInterface.sequelize.query("UPDATE organizations SET subscription_tier = 'Pro' WHERE subscription_tier = 'Professional'");

    await queryInterface.changeColumn('organizations', 'subscription_tier', {
      type: Sequelize.ENUM('Basic', 'Pro', 'Enterprise'),
      allowNull: true
    });

    await queryInterface.sequelize.query("UPDATE subscription_histories SET subscription_tier = 'Basic' WHERE subscription_tier = 'Essential'");
    await queryInterface.sequelize.query("UPDATE subscription_histories SET subscription_tier = 'Pro' WHERE subscription_tier = 'Professional'");

    await queryInterface.changeColumn('subscription_histories', 'subscription_tier', {
      type: Sequelize.ENUM('Basic', 'Pro', 'Enterprise'),
      allowNull: false
    });
  }
};
