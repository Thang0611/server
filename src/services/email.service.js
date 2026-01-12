/**
 * Email service for sending emails
 * @module services/email
 */

const transporter = require('../config/email');
const Logger = require('../utils/logger.util');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@khoahocgiare.info';

/**
 * Sends error alert email to admin
 * @param {Object} taskData - Task data object
 * @param {string} errorMessage - Error message
 * @returns {Promise<void>}
 */
const sendErrorAlert = async (taskData, errorMessage) => {
  try {
    if (!process.env.EMAIL_USER) {
      Logger.warn('Email not configured, cannot send error alert');
      return;
    }

    const subject = `[CẢNH BÁO] Lỗi Download/Enroll - User: ${taskData.email}`;

    const htmlContent = `
      <h3>Hệ thống gặp lỗi khi xử lý đơn hàng</h3>
      <p><strong>Order ID:</strong> ${taskData.order_id || 'N/A'}</p>
      <p><strong>User Email:</strong> ${taskData.email}</p>
      <p><strong>Course URL:</strong> ${taskData.course_url}</p>
      <hr/>
      <p style="color: red; font-weight: bold;">Chi tiết lỗi:</p>
      <pre>${errorMessage}</pre>
      <p><em>Vui lòng kiểm tra server hoặc account enroll ngay.</em></p>
    `;

    await transporter.sendMail({
      from: `"Download System" <${process.env.EMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject: subject,
      html: htmlContent
    });

    Logger.info('Error alert email sent to admin', {
      adminEmail: ADMIN_EMAIL,
      taskId: taskData.id,
      orderId: taskData.order_id
    });
  } catch (error) {
    Logger.error('Failed to send error alert email', error, {
      taskId: taskData.id,
      orderId: taskData.order_id
    });
  }
};

module.exports = {
  sendErrorAlert
};
