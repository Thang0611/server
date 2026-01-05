const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DownloadTask = sequelize.define('DownloadTask', {
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isEmail: true }
    },
    course_url: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'enrolled', 'downloading', 'completed', 'failed'),
        defaultValue: 'pending'
    },
    retry_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'downloads',
    timestamps: true
});

module.exports = DownloadTask;