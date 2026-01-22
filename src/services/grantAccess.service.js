/**
 * Grant access service for handling Google Drive access granting
 * @module services/grantAccess
 */

const axios = require('axios');
const https = require('https');
const { extractIdFromUrl, grantReadAccess } = require('../utils/drive.util');
const transporter = require('../config/email');
const Logger = require('../utils/logger.util');
const lifecycleLogger = require('./lifecycleLogger.service');
const { AppError } = require('../middleware/errorHandler.middleware');

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://getcourses.net';
const SECRET_KEY = process.env.SECRET_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@getcourses.net';

/**
 * Sends admin alert email
 * @param {string} orderId - Order ID
 * @param {string} customerEmail - Customer email
 * @param {Array} failedList - List of failed items
 * @param {string} errorMessage - Error message
 * @returns {Promise<void>}
 */
const sendAdminAlert = async (orderId, customerEmail, failedList, errorMessage) => {
  try {
    if (!EMAIL_USER) {
      Logger.warn('Email not configured, cannot send admin alert');
      return;
    }

    let errorDetail = '';
    if (failedList.length > 0) {
      errorDetail = failedList.map(f => 
        `<li><strong>${f.name}</strong>: ${f.reason} <br>Link: ${f.link}</li>`
      ).join('');
    } else {
      errorDetail = `<li>${errorMessage}</li>`;
    }

    await transporter.sendMail({
      from: `"System Bot" <${EMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject: `⚠️ LỖI CẤP QUYỀN: Đơn hàng #${orderId}`,
      html: `
        <h3>Cần xử lý thủ công!</h3>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Khách hàng:</strong> ${customerEmail}</p>
        <hr>
        <h4>Chi tiết lỗi:</h4>
        <ul>${errorDetail}</ul>
        <p><em>Vui lòng kiểm tra và cấp quyền tay.</em></p>
      `
    });

    Logger.success('Admin alert sent', { orderId, email: customerEmail });
  } catch (error) {
    Logger.error('Failed to send admin alert email', error, { orderId });
  }
};

/**
 * Sends success email to customer
 * @param {string} email - Customer email
 * @param {string} orderId - Order ID
 * @param {Array} successList - List of successfully granted items
 * @returns {Promise<void>}
 */
const sendSuccessEmail = async (email, orderId, successList) => {
  try {
    if (!EMAIL_USER) {
      Logger.warn('Email not configured, cannot send success email');
      return;
    }

    const listHtml = successList.map((item, index) => {
      return `<div style="margin-bottom:8px; padding:10px; background:#f9f9f9; border-left:4px solid #28a745;">
        <strong>${index + 1}. ${item.name}</strong><br>
        <a href="${item.url}" style="color:#007bff; text-decoration:none; font-weight:bold;">👉 Bấm vào đây để mở Google Drive</a>
      </div>`;
    }).join('');

    await transporter.sendMail({
      from: `"GetCourses" <${EMAIL_USER}>`,
      to: email,
      subject: `✅ Tài liệu đơn hàng #${orderId} đã sẵn sàng`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color:#28a745;">Cấp quyền thành công!</h2>
          <p>Xin chào,</p>
          <p>Hệ thống đã tự động thêm email <strong>${email}</strong> vào danh sách được phép truy cập tài liệu.</p>
          <hr style="border:0; border-top:1px solid #eee;">
          ${listHtml}
          <hr style="border:0; border-top:1px solid #eee;">
          <p style="font-size:13px; color:#666;"><em>Lưu ý: Vui lòng đăng nhập đúng email trên để xem tài liệu.</em></p>
        </div>
      `
    });

    Logger.success('Success email sent', { email, orderId });
  } catch (error) {
    Logger.error('Failed to send success email', error, { email, orderId });
    throw error;
  }
};

/**
 * Notifies WordPress about order completion
 * @param {string} orderId - Order ID
 * @param {number} successCount - Number of successful grants
 * @returns {Promise<void>}
 */
const notifyWordPress = async (orderId, successCount) => {
  if (!SECRET_KEY) {
    Logger.warn('SECRET_KEY not configured, cannot notify WordPress');
    return;
  }

  try {
    const agent = new https.Agent({ rejectUnauthorized: false });

    const response = await axios.post(
      `${WORDPRESS_URL}/wp-json/nht-app/v1/complete-order`,
      {
        order_id: orderId,
        success: true,
        message: `✅ Auto Drive: Đã cấp quyền ${successCount} khóa.`
      },
      {
        headers: { 'x-callback-secret': SECRET_KEY },
        httpsAgent: agent,
        timeout: 10000
      }
    );

    Logger.success('WordPress notified', { orderId });
  } catch (error) {
    Logger.error('Failed to notify WordPress', error, { orderId });
    // Don't throw - order is already processed
  }
};

/**
 * Grants access to courses
 * @param {string} orderId - Order ID
 * @param {string} email - Customer email
 * @param {Array} courses - Array of course objects with drive_link and course_name
 * @returns {Promise<Object>} - Result with success and failed lists
 */
const grantAccess = async (orderId, email, courses) => {
  const startTime = Date.now();

    Logger.info('Starting grant access', { orderId, email, count: courses?.length || 0 });

  // Validate input
  if (!email || !courses || !Array.isArray(courses)) {
    throw new AppError('Dữ liệu đầu vào không hợp lệ (Thiếu email hoặc courses)', 400);
  }

  const successList = [];
  const failedList = [];

  // Process each course
  for (const item of courses) {
    let finalUrl = item.drive_link || '';
    const courseName = item.course_name || 'Unknown';

    Logger.debug('Processing course', { courseName, orderId });

    // Fix Samsung link if present
    if (finalUrl.includes('samsungu.')) {
      finalUrl = finalUrl.replace('samsungu.', '');
    }

    const fileId = extractIdFromUrl(finalUrl);

    if (!fileId) {
      Logger.warn('Invalid drive link format', { courseName, url: finalUrl, orderId });
      failedList.push({
        name: courseName,
        reason: 'Link Drive sai định dạng',
        link: finalUrl
      });
      continue;
    }

    try {
      const isGranted = await grantReadAccess(fileId, email);

      if (isGranted) {
        Logger.success('Access granted', { fileId, orderId });
        successList.push({ name: courseName, url: finalUrl });
        
        // ✅ LIFECYCLE LOG: Permission Granted
        // Try to find taskId from drive_link
        try {
          const DownloadTask = require('../models/downloadTask.model');
          const task = await DownloadTask.findOne({
            where: { drive_link: finalUrl, order_id: orderId },
            attributes: ['id']
          });
          
          if (task) {
            lifecycleLogger.logPermissionGranted(task.id, email, finalUrl);
          } else {
            // Log without taskId if not found
            lifecycleLogger.logEvent('PERMISSION_GRANTED', 
              `[PERMISSION_GRANTED] [OrderId: ${orderId}] [User: ${email}] [Course: ${courseName}]`,
              { orderId, email, courseName, driveLink: finalUrl }
            );
          }
        } catch (logError) {
          Logger.warn('Failed to log permission granted', { orderId, courseName });
        }
      } else {
        Logger.warn('Access grant failed', { courseName, fileId, orderId });
        failedList.push({
          name: courseName,
          reason: 'Google API từ chối (Lỗi quyền Bot)',
          link: finalUrl
        });
        
        // ✅ LIFECYCLE LOG: Permission Error
        try {
          const DownloadTask = require('../models/downloadTask.model');
          const task = await DownloadTask.findOne({
            where: { drive_link: finalUrl, order_id: orderId },
            attributes: ['id']
          });
          
          if (task) {
            lifecycleLogger.logPermissionError(task.id, 'Google API từ chối (Lỗi quyền Bot)', { orderId, email, courseName });
          }
        } catch (logError) {
          Logger.warn('Failed to log permission error', { orderId, courseName });
        }
      }
    } catch (error) {
      Logger.error('Exception during access grant', error, { courseName, fileId, orderId });
      failedList.push({
        name: courseName,
        reason: `Lỗi hệ thống: ${error.message}`,
        link: finalUrl
      });
      
      // ✅ LIFECYCLE LOG: Permission Error
      try {
        const DownloadTask = require('../models/downloadTask.model');
        const task = await DownloadTask.findOne({
          where: { drive_link: finalUrl, order_id: orderId },
          attributes: ['id']
        });
        
        if (task) {
          lifecycleLogger.logPermissionError(task.id, error.message, { orderId, email, courseName });
        }
      } catch (logError) {
        Logger.warn('Failed to log permission error', { orderId, courseName });
      }
    }
  }

  const duration = (Date.now() - startTime) / 1000;

  // Handle failures
  if (failedList.length > 0) {
    Logger.warn('Grant access completed with failures', {
      orderId,
      successCount: successList.length,
      failedCount: failedList.length,
      duration
    });

    await sendAdminAlert(orderId, email, failedList, 'Có khóa học cấp quyền thất bại');
    return { success: false, successList, failedList };
  }

  // Handle success
  if (successList.length > 0 && failedList.length === 0) {
    Logger.success('Grant access completed', {
      orderId,
      count: successList.length
    });

    // Send success email
    try {
      await sendSuccessEmail(email, orderId, successList);
    } catch (error) {
      Logger.error('Failed to send success email', error, { orderId, email });
      // Continue even if email fails
    }

    // Notify WordPress
    await notifyWordPress(orderId, successList.length);

    return { success: true, successList, failedList };
  }

  return { success: false, successList, failedList };
};

module.exports = {
  grantAccess
};
