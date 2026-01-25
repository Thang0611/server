/**
 * Curriculum Lecture Model
 * Lưu thông tin lectures trong mỗi section của curriculum
 * @module models/curriculumLecture
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CurriculumLecture = sequelize.define('CurriculumLecture', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },

  section_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: 'curriculum_sections',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    comment: 'Foreign key to curriculum_sections table'
  },

  lecture_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'ID từ Udemy (có thể là string)'
  },

  lecture_index: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: 'Thứ tự lecture trong section'
  },

  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Tên lecture'
  },

  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'VIDEO_LECTURE',
    comment: 'Loại lecture: VIDEO_LECTURE, ARTICLE_LECTURE, QUIZ, etc.'
  },

  duration_seconds: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    comment: 'Thời lượng lecture (giây)'
  },

  is_previewable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Có thể xem preview không'
  }
}, {
  tableName: 'curriculum_lectures',
  timestamps: true,
  underscored: true,
  engine: 'InnoDB',
  indexes: [
    {
      name: 'idx_section_id',
      fields: ['section_id']
    },
    {
      name: 'idx_lecture_index',
      fields: ['lecture_index']
    },
    {
      name: 'idx_type',
      fields: ['type']
    },
    {
      unique: true,
      name: 'unique_section_lecture',
      fields: ['section_id', 'lecture_index']
    }
  ]
});

module.exports = CurriculumLecture;
