'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('containers', 'capacity', {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: 0
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('containers', 'capacity');
    }
};
