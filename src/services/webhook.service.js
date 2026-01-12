/**
 * Webhook service for handling webhook-related business logic
 * @module services/webhook
 */

const DownloadTask = require('../models/downloadTask.model');
const transporter = require('../config/email');
const { findFolderByName, grantReadAccess } = require('../utils/drive.util');
const { transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');
const Logger = require('../utils/logger.util');
const { AppError } = require('../middleware/errorHandler.middleware');

const MAX_RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3000;

/**
 * Waits for a specified duration
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Finds a folder on Google Drive with retry logic
 * @param {string} folderName - Name of the folder to find
 * @returns {Promise<Object|null>} - Folder object or null if not found
 */
const findFolderWithRetry = async (folderName) => {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const folder = await findFolderByName(folderName);
      if (folder) {
        return folder;
      }
    } catch (error) {
      Logger.warn('Error finding folder', { folderName, attempt: attempt + 1, error: error.message });
    }

    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      await wait(RETRY_DELAY_MS);
    }
  }

  return null;
};

/**
 * Grants read access to a Google Drive folder
 * @param {string} folderId - Google Drive folder ID
 * @param {string} email - Email to grant access to
 * @returns {Promise<boolean>} - True if successful
 */
const grantFolderAccess = async (folderId, email) => {
  try {
    await grantReadAccess(folderId, email);
    Logger.success('Folder access granted', { folderId, email });
    return true;
  } catch (error) {
    Logger.error('Failed to grant folder access', error, { folderId, email });
    return false;
  }
};

/**
 * Sends completion email to customer
 * @param {Object} task - Download task object
 * @param {string} folderName - Folder name
 * @param {string} driveLink - Google Drive link
 * @returns {Promise<void>}
 */
const sendCompletionEmail = async (task, folderName, driveLink) => {
  if (!process.env.EMAIL_USER) {
    throw new AppError('Email configuration missing', 500);
  }

  const courseDisplayName = task.title || folderName;
  const cleanSourceUrl = transformToNormalizeUdemyCourseUrl(task.course_url);

  const mailOptions = {
    from: `"KhoaHocGiaRe Support" <${process.env.EMAIL_USER}>`,
    to: task.email,
    subject: `✅ Hoàn tất: Khóa học "${courseDisplayName}" đã sẵn sàng!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; background-color: #f4f4f7; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          .header { background-color: #2c3e50; padding: 30px 20px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 40px 30px; color: #51545e; line-height: 1.6; }
          .success-icon { text-align: center; margin-bottom: 20px; }
          .info-box { background-color: #f8f9fa; border-left: 4px solid #10b981; padding: 20px; border-radius: 4px; margin: 25px 0; }
          .info-item { margin-bottom: 10px; font-size: 15px; }
          .info-item strong { color: #2c3e50; min-width: 120px; display: inline-block; }
          .btn-container { text-align: center; margin-top: 35px; margin-bottom: 20px; }
          .btn { background-color: #007bff; color: #ffffff !important; padding: 14px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0, 123, 255, 0.25); transition: background-color 0.3s; }
          .btn:hover { background-color: #0056b3; }
          .warning-box { margin-top: 25px; padding: 15px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 6px; color: #856404; font-size: 14px; text-align: left; }
          .warning-title { font-weight: bold; display: flex; align-items: center; margin-bottom: 5px; }
          .footer { background-color: #f4f4f7; padding: 20px; text-align: center; font-size: 12px; color: #a8aaaf; }
        </style>
      </head>
      <body>
        <div style="padding: 40px 0;">
          <div class="container">
            <div class="header">
              <h1>Khóa Học Đã Tải Xong! 🚀</h1>
            </div>
            <div class="content">
              <div class="success-icon">
                <img src="https://cdn-icons-png.flaticon.com/512/190/190411.png" width="60" alt="Success" style="display:block; margin:0 auto;">
              </div>
              <p style="text-align: center; font-size: 16px; margin-bottom: 30px;">
                Hệ thống đã xử lý thành công yêu cầu của bạn.<br>
                Dưới đây là thông tin truy cập khóa học:
              </p>
              <div class="info-box">
                <div class="info-item">
                  <strong>📦 Khóa học:</strong><br> 
                  <span style="color: #333;">${courseDisplayName}</span>
                </div>
                <div class="info-item" style="margin-top: 15px;">
                  <strong>📧 Email:</strong><br> 
                  <span style="color: #333;">${task.email}</span>
                </div>
                <div class="info-item" style="margin-top: 15px;">
                  <strong>🔗 Nguồn gốc:</strong><br> 
                  <a href="${cleanSourceUrl}" style="color: #007bff; text-decoration: none; word-break: break-all; font-size: 13px;">${cleanSourceUrl}</a>
                </div>
              </div>
              <div class="btn-container">
                <a href="${driveLink}" class="btn">
                  📂 TRUY CẬP GOOGLE DRIVE NGAY
                </a>
                <div class="warning-box">
                  <div class="warning-title">⚠️ LƯU Ý QUAN TRỌNG:</div>
                  Chúng tôi chỉ lưu trữ khóa học này trên Drive trong vòng <strong>30 ngày</strong>.<br>
                  Vui lòng <strong>tải về máy tính cá nhân</strong> của bạn ngay để lưu trữ lâu dài và tránh mất dữ liệu.
                </div>
              </div>
            </div>
            <div class="footer">
              <p>Email này được gửi tự động từ hệ thống KhoaHocGiaRe.</p>
              <p>© ${new Date().getFullYear()} All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
  Logger.success('Completion email sent', { email: task.email, taskId: task.id });
};

/**
 * Finalizes a download task
 * @param {number} taskId - Task ID
 * @param {string} folderName - Folder name on Google Drive
 * @param {string} secretKey - Secret key for authentication
 * @returns {Promise<Object>} - Finalization result
 * @throws {AppError} - If validation fails
 */
const finalizeDownload = async (taskId, folderName, secretKey) => {
  // Validate secret key
  const SERVER_SECRET = process.env.API_SECRET_KEY;
  if (!SERVER_SECRET) {
    throw new AppError('Server secret key not configured', 500);
  }

  if (secretKey !== SERVER_SECRET) {
    throw new AppError('Forbidden: Wrong Key', 403);
  }

  // Find task
  const task = await DownloadTask.findByPk(taskId, {
    attributes: ['id', 'email', 'course_url', 'title', 'status', 'drive_link']
  });

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  Logger.info('Finalizing download', { taskId });

  // Find folder on Drive with retry
  const driveFolder = await findFolderWithRetry(folderName);
  let driveLink = null;

  if (driveFolder) {
    driveLink = driveFolder.webViewLink;
    Logger.success('Drive folder found', { folderId: driveFolder.id });

    // Grant access
    await grantFolderAccess(driveFolder.id, task.email);
  } else {
    Logger.warn('Drive folder not found after retries', { folderName, taskId });
  }

  // Update task status
  const updateData = {
    status: driveLink ? 'completed' : 'failed',
    drive_link: driveLink
  };

  await task.update(updateData);

  // Send email if successful
  if (driveLink && process.env.EMAIL_USER) {
    try {
      await sendCompletionEmail(task, folderName, driveLink);
    } catch (error) {
      Logger.error('Failed to send completion email', error, { taskId });
      // Don't throw - task is already updated
    }
  }

  return {
    success: true,
    taskId,
    driveLink: driveLink || null
  };
};

module.exports = {
  finalizeDownload
};
