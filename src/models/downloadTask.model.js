




const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DownloadTask = sequelize.define('DownloadTask', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },

  // 🔑 FOREIGN KEY → orders.id
  order_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    references: {
      model: 'orders',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  },

  // Email của khách hàng (bắt buộc để enroll vào Udemy)
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },

  // Số điện thoại (tùy chọn)
  phone_number: {
    type: DataTypes.STRING(20),
    allowNull: true
  },

  course_url: {
    type: DataTypes.TEXT,
    allowNull: false
  },

  title: {
    type: DataTypes.STRING,
    allowNull: true
  },

  price: {
    type: DataTypes.DECIMAL(15, 0),
    allowNull: false,
    defaultValue: 0,
    comment: 'Giá bán thực tế của khóa này trong đơn hàng'
  },

  status: {
    type: DataTypes.ENUM('paid', 'pending', 'processing', 'enrolled', 'completed', 'failed'),
    defaultValue: 'pending'
  },

  drive_link: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  error_log: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'download_tasks',
  timestamps: true,
  underscored: true,
  engine: 'InnoDB'
});

module.exports = DownloadTask;
