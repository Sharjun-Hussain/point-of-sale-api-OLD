'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ShopifySyncMigration extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  ShopifySyncMigration.init({
    shopify_sync: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'ShopifySyncMigration',
  });
  return ShopifySyncMigration;
};