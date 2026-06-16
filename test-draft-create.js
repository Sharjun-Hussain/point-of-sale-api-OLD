const db = require('./src/models');
db.sequelize.sync({ alter: true }).then(() => {
    console.log('Sync successful');
    process.exit(0);
}).catch(e => {
    console.error('Sync failed', e);
    process.exit(1);
});
