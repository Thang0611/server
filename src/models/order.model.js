// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database'); // Đảm bảo đường dẫn đúng

// const Order = sequelize.define('Order', {
//     // ID tự tăng (Primary Key)
//     id: {
//         type: DataTypes.INTEGER,
//         primaryKey: true,
//         autoIncrement: true
//     },
//     // Mã đơn hàng (VD: DH170423) - Dùng để SePay đối soát
//     order_code: {
//         type: DataTypes.STRING(50),
//         allowNull: false,
//         unique: true
//     },
//     // Email người mua
//     user_email: {
//         type: DataTypes.STRING,
//         allowNull: false,
//         validate: { isEmail: true }
//     },
//     // Tổng tiền đơn hàng (Tổng các item cộng lại)
//     total_amount: {
//         type: DataTypes.DECIMAL(15, 0), // VND không cần số thập phân
//         allowNull: false,
//         defaultValue: 0
//     },
//     // Trạng thái thanh toán
//     payment_status: {
//         type: DataTypes.ENUM('pending', 'paid', 'cancelled', 'refunded'),
//         defaultValue: 'pending'
//     },
//     // Lưu dữ liệu gốc từ cổng thanh toán (để debug)
//     payment_gateway_data: {
//         type: DataTypes.JSON,
//         allowNull: true
//     },
//     // Ghi chú đơn hàng (nếu có)
//     note: {
//         type: DataTypes.TEXT,
//         allowNull: true
//     }
// }, {
//     tableName: 'orders',
//     timestamps: true, // Tự động tạo created_at, updated_at
//     underscored: true // Tự động chuyển camelCase sang snake_case (VD: userEmail -> user_email)
// });

// module.exports = Order;


const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },

  order_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },

  user_email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isEmail: true }
  },

  total_amount: {
    type: DataTypes.DECIMAL(15, 0),
    allowNull: false,
    defaultValue: 0
  },

  payment_status: {
    type: DataTypes.ENUM('pending', 'paid', 'cancelled', 'refunded'),
    defaultValue: 'pending'
  },

  // Order fulfillment status (tracks if all downloads are complete)
  order_status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    defaultValue: 'pending',
    comment: 'Tracks overall order fulfillment: pending → processing → completed/failed'
  },

  payment_gateway_data: {
    type: DataTypes.JSON,
    allowNull: true
  },

  note: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'orders',
  timestamps: true,
  underscored: true,
  engine: 'InnoDB'
});

module.exports = Order;
