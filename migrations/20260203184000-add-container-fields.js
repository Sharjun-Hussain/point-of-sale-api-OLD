'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('containers', 'slug', {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true
        });

        await queryInterface.addColumn('containers', 'measurement_unit_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'measurement_units',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });

        await queryInterface.addColumn('containers', 'base_unit_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'measurement_units',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('containers', 'slug');
        await queryInterface.removeColumn('containers', 'measurement_unit_id');
        await queryInterface.removeColumn('containers', 'base_unit_id');
    }
};
