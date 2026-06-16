const db = require('./src/models');
console.log('UserDraft exists:', !!db.UserDraft);
db.sequelize.sync({ alter: true }).then(() => {
    console.log('Sync successful');
    db.sequelize.close();
}).catch(e => {
    console.error('Sync failed', e);
    db.sequelize.close();
});
