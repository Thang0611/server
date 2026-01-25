/**
 * Curriculum Section Model
 * Lưu thông tin sections trong curriculum của khóa học
 * @module models/curriculumSection
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CurriculumSection = sequelize.define('CurriculumSection', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },

  course_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'courses',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    comment: 'Foreign key to courses table'
  },

  section_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'ID từ Udemy (có thể là string)'
  },

  section_index: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: 'Thứ tự section trong khóa học'
  },

  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Tên section'
  },

  lecture_count: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    comment: 'Số lượng lectures trong section'
  },

  duration_seconds: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    comment: 'Tổng thời lượng section (giây)'
  }
}, {
  tableName: 'curriculum_sections',
  timestamps: true,
  underscored: true,
  engine: 'InnoDB',
  indexes: [
    {
      name: 'idx_course_id',
      fields: ['course_id']
    },
    {
      name: 'idx_section_index',
      fields: ['section_index']
    },
    {
      unique: true,
      name: 'unique_course_section',
      fields: ['course_id', 'section_index']
    }
  ]
});

module.exports = CurriculumSection;
