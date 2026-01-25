// const sequelize = require('../config/database');
// const Order = require('./Order');
// const DownloadTask = require('./DownloadTask');

// // --- THIẾT LẬP QUAN HỆ (ASSOCIATIONS) ---

// // 1. Order là CHA (1 Order có nhiều Tasks)
// Order.hasMany(DownloadTask, { 
//     foreignKey: 'order_id', 
//     as: 'items' // Khi query Order sẽ dùng: include: ['items']
// });

// // 2. DownloadTask là CON (1 Task thuộc về 1 Order)
// DownloadTask.belongsTo(Order, { 
//     foreignKey: 'order_id', 
//     as: 'order' 
// });

// // Xuất ra để dùng ở server.js
// module.exports = {
//     sequelize,
//     Order,
//     DownloadTask
// };


const sequelize = require('../config/database');
const Order = require('./order.model');
const DownloadTask = require('./downloadTask.model');
const OrderAuditLog = require('./orderAuditLog.model');
const TaskLog = require('./taskLog.model');
const Course = require('./course.model');
const CurriculumSection = require('./curriculumSection.model');
const CurriculumLecture = require('./curriculumLecture.model');

// === ASSOCIATIONS ===

// Order has many DownloadTasks
Order.hasMany(DownloadTask, {
  foreignKey: 'order_id',
  as: 'items'  // For backward compatibility
});

Order.hasMany(DownloadTask, {
  foreignKey: 'order_id',
  as: 'tasks'  // For admin dashboard
});

// Order has many AuditLogs
Order.hasMany(OrderAuditLog, {
  foreignKey: 'order_id',
  as: 'auditLogs'
});

// DownloadTask belongs to Order
DownloadTask.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

// DownloadTask has many AuditLogs
DownloadTask.hasMany(OrderAuditLog, {
  foreignKey: 'task_id',
  as: 'auditLogs'
});

// OrderAuditLog belongs to Order
OrderAuditLog.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

// OrderAuditLog belongs to DownloadTask
OrderAuditLog.belongsTo(DownloadTask, {
  foreignKey: 'task_id',
  as: 'task'
});

// DownloadTask has many TaskLogs
DownloadTask.hasMany(TaskLog, {
  foreignKey: 'task_id',
  as: 'logs'
});

// Order has many TaskLogs
Order.hasMany(TaskLog, {
  foreignKey: 'order_id',
  as: 'taskLogs'
});

// TaskLog belongs to Order
TaskLog.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

// TaskLog belongs to DownloadTask
TaskLog.belongsTo(DownloadTask, {
  foreignKey: 'task_id',
  as: 'task'
});

// === CURRICULUM ASSOCIATIONS ===

// Course has many CurriculumSections
Course.hasMany(CurriculumSection, {
  foreignKey: 'course_id',
  as: 'sections'
});

// CurriculumSection belongs to Course
CurriculumSection.belongsTo(Course, {
  foreignKey: 'course_id',
  as: 'course'
});

// CurriculumSection has many CurriculumLectures
CurriculumSection.hasMany(CurriculumLecture, {
  foreignKey: 'section_id',
  as: 'lectures'
});

// CurriculumLecture belongs to CurriculumSection
CurriculumLecture.belongsTo(CurriculumSection, {
  foreignKey: 'section_id',
  as: 'section'
});

module.exports = {
  sequelize,
  Order,
  DownloadTask,
  OrderAuditLog,
  TaskLog,
  Course,
  CurriculumSection,
  CurriculumLecture
};
