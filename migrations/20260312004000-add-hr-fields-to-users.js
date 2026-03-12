'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('users', 'first_name', {
            type: Sequelize.STRING,
            allowNull: true,
            after: 'name'
        });
        await queryInterface.addColumn('users', 'last_name', {
            type: Sequelize.STRING,
            allowNull: true,
            after: 'first_name'
        });
        await queryInterface.addColumn('users', 'nic', {
            type: Sequelize.STRING,
            allowNull: true,
            after: 'phone'
        });
        await queryInterface.addColumn('users', 'joined_date', {
            type: Sequelize.DATE,
            allowNull: true,
            after: 'nic'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('users', 'first_name');
        await queryInterface.removeColumn('users', 'last_name');
        await queryInterface.removeColumn('users', 'nic');
        await queryInterface.removeColumn('users', 'joined_date');
    }
};
