'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create Recipes Table
    await queryInterface.createTable('recipes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      product_variant_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'product_variants',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      batch_size: {
        type: Sequelize.DECIMAL(15, 3),
        defaultValue: 1.000,
        allowNull: false
      },
      total_cost: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00,
        allowNull: false
      },
      instructions: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id'
        }
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

    // 2. Create Recipe Items Table (BOM Components)
    await queryInterface.createTable('recipe_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      recipe_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'recipes',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      raw_material_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        }
      },
      raw_material_variant_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'product_variants',
          key: 'id'
        }
      },
      quantity: {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false
      },
      unit_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'units',
          key: 'id'
        }
      },
      waste_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0.00
      },
      cost_at_creation: {
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
    await queryInterface.dropTable('recipe_items');
    await queryInterface.dropTable('recipes');
  }
};
