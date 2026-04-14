const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const fs = require('fs');
const path = require('path');
const basename = path.basename(__filename);

const db = {};

// 1. DYNAMIC MODEL SCAN (The Industrial Way)
// This scans the current directory and imports every .js file as a model.
fs.readdirSync(__dirname)
    .filter(file => {
        return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
    })
    .forEach(file => {
        const model = require(path.join(__dirname, file))(sequelize, DataTypes);
        db[model.name] = model;
    });

// 2. DYNAMIC ASSOCIATION LOOP
// This calls the .associate() method on every model if it has one.
Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.Sequelize = Sequelize;
db.sequelize = sequelize;

module.exports = db;
