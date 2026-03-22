'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableInfo = await queryInterface.describeTable('business_plans');
        if (!tableInfo.trial_days) {
            await queryInterface.addColumn('business_plans', 'trial_days', {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                after: 'max_users'
            });
        }

        // Update default values for seeded plans
        await queryInterface.bulkUpdate('business_plans', { trial_days: 14 }, { name: 'Basic' });
        await queryInterface.bulkUpdate('business_plans', { trial_days: 30 }, { name: 'Pro' });
        await queryInterface.bulkUpdate('business_plans', { trial_days: 30 }, { name: 'Enterprise' });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('business_plans', 'trial_days');
    }
};
