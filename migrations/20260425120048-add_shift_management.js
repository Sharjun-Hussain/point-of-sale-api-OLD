'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create shifts table if not exists
      const tableExists = await queryInterface.showAllTables();
      if (!tableExists.includes('shifts')) {
        await queryInterface.createTable('shifts', {
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
          user_id: {
            type: Sequelize.UUID,
            allowNull: false
          },
          opening_time: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW,
            allowNull: false
          },
          closing_time: {
            type: Sequelize.DATE,
            allowNull: true
          },
          opening_cash: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          closing_cash: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: true
          },
          expected_cash: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: true
          },
          variance: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: true
          },
          status: {
            type: Sequelize.ENUM('open', 'closed'),
            defaultValue: 'open'
          },
          created_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          },
          updated_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          }
        }, { transaction });
      }

      // 2. Create shift_transactions table if not exists
      if (!tableExists.includes('shift_transactions')) {
        await queryInterface.createTable('shift_transactions', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          shift_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: 'shifts',
              key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          type: {
            type: Sequelize.ENUM('pay_in', 'drop', 'payout'),
            allowNull: false
          },
          amount: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: false
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          created_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          },
          updated_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          }
        }, { transaction });
      }

      // 3. Add shift_id to sales table only if it doesn't exist
      const salesTable = await queryInterface.describeTable('sales');
      if (!salesTable.shift_id) {
        await queryInterface.addColumn('sales', 'shift_id', {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'shifts',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        }, { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Standard rollback
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const salesTable = await queryInterface.describeTable('sales');
      if (salesTable.shift_id) {
        await queryInterface.removeColumn('sales', 'shift_id', { transaction });
      }
      
      await queryInterface.dropTable('shift_transactions', { transaction });
      await queryInterface.dropTable('shifts', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
