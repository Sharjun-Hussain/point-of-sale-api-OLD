'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('organizations', 'is_master', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });

    // Set Inzeedo as master organization
    await queryInterface.sequelize.query(
      "UPDATE organizations SET is_master = true WHERE email = 'mrjoon005@gmail.com' LIMIT 1"
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('organizations', 'is_master');
  }
};
