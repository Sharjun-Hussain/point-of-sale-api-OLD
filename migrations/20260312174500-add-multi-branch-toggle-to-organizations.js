'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // 1. Add is_multi_branch to organizations table
        const tableInfo = await queryInterface.describeTable('organizations');
        if (!tableInfo.is_multi_branch) {
            await queryInterface.addColumn('organizations', 'is_multi_branch', {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
                after: 'plan_id'
            });
        }

        // 2. Set is_multi_branch to true for Pro/Enterprise plans if plan counts > 1
        // This is optional but helpful for existing data
        await queryInterface.sequelize.query(`
      UPDATE organizations 
      SET is_multi_branch = true 
      WHERE plan_id IN (
        SELECT id FROM business_plans WHERE max_branches > 1 OR max_branches = -1
      )
    `);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('organizations', 'is_multi_branch');
    }
};
