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

// Quan hệ
Order.hasMany(DownloadTask, {
  foreignKey: 'order_id',
  as: 'items'
});

DownloadTask.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

module.exports = {
  sequelize,
  Order,
  DownloadTask
};
