require('dotenv').config();
const sequelize = require('./src/config/database');
(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');

    await sequelize.sync({ force: true }); // DEV ONLY
    console.log('✅ Tables created');

    process.exit(0);
  } catch (err) {
    console.error('❌ SYNC ERROR:\n', err);
    process.exit(1);
  }
})();