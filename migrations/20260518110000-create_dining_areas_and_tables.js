'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create dining_areas table
    await queryInterface.createTable('dining_areas', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' }
      },
      branch_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' }
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
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

    // 2. Create dining_tables table
    await queryInterface.createTable('dining_tables', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' }
      },
      branch_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'branches', key: 'id' }
      },
      dining_area_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'dining_areas', key: 'id' },
        onDelete: 'CASCADE'
      },
      table_number: {
        type: Sequelize.STRING,
        allowNull: false
      },
      capacity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 4
      },
      status: {
        type: Sequelize.ENUM('free', 'occupied', 'reserved'),
        defaultValue: 'free',
        allowNull: false
      },
      current_sale_id: {
        type: Sequelize.UUID,
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
    await queryInterface.dropTable('dining_tables');
    await queryInterface.dropTable('dining_areas');
  }
};
