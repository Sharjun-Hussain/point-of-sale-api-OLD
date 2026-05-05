'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('sale_returns', 'distributor_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'distributors',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('sale_returns', 'distributor_id');
    }
};
