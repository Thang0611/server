/**
 * Course Model
 * Lưu danh sách khóa học permanent từ trang courses
 * @module models/course
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },

  course_url: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true,
    comment: 'URL của khóa học (Udemy, Coursera, etc.)'
  },

  slug: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
    comment: 'Slug của khóa học (extract từ URL hoặc generate từ title)'
  },

  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Tên khóa học'
  },

  thumbnail: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'URL hình ảnh thumbnail'
  },

  instructor: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Tên giảng viên'
  },

  rating: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    comment: 'Đánh giá (0.00 - 5.00)'
  },

  students: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: 'Số lượng học viên'
  },

  duration: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Thời lượng khóa học (ví dụ: "54.5 hours")'
  },

  lectures: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: 'Số lượng bài giảng'
  },

  category: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Category của khóa học (Lập trình, Thiết kế, Marketing, etc.)'
  },

  platform: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'Udemy',
    comment: 'Nền tảng (Udemy, Coursera, LinkedIn Learning, etc.)'
  },

  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Mô tả khóa học'
  },

  price: {
    type: DataTypes.DECIMAL(15, 0),
    allowNull: false,
    defaultValue: 2000,
    comment: 'Giá bán (VND)'
  },

  original_price: {
    type: DataTypes.DECIMAL(15, 0),
    allowNull: true,
    comment: 'Giá gốc (VND)'
  },

  bestseller: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Có phải bestseller không'
  },

  drive_link: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Link Google Drive nếu đã download (sync từ download_tasks)'
  },

  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active',
    comment: 'Trạng thái: active hoặc inactive'
  },

  // Curriculum summary fields
  total_sections: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: 'Tổng số sections trong curriculum'
  },

  total_lectures: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: 'Tổng số lectures trong curriculum'
  },

  total_duration_seconds: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: 'Tổng thời lượng curriculum (giây)'
  }
}, {
  tableName: 'courses',
  timestamps: true,
  underscored: true,
  engine: 'InnoDB',
  indexes: [
    {
      name: 'idx_category',
      fields: ['category']
    },
    {
      name: 'idx_platform',
      fields: ['platform']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_bestseller',
      fields: ['bestseller']
    },
    {
      name: 'idx_slug',
      fields: ['slug']
    }
  ]
});

module.exports = Course;
