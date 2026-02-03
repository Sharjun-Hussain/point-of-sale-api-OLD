'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Drop existing foreign key on base_unit_id if any
        try {
            await queryInterface.removeConstraint('containers', 'containers_base_unit_id_foreign_idx');
        } catch (e) {
            // Ignore if not found
        }

        // Add new foreign key pointing to units table
        await queryInterface.changeColumn('containers', 'base_unit_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'units',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });
    },

    down: async (queryInterface, Sequelize) => {
        // Revert to measurement_units
        await queryInterface.changeColumn('containers', 'base_unit_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'measurement_units',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });
    }
};
