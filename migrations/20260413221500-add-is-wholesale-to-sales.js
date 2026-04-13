'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('sales', 'is_wholesale', {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            after: 'notes'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('sales', 'is_wholesale');
    }
};
