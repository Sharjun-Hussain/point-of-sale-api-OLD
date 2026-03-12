'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('expenses', 'reference_no', {
            type: Sequelize.STRING,
            allowNull: true,
            after: 'receipt_image' // Optional: placing it after receipt_image
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('expenses', 'reference_no');
    }
};
