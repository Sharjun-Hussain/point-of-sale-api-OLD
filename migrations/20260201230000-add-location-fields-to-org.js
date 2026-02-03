'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('organizations', 'city', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await queryInterface.addColumn('organizations', 'state', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await queryInterface.addColumn('organizations', 'zip_code', {
            type: Sequelize.STRING,
            allowNull: true
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('organizations', 'city');
        await queryInterface.removeColumn('organizations', 'state');
        await queryInterface.removeColumn('organizations', 'zip_code');
    }
};
