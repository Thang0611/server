/**
 * Download service for handling download-related business logic
 * @module services/download
 */

const DownloadTask = require('../models/downloadTask.model');
const { Order } = require('../models');
const { verifyRequestSignature } = require('../utils/hash.util');
const { transformToSamsungUdemy } = require('../utils/url.util');
const downloadWorker = require('../workers/download.worker');
const Logger = require('../utils/logger.util');
const { AppError } = require('../middleware/errorHandler.middleware');

/**
 * Validates and normalizes course URLs
 * @param {Array} inputCourses - Array of course objects or URLs
 * @returns {Array} - Array of normalized course objects
 */
const normalizeCourses = (inputCourses) => {
  const uniqueUrls = new Set();
  const normalizedCourses = [];

  for (const item of inputCourses) {
    if (!item?.url) continue;

    const cleanUrl = transformToSamsungUdemy(item.url);
    if (!cleanUrl || uniqueUrls.has(cleanUrl)) continue;

    uniqueUrls.add(cleanUrl);
    normalizedCourses.push({
      course_url: cleanUrl,
      title: item.title || null,
      price: item.price !== undefined && item.price !== null ? parseFloat(item.price) : 0,
      courseType: item.courseType || 'temporary', // Lưu courseType từ original course
      category: item.category || null // Lưu category từ original course
    });
  }

  return { normalizedCourses, uniqueUrls };
};

/**
 * Tạo download tasks cho một đơn hàng
 * Mỗi course sẽ tạo 1 task trong database với status = 'pending'
 * Tasks sẽ được xử lý sau khi thanh toán thành công
 * 
 * @param {string} orderId - Order ID (có thể là null nếu chưa có order)
 * @param {string} email - Email khách hàng (bắt buộc)
 * @param {Array} courses - Mảng courses, hỗ trợ 2 format:
 *   1. [{ url: "...", title: "...", price: ... }]
 *   2. ["url1", "url2"] (legacy format)
 * @param {string} [phoneNumber] - Số điện thoại (tùy chọn)
 * @returns {Promise<Object>} - { tasks, uniqueUrls, count }
 * @throws {AppError} - Nếu validation fail hoặc tạo tasks fail
 */
const createDownloadTasks = async (orderId, email, courses, phoneNumber = null) => {
  try {
    // Normalize input: Chuẩn hóa input courses - hỗ trợ 2 format:
    // 1. Array of objects: [{ url: "...", title: "...", price: ... }]
    // 2. Array of strings: ["url1", "url2"] (legacy)
    let inputCourses = [];
    if (Array.isArray(courses)) {
      inputCourses = courses.map(item => {
        // Nếu đã là object có url → dùng luôn
        if (typeof item === 'object' && item !== null && item.url) {
          return {
            url: item.url,
            title: item.title || null,
            price: item.price !== undefined && item.price !== null ? parseFloat(item.price) : 0,
            courseType: item.courseType || 'temporary', // Giữ courseType
            category: item.category || null // Giữ category
          };
        }
        // Nếu là string → convert sang object
        if (typeof item === 'string') {
          return { url: item, title: null, price: 0 };
        }
        // Bỏ qua items không hợp lệ
        return null;
      }).filter(item => item !== null);
    }

    if (inputCourses.length === 0) {
      throw new AppError('Không có khóa học nào', 400);
    }

    // Normalize và deduplicate URLs: Chuẩn hóa URLs và loại bỏ trùng lặp
    // Transform sang format samsungu.udemy.com và loại bỏ query params
    const { normalizedCourses, uniqueUrls } = normalizeCourses(inputCourses);

    if (normalizedCourses.length === 0) {
      throw new AppError('Không có URL hợp lệ sau khi lọc', 400);
    }

    // Validate và resolve order_id: Kiểm tra order có tồn tại không
    // LƯU Ý: Không tạo order ở đây để tránh circular dependency với payment.service
    // Orders nên được tạo qua payment.service.createOrder() trước
    let resolvedOrderId = null;
    
    if (orderId !== null && orderId !== undefined && orderId !== '') {
      try {
        // Try to parse as integer
        const orderIdInt = parseInt(String(orderId).trim(), 10);
        
        // Validate parsed integer
        if (isNaN(orderIdInt) || orderIdInt <= 0) {
          Logger.warn('Invalid order_id format, setting to null', { orderId, parsed: orderIdInt });
          resolvedOrderId = null;
        } else {
          // Check if order exists in database
          const order = await Order.findByPk(orderIdInt, {
            attributes: ['id']
          });
          
          if (order) {
            resolvedOrderId = order.id;
            Logger.debug('Order found', { orderId: orderIdInt });
          } else {
            // Order doesn't exist - log warning but allow task creation without order_id
            Logger.warn('Order not found, creating tasks without order_id', { 
              providedOrderId: orderIdInt,
              email 
            });
            resolvedOrderId = null;
          }
        }
      } catch (error) {
        Logger.error('Error resolving order', error, { orderId });
        // Allow task creation without order_id as fallback
        resolvedOrderId = null;
      }
    }
    // If orderId is null/undefined/empty, resolvedOrderId remains null (tasks can exist without order)

    // Set common fields: Đảm bảo tất cả fields bắt buộc đều có
    // Status ban đầu là 'pending', sẽ được đổi thành 'processing' khi payment webhook xác nhận thanh toán
    // Status flow: pending → processing → enrolled → downloading → completed
    const tasksToCreate = normalizedCourses.map((task) => {
      return {
        course_url: task.course_url,  // URL khóa học đã được normalize
        title: task.title || null,     // Tiêu đề (có thể null, sẽ được update sau khi enroll)
        price: task.price || 0,        // Giá khóa học
        email: email,                 // Email khách hàng (bắt buộc)
        order_id: resolvedOrderId,     // Order ID (có thể null nếu chưa có order)
        phone_number: phoneNumber || null, // Số điện thoại (tùy chọn)
        course_type: task.courseType || 'temporary', // Loại khóa học: temporary hoặc permanent (đã được lưu trong normalizedCourses)
        category: task.category || null, // Category của khóa học (đã được lưu trong normalizedCourses)
        status: 'pending',             // Status ban đầu: pending (chờ thanh toán)
        retry_count: 0                 // Số lần retry (dùng cho error handling)
      };
    });

    // Bulk create tasks: Tạo tất cả tasks cùng lúc (hiệu quả hơn create từng cái)
    // individualHooks: false → Không chạy hooks (beforeCreate, afterCreate) cho từng task
    const savedTasks = await DownloadTask.bulkCreate(tasksToCreate, {
      validate: true,        // Validate trước khi insert
      individualHooks: false // Không chạy hooks để tăng performance
    });

    Logger.success('Download tasks created', {
      orderId,
      email,
      count: savedTasks.length
    });

    // Don't process tasks immediately - they are created with status 'pending'
    // Tasks will be processed after webhook confirms payment and sets status to 'processing'
    Logger.info('Download tasks created with status pending, waiting for payment confirmation', {
      orderId,
      email,
      taskCount: savedTasks.length,
      status: 'pending'
    });

    return {
      tasks: savedTasks,
      uniqueUrls: Array.from(uniqueUrls),
      count: savedTasks.length
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    // Handle foreign key constraint errors specifically
    if (error.name === 'SequelizeForeignKeyConstraintError' || 
        error.message?.includes('foreign key constraint')) {
      Logger.error('Foreign key constraint error - order does not exist', error, {
        orderId,
        email,
        message: 'Order ID does not exist in orders table. Setting order_id to null is allowed.'
      });
      throw new AppError('Đơn hàng không tồn tại trong hệ thống. Vui lòng kiểm tra lại order_id.', 400);
    }
    
    Logger.error('Failed to create download tasks', error, { orderId, email });
    throw new AppError('Lỗi server nội bộ', 500);
  }
};

/**
 * Validates download request signature
 * @param {string} orderId - Order ID
 * @param {string} email - Customer email
 * @param {string} timestamp - Request timestamp
 * @param {string} signature - Request signature
 * @returns {boolean} - True if valid
 */
const validateSignature = (orderId, email, timestamp, signature) => {
  if (!signature || !timestamp || !orderId || !email) {
    return false;
  }

  return verifyRequestSignature(orderId, email, timestamp, signature);
};

/**
 * Processes an order after payment confirmation
 * Verifies valid tasks and triggers download process
 * @param {Object} order - Order object with id, order_code, user_email, etc.
 * @returns {Promise<Object>} - Processing result
 * @throws {AppError} - If processing fails
 */
const processOrder = async (order) => {
  try {
    if (!order || !order.id) {
      throw new AppError('Order is required', 400);
    }

    Logger.info('Processing order after payment confirmation', {
      orderId: order.id,
      orderCode: order.order_code,
      email: order.user_email
    });

    // Find all valid tasks for this order with status 'processing'
    const tasks = await DownloadTask.findAll({
      where: {
        order_id: order.id,
        status: 'processing'
      },
      attributes: ['id', 'email', 'course_url', 'status', 'order_id', 'phone_number', 'title']
    });

    if (tasks.length === 0) {
      Logger.warn('No processing tasks found for order', {
        orderId: order.id,
        orderCode: order.order_code
      });
      return {
        success: true,
        message: 'No tasks to process',
        orderId: order.id,
        taskCount: 0
      };
    }

    Logger.info('Found tasks to process', {
      orderId: order.id,
      taskCount: tasks.length
    });

    // Trigger worker to process each task
    // The worker will handle enrollment, download, and upload
    const processedTasks = [];
    const failedTasks = [];

    for (const task of tasks) {
      try {
        // Process task asynchronously
        downloadWorker.processTask(task).catch(err => {
          Logger.error('Failed to process download task', err, {
            taskId: task.id,
            email: task.email,
            courseUrl: task.course_url
          });
          failedTasks.push({ taskId: task.id, error: err.message });
        });
        
        processedTasks.push(task.id);
      } catch (error) {
        Logger.error('Error triggering task processing', error, {
          taskId: task.id
        });
        failedTasks.push({ taskId: task.id, error: error.message });
      }
    }

    Logger.success('Order processing triggered', {
      orderId: order.id,
      orderCode: order.order_code,
      totalTasks: tasks.length,
      processed: processedTasks.length,
      failed: failedTasks.length
    });

    // Note: We don't spawn Python worker here as the Node.js worker handles it
    // If you need to call Python worker directly, you can do:
    // const { spawn } = require('child_process');
    // const pythonWorker = spawn('python3', ['udemy_dl/worker.py', order.id, ...urls]);

    return {
      success: true,
      orderId: order.id,
      orderCode: order.order_code,
      totalTasks: tasks.length,
      processedTasks: processedTasks.length,
      failedTasks: failedTasks.length
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    Logger.error('Failed to process order', error, {
      orderId: order?.id,
      orderCode: order?.order_code
    });
    
    throw new AppError('Lỗi server nội bộ khi xử lý đơn hàng', 500);
  }
};

module.exports = {
  createDownloadTasks,
  validateSignature,
  normalizeCourses,
  processOrder
};
