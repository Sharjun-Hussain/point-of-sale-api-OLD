'use strict';

const crypto = require('crypto');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // 1. Create business_plans table
        await queryInterface.createTable('business_plans', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            price_monthly: {
                type: Sequelize.DECIMAL(10, 2),
                defaultValue: 0.00
            },
            price_yearly: {
                type: Sequelize.DECIMAL(10, 2),
                defaultValue: 0.00
            },
            max_branches: {
                type: Sequelize.INTEGER,
                defaultValue: 1
            },
            max_users: {
                type: Sequelize.INTEGER,
                defaultValue: 5
            },
            features: {
                type: Sequelize.JSON,
                allowNull: true
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        // 2. Add plan_id to organizations table ONLY if it doesn't exist
        const orgTable = await queryInterface.describeTable('organizations');
        if (!orgTable.plan_id) {
            await queryInterface.addColumn('organizations', 'plan_id', {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'business_plans',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            });
        }

        // 3. Seed default plans
        const now = new Date();
        const basicPlanId = crypto.randomUUID();
        const proPlanId = crypto.randomUUID();
        const enterprisePlanId = crypto.randomUUID();

        await queryInterface.bulkInsert('business_plans', [
            {
                id: basicPlanId,
                name: 'Basic',
                description: 'Standard plan for single branch shops',
                price_monthly: 0.00,
                price_yearly: 0.00,
                max_branches: 1,
                max_users: 5,
                features: JSON.stringify(['basic_pos', 'inventory_management']),
                is_active: true,
                created_at: now,
                updated_at: now
            },
            {
                id: proPlanId,
                name: 'Pro',
                description: 'Perfect for growing businesses with multiple branches',
                price_monthly: 29.99,
                price_yearly: 299.00,
                max_branches: 5,
                max_users: 20,
                features: JSON.stringify(['basic_pos', 'inventory_management', 'advanced_reports', 'multiple_branches']),
                is_active: true,
                created_at: now,
                updated_at: now
            },
            {
                id: enterprisePlanId,
                name: 'Enterprise',
                description: 'Unlimited power for large retail chains',
                price_monthly: 99.99,
                price_yearly: 999.00,
                max_branches: -1,
                max_users: -1,
                features: JSON.stringify(['all_features', 'dedicated_support', 'unlimited_branches']),
                is_active: true,
                created_at: now,
                updated_at: now
            }
        ]);

        // 4. Update existing organizations to use the Basic plan as default
        // We assume organizations that have 'Basic' in their subscription_tier should map to the Basic plan
        await queryInterface.bulkUpdate('organizations',
            { plan_id: basicPlanId },
            { subscription_tier: 'Basic' }
        );
        await queryInterface.bulkUpdate('organizations',
            { plan_id: proPlanId },
            { subscription_tier: 'Pro' }
        );
        await queryInterface.bulkUpdate('organizations',
            { plan_id: enterprisePlanId },
            { subscription_tier: 'Enterprise' }
        );

        // Fallback for any orgs with NULL subscription_tier
        await queryInterface.bulkUpdate('organizations',
            { plan_id: basicPlanId },
            { plan_id: null }
        );
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('organizations', 'plan_id');
        await queryInterface.dropTable('business_plans');
    }
};
