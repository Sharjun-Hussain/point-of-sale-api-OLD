'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = [
            'roles',
            'main_categories',
            'sub_categories',
            'brands',
            'units',
            'measurement_units',
            'products',
            'product_variants',
            'product_batches',
            'stocks',
            'product_attributes',
            'product_suppliers',
            'containers',
            'grn_items',
            'sale_items',
            'sale_return_items',
            'purchase_order_items',
            'purchase_return_items',
            'stock_transfer_items',
            'attribute_values',
            'variant_attr_values',
            'stock_adjustments'
        ];

        // Get the first organization ID to use as default for existing data
        const [organizations] = await queryInterface.sequelize.query(
            'SELECT id FROM organizations LIMIT 1'
        );
        const defaultOrgId = organizations.length > 0 ? organizations[0].id : null;

        for (const table of tables) {
            // Check if table exists first (sanity check)
            const [tableExists] = await queryInterface.sequelize.query(
                `SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`
            );

            if (tableExists[0]['COUNT(*)'] > 0) {
                // Check if column already exists
                const [columnExists] = await queryInterface.sequelize.query(
                    `SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = 'organization_id'`
                );

                if (columnExists[0]['COUNT(*)'] === 0) {
                    console.log(`Adding organization_id to ${table}`);
                    await queryInterface.addColumn(table, 'organization_id', {
                        type: Sequelize.UUID,
                        allowNull: true,
                        references: {
                            model: 'organizations',
                            key: 'id'
                        },
                        onUpdate: 'CASCADE',
                        onDelete: 'NO ACTION'
                    });

                    if (defaultOrgId) {
                        await queryInterface.sequelize.query(
                            `UPDATE ${table} SET organization_id = '${defaultOrgId}' WHERE organization_id IS NULL`
                        );
                    }
                }
            }
        }
    },

    async down(queryInterface, Sequelize) {
        const tables = [
            'roles',
            'main_categories',
            'sub_categories',
            'brands',
            'units',
            'measurement_units',
            'products',
            'product_variants',
            'product_batches',
            'stocks',
            'product_attributes',
            'product_suppliers',
            'containers',
            'grn_items',
            'sale_items',
            'sale_return_items',
            'purchase_order_items',
            'purchase_return_items',
            'stock_transfer_items',
            'attribute_values',
            'variant_attr_values',
            'stock_adjustments'
        ];

        for (const table of tables) {
            const [columnExists] = await queryInterface.sequelize.query(
                `SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = 'organization_id'`
            );

            if (columnExists[0]['COUNT(*)'] > 0) {
                await queryInterface.removeColumn(table, 'organization_id');
            }
        }
    }
};
