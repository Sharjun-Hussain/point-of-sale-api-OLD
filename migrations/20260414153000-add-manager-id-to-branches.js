'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableInfo = await queryInterface.describeTable('branches');
        
        if (!tableInfo.manager_id) {
            await queryInterface.addColumn('branches', 'manager_id', {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'employees',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            });
        }
    },

    down: async (queryInterface, Sequelize) => {
        const tableInfo = await queryInterface.describeTable('branches');
        if (tableInfo.manager_id) {
            await queryInterface.removeColumn('branches', 'manager_id');
        }
    }
};
