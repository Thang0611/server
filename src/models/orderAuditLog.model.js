/**
 * Order Audit Log Model
 * Tracks all state changes and critical events for orders
 * @module models/orderAuditLog
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderAuditLog = sequelize.define('OrderAuditLog', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },

  // Foreign Keys
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

  task_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    references: {
      model: 'download_tasks',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    comment: 'NULL for order-level events'
  },

  // Event Information
  event_type: {
    type: DataTypes.ENUM(
      'order_created',
      'payment_received',
      'payment_verified',
      'task_created',
      'task_queued',
      'enrollment_started',
      'enrollment_success',
      'enrollment_failed',
      'download_started',
      'download_completed',
      'download_failed',
      'upload_started',
      'upload_completed',
      'upload_failed',
      'webhook_received',
      'email_sent',
      'order_completed',
      'order_failed',
      'status_change'
    ),
    allowNull: false
  },

  event_category: {
    type: DataTypes.ENUM('payment', 'enrollment', 'download', 'notification', 'system'),
    allowNull: false
  },

  severity: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
    defaultValue: 'info'
  },

  // State Tracking
  previous_status: {
    type: DataTypes.STRING(50),
    allowNull: true
  },

  new_status: {
    type: DataTypes.STRING(50),
    allowNull: true
  },

  // Message & Context
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },

  details: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional context: API responses, error stack traces, etc.'
  },

  // Metadata
  source: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Source of log: node_worker, python_worker, webhook_handler'
  },

  user_agent: {
    type: DataTypes.STRING(255),
    allowNull: true
  },

  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  }

}, {
  tableName: 'order_audit_logs',
  timestamps: true,
  updatedAt: false, // Only track creation time
  underscored: true,
  engine: 'InnoDB',
  indexes: [
    { fields: ['order_id'] },
    { fields: ['task_id'] },
    { fields: ['event_type'] },
    { fields: ['severity'] },
    { fields: ['created_at'] },
    { fields: ['order_id', 'event_category'] },
    { fields: ['order_id', 'severity'] }
  ]
});

/**
 * Association with Order model (define in models/index.js)
 */
OrderAuditLog.associate = (models) => {
  OrderAuditLog.belongsTo(models.Order, {
    foreignKey: 'order_id',
    as: 'order'
  });

  OrderAuditLog.belongsTo(models.DownloadTask, {
    foreignKey: 'task_id',
    as: 'task'
  });
};

module.exports = OrderAuditLog;
