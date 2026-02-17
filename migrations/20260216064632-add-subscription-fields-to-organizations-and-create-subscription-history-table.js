'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add columns to organizations table
    await queryInterface.addColumn('organizations', 'subscription_tier', {
      type: Sequelize.ENUM('Basic', 'Pro', 'Enterprise'),
      allowNull: true
    });
    await queryInterface.addColumn('organizations', 'billing_cycle', {
      type: Sequelize.ENUM('Monthly', 'Yearly', 'Lifetime'),
      allowNull: true
    });
    await queryInterface.addColumn('organizations', 'subscription_expiry_date', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('organizations', 'subscription_status', {
      type: Sequelize.ENUM('Active', 'Expired', 'Trial', 'Suspended'),
      defaultValue: 'Trial'
    });
    await queryInterface.addColumn('organizations', 'purchase_date', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Create subscription_histories table
    await queryInterface.createTable('subscription_histories', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      subscription_tier: {
        type: Sequelize.ENUM('Basic', 'Pro', 'Enterprise'),
        allowNull: false
      },
      billing_cycle: {
        type: Sequelize.ENUM('Monthly', 'Yearly', 'Lifetime'),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00
      },
      currency: {
        type: Sequelize.STRING,
        defaultValue: 'USD'
      },
      purchase_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      expiry_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      payment_status: {
        type: Sequelize.ENUM('Paid', 'Pending', 'Failed'),
        defaultValue: 'Paid'
      },
      transaction_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      payment_method: {
        type: Sequelize.STRING,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('subscription_histories');
    await queryInterface.removeColumn('organizations', 'subscription_tier');
    await queryInterface.removeColumn('organizations', 'billing_cycle');
    await queryInterface.removeColumn('organizations', 'subscription_expiry_date');
    await queryInterface.removeColumn('organizations', 'subscription_status');
    await queryInterface.removeColumn('organizations', 'purchase_date');

    // Note: Dropping Enums is database specific and sometimes tricky in migrations.
    // For many DBs, you'd need special commands to drop specific types if they were created as types.
  }
};
