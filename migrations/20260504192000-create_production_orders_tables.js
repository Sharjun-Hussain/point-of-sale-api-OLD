'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create Production Orders Table
    await queryInterface.createTable('production_orders', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      branch_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      recipe_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'recipes', key: 'id' }
      },
      order_number: {
        type: Sequelize.STRING,
        allowNull: false
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'products', key: 'id' }
      },
      product_variant_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'product_variants', key: 'id' }
      },
      quantity_planned: {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false
      },
      quantity_produced: {
        type: Sequelize.DECIMAL(15, 3),
        defaultValue: 0.000
      },
      total_cost: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00
      },
      status: {
        type: Sequelize.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
        defaultValue: 'pending'
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' }
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

    // 2. Create Production Order Items Table (Actual Consumption)
    await queryInterface.createTable('production_order_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      production_order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'production_orders', key: 'id' },
        onDelete: 'CASCADE'
      },
      raw_material_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'products', key: 'id' }
      },
      raw_material_variant_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'product_variants', key: 'id' }
      },
      quantity_planned: {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false
      },
      quantity_consumed: {
        type: Sequelize.DECIMAL(15, 3),
        defaultValue: 0.000
      },
      unit_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'units', key: 'id' }
      },
      cost_per_unit: {
        type: Sequelize.DECIMAL(15, 2),
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
    await queryInterface.dropTable('production_order_items');
    await queryInterface.dropTable('production_orders');
  }
};
