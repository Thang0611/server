

// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database');

// const DownloadTask = sequelize.define('DownloadTask', {
//     // --- Các trường cơ bản ---
//     email: {
//         type: DataTypes.STRING,
//         allowNull: false,
//         validate: { isEmail: true }
//     },
//     course_url: {
//         type: DataTypes.TEXT,
//         allowNull: false
//     },
//     status: {
//         type: DataTypes.ENUM('pending', 'enrolled', 'downloading', 'completed', 'failed'),
//         defaultValue: 'pending'
//     },
//     retry_count: {
//         type: DataTypes.INTEGER,
//         defaultValue: 0
//     },

//     // --- Các trường mở rộng (Snake Case) ---
//     order_id: {
//         type: DataTypes.STRING,
//         allowNull: true
//     },
//     title: {
//         type: DataTypes.STRING,
//         allowNull: true
//     },
//     price: {
//         type: DataTypes.DECIMAL(15, 0), // Giá tiền (VND)
//         allowNull: true,
//         defaultValue: 0
//     },
//     phone_number: {
//         type: DataTypes.STRING(20),
//         allowNull: true
//     },
//     driver_url: {
//         type: DataTypes.TEXT, // Link Drive
//         allowNull: true
//     },
//     driver_folder: {
//         type: DataTypes.STRING, // Tên folder trên Drive
//         allowNull: true
//     }
// }, {
//     tableName: 'downloads',
//     timestamps: true // Tự động tạo created_at, updated_at (hoặc createdAt tùy config Sequelize)
// });

// module.exports = DownloadTask;


// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database');

// const DownloadTask = sequelize.define('DownloadTask', {
//     id: {
//         type: DataTypes.INTEGER,
//         primaryKey: true,
//         autoIncrement: true
//     },
//     // KHÓA NGOẠI: Liên kết với bảng Orders
//     order_id: {
//         type: DataTypes.INTEGER,
//         allowNull: true, // Có thể null nếu bạn tạo task test không cần đơn hàng
//         references: {
//             model: 'orders',
//             key: 'id'
//         },
//         onUpdate: 'CASCADE',
//         onDelete: 'SET NULL'
//     },
//     // Link khóa học
//     course_url: {
//         type: DataTypes.TEXT,
//         allowNull: false
//     },
//     // Tên khóa học (Crawl được hoặc user nhập)
//     title: {
//         type: DataTypes.STRING,
//         allowNull: true
//     },
//     // --- GIÁ CỦA ITEM TẠI THỜI ĐIỂM MUA ---
//     price: {
//         type: DataTypes.DECIMAL(15, 0),
//         allowNull: false,
//         defaultValue: 0,
//         comment: 'Giá bán thực tế của khóa này trong đơn hàng'
//     },
//     // Trạng thái xử lý download
//     status: {
//         type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
//         defaultValue: 'pending'
//     },
//     // Link Drive (Kết quả trả về cho khách)
//     drive_link: {
//         type: DataTypes.TEXT,
//         allowNull: true
//     },
//     // Số lần thử lại nếu lỗi
//     retry_count: {
//         type: DataTypes.INTEGER,
//         defaultValue: 0
//     },
//     // Log lỗi chi tiết (nếu có)
//     error_log: {
//         type: DataTypes.TEXT,
//         allowNull: true
//     }
// }, {
//     tableName: 'download_tasks',
//     timestamps: true,
//     underscored: true
// });

// module.exports = DownloadTask;




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
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
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
