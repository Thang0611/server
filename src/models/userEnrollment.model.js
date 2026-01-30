/**
 * UserEnrollment model - tracks user access to courses
 * Links users to courses they have purchased or have premium access to
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserEnrollment = sequelize.define('UserEnrollment', {
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },

    user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },

    course_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
            model: 'courses',
            key: 'id'
        }
    },

    order_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
            model: 'orders',
            key: 'id'
        },
        comment: 'Order that granted this access (null for premium auto-access)'
    },

    drive_link: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Google Drive download link for the course'
    },

    bunny_video_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Bunny CDN video/library ID for streaming'
    },

    access_type: {
        type: DataTypes.ENUM('purchased', 'premium'),
        defaultValue: 'purchased',
        comment: 'purchased = bought individually, premium = via premium subscription'
    },

    granted_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },

    expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Access expiry date (null = permanent access)'
    }
}, {
    tableName: 'user_enrollments',
    timestamps: true,
    underscored: true,
    engine: 'InnoDB',
    indexes: [
        { unique: true, fields: ['user_id', 'course_id'] },
        { fields: ['user_id'] },
        { fields: ['course_id'] },
        { fields: ['order_id'] }
    ]
});

module.exports = UserEnrollment;
