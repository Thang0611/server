const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Load environment variables
// Priority: .env.development (if NODE_ENV=development) > .env
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'development' 
    ? path.join(__dirname, '../../.env.development')
    : path.join(__dirname, '../../.env');

// Load .env.development for development, .env for production
if (fs.existsSync(envFile)) {
    require('dotenv').config({ path: envFile });
} else {
    // Fallback to .env if .env.development doesn't exist
    require('dotenv').config();
}

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false,
        pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
    }
);

module.exports = sequelize;