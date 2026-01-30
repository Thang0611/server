/**
 * User model for authenticated users
 * Stores Google OAuth user data
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },

    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
    },

    google_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        comment: 'Google OAuth unique identifier'
    },

    name: {
        type: DataTypes.STRING(255),
        allowNull: true
    },

    avatar_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Google profile picture URL'
    },

    is_premium: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether user has premium access to all courses'
    },

    premium_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Premium subscription expiry date (null = permanent)'
    }
}, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    engine: 'InnoDB',
    indexes: [
        { fields: ['email'] },
        { fields: ['google_id'] }
    ]
});

module.exports = User;
