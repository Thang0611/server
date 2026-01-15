/**
 * Task Log Model
 * Structured logging for download tasks with progress tracking
 * @module models/taskLog
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TaskLog = sequelize.define('TaskLog', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },

  // Foreign Keys
  task_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'download_tasks',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },

  order_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },

  // Log Level & Category
  level: {
    type: DataTypes.ENUM('debug', 'info', 'warn', 'error', 'critical'),
    allowNull: false,
    defaultValue: 'info'
  },

  category: {
    type: DataTypes.ENUM('download', 'upload', 'enrollment', 'system'),
    allowNull: false,
    defaultValue: 'download'
  },

  // Message & Context
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },

  details: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional context: progress, file names, errors, etc.'
  },

  // Progress Tracking
  progress_percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Progress percentage (0-100)'
  },

  current_file: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Current file being processed'
  },

  // Metadata
  source: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Source: python_worker, node_worker, etc.'
  }

}, {
  tableName: 'task_logs',
  timestamps: true,
  updatedAt: false, // Only track creation time
  underscored: true,
  engine: 'InnoDB',
  indexes: [
    { fields: ['task_id'] },
    { fields: ['order_id'] },
    { fields: ['created_at'] },
    { fields: ['level'] },
    { fields: ['category'] },
    { fields: ['task_id', 'level'] },
    { fields: ['order_id', 'category'] },
    { fields: ['task_id', 'created_at'] },
    { fields: ['task_id', 'progress_percent'] }
  ]
});

/**
 * Association with Order and DownloadTask models (define in models/index.js)
 */
TaskLog.associate = (models) => {
  TaskLog.belongsTo(models.Order, {
    foreignKey: 'order_id',
    as: 'order'
  });

  TaskLog.belongsTo(models.DownloadTask, {
    foreignKey: 'task_id',
    as: 'task'
  });
};

module.exports = TaskLog;
