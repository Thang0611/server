/**
 * Email service for sending emails
 * @module services/email
 */

const transporter = require('../config/email');
const Logger = require('../utils/logger.util');
const lifecycleLogger = require('./lifecycleLogger.service');
const { transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');

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

/**
 * Validates if a task is successfully completed
 * @param {Object} task - Task object
 * @returns {boolean} - True if task has completed status AND valid drive_link
 */
const isTaskSuccessful = (task) => {
  return task.status === 'completed' && 
         task.drive_link && 
         task.drive_link.trim().length > 0;
};

/**
 * Generates HTML row for a course in the batch email (compact, mobile-optimized)
 * @param {Object} task - Task object
 * @param {number} index - Row index
 * @returns {string} - HTML row
 */
const generateCourseRow = (task, index) => {
  const isSuccess = isTaskSuccessful(task);
  const courseTitle = task.title || 'Khóa học không có tiêu đề';
  const cleanSourceUrl = transformToNormalizeUdemyCourseUrl(task.course_url);
  
  const statusBadge = isSuccess
    ? '<span class="status-badge success">✓ Sẵn sàng</span>'
    : '<span class="status-badge failed">✗ Lỗi</span>';
  
  const actionButton = isSuccess
    ? `<a href="${task.drive_link}" class="action-button">📂 Tải ngay</a>`
    : '<span class="contact-text">Liên hệ Admin</span>';

  return `
    <tr class="course-row">
      <td class="course-info">
        <div class="course-title">${index + 1}. ${courseTitle}</div>
        <div class="course-url">
          <a href="${cleanSourceUrl}">${cleanSourceUrl}</a>
        </div>
      </td>
      <td class="course-status">
        ${statusBadge}
      </td>
      <td class="course-action">
        ${actionButton}
      </td>
    </tr>
  `;
};

/**
 * Sends batch completion email for an entire order
 * @param {Object} orderData - Order information
 * @param {Array} tasks - Array of all tasks in the order
 * @returns {Promise<void>}
 */
const sendBatchCompletionEmail = async (orderData, tasks) => {
  if (!process.env.EMAIL_USER) {
    Logger.warn('Email not configured, cannot send batch completion email');
    return;
  }

  if (!tasks || tasks.length === 0) {
    Logger.warn('No tasks provided for batch email', { orderId: orderData.id });
    return;
  }

  // Validate and categorize tasks with STRICT validation
  const successfulTasks = tasks.filter(isTaskSuccessful);
  const failedTasks = tasks.filter(task => !isTaskSuccessful(task));

  const totalTasks = tasks.length;
  const successCount = successfulTasks.length;
  const failedCount = failedTasks.length;

  Logger.info('[Batch Email] Preparing order summary', {
    orderId: orderData.id,
    orderCode: orderData.order_code,
    totalTasks,
    successCount,
    failedCount
  });

  // Generate course rows
  const courseRows = tasks.map((task, index) => generateCourseRow(task, index)).join('');

  // Determine overall status message
  const overallStatus = failedCount === 0
    ? '<div class="status-message success-message"><strong>✓ Tất cả khóa học đã được xử lý thành công!</strong></div>'
    : `<div class="status-message error-message"><strong>⚠ Có ${failedCount} khóa học gặp lỗi.</strong> Vui lòng liên hệ Admin để được hỗ trợ.</div>`;
  
  // Only show failed count in summary if there are failures
  const failedSummaryRow = failedCount > 0 
    ? `<div class="summary-item">
         <strong>❌ Thất bại:</strong>
         <span class="summary-value" style="color: #ef4444; font-weight: 600;">${failedCount}</span>
       </div>`
    : '';

  const mailOptions = {
    from: `"KhoaHocGiaRe Support" <${process.env.EMAIL_USER}>`,
    to: orderData.user_email,
    subject: `📦 Đơn #${orderData.order_code} - ${failedCount === 0 ? 'Hoàn tất' : `${successCount}/${totalTasks} thành công`}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body { 
            background-color: #f5f5f5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
            font-size: 14px;
            line-height: 1.4;
          }
          
          .container { 
            max-width: 800px;
            margin: 0 auto;
            background-color: #ffffff;
          }
          
          /* Header - Compact */
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 16px 12px;
            color: #fff;
          }
          .header-title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .header-code {
            font-size: 13px;
            opacity: 0.9;
          }
          
          /* Content - Minimal padding */
          .content { 
            padding: 12px;
          }
          
          /* Status Badge - Top of content */
          .status-banner {
            padding: 10px 12px;
            border-radius: 6px;
            margin-bottom: 12px;
            font-size: 13px;
            font-weight: 600;
          }
          .status-banner.success {
            background-color: #d1fae5;
            color: #065f46;
          }
          .status-banner.warning {
            background-color: #fef3c7;
            color: #92400e;
          }
          
          /* Summary - Key:Value pairs, tight spacing */
          .summary {
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 12px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 13px;
          }
          .summary-label {
            color: #6b7280;
          }
          .summary-value {
            font-weight: 600;
            color: #1f2937;
          }
          .summary-value.success {
            color: #10b981;
          }
          .summary-value.failed {
            color: #ef4444;
          }
          
          /* Table - Compact for desktop */
          .courses-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            overflow: hidden;
          }
          .courses-table thead {
            background-color: #f3f4f6;
          }
          .courses-table th {
            padding: 10px 12px;
            text-align: left;
            font-weight: 600;
            color: #374151;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .courses-table th:nth-child(2),
          .courses-table th:nth-child(3) {
            text-align: center;
          }
          
          .course-row {
            border-bottom: 1px solid #e5e7eb;
          }
          .course-row:last-child {
            border-bottom: none;
          }
          
          .course-info {
            padding: 10px 12px;
            vertical-align: middle;
          }
          .course-title {
            font-weight: 600;
            font-size: 14px;
            color: #1f2937;
            margin-bottom: 4px;
            line-height: 1.3;
          }
          .course-url {
            font-size: 11px;
            color: #9ca3af;
            word-break: break-all;
          }
          .course-url a {
            color: #3b82f6;
            text-decoration: none;
          }
          
          .course-status {
            padding: 10px 12px;
            text-align: center;
            vertical-align: middle;
          }
          .course-action {
            padding: 10px 12px;
            text-align: center;
            vertical-align: middle;
          }
          
          .status-badge {
            padding: 5px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            display: inline-block;
            white-space: nowrap;
          }
          .status-badge.success {
            background-color: #10b981;
            color: white;
          }
          .status-badge.failed {
            background-color: #ef4444;
            color: white;
          }
          
          .action-button {
            display: inline-block;
            background-color: #3b82f6;
            color: white;
            text-align: center;
            padding: 8px 16px;
            text-decoration: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            white-space: nowrap;
          }
          .action-button:active {
            background-color: #2563eb;
          }
          
          .contact-text {
            color: #6b7280;
            font-size: 12px;
            font-weight: 500;
          }
          
          /* Warning - Compact */
          .warning {
            background-color: #fef3c7;
            border-left: 3px solid #f59e0b;
            padding: 10px 12px;
            margin: 12px 0;
            font-size: 12px;
            color: #92400e;
          }
          .warning strong {
            display: block;
            margin-bottom: 4px;
            font-size: 13px;
          }
          
          /* Footer - Minimal */
          .footer {
            background-color: #f9fafb;
            padding: 12px;
            text-align: center;
            font-size: 11px;
            color: #9ca3af;
            border-top: 1px solid #e5e7eb;
          }
          .footer a {
            color: #3b82f6;
            text-decoration: none;
          }
          
          /* Desktop adjustments */
          @media only screen and (min-width: 600px) {
            body {
              padding: 20px;
            }
            .container {
              border-radius: 8px;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
            .header {
              border-radius: 8px 8px 0 0;
            }
          }
          
          /* Mobile - Convert table to cards */
          @media only screen and (max-width: 599px) {
            .courses-table thead {
              display: none;
            }
            
            .courses-table,
            .courses-table tbody,
            .courses-table tr {
              display: block;
              width: 100%;
            }
            
            .course-row {
              margin-bottom: 10px;
              border: 1px solid #e5e7eb !important;
              border-radius: 6px;
              overflow: hidden;
            }
            
            .course-info,
            .course-status,
            .course-action {
              display: block;
              width: 100%;
              padding: 10px 12px !important;
              text-align: left !important;
            }
            
            .course-info {
              background-color: #fafafa;
              border-bottom: 1px solid #e5e7eb;
            }
            
            .course-status {
              border-bottom: 1px solid #e5e7eb;
            }
            
            .course-action {
              background-color: #fff;
            }
            
            .action-button {
              display: block;
              width: 100%;
              padding: 12px 16px;
              font-size: 14px;
              /* Mobile tap target */
              min-height: 44px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Compact Header -->
          <div class="header">
            <div class="header-title">${failedCount === 0 ? '✅' : '⚠️'} Đơn hàng #${orderData.order_code}</div>
            <div class="header-code">${successCount}/${totalTasks} khóa học</div>
          </div>
          
          <div class="content">
            <!-- Status Banner -->
            <div class="status-banner ${failedCount === 0 ? 'success' : 'warning'}">
              ${failedCount === 0 
                ? '✓ Tất cả khóa học đã sẵn sàng!' 
                : `⚠ ${failedCount} khóa học gặp lỗi - Liên hệ Admin`}
            </div>

            <!-- Compact Summary -->
            <div class="summary">
              <div class="summary-row">
                <span class="summary-label">Mã đơn:</span>
                <span class="summary-value">#${orderData.order_code}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Email:</span>
                <span class="summary-value" style="font-size: 12px;">${orderData.user_email}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Thành công:</span>
                <span class="summary-value success">${successCount}/${totalTasks}</span>
              </div>
              ${failedCount > 0 ? `
              <div class="summary-row">
                <span class="summary-label">Thất bại:</span>
                <span class="summary-value failed">${failedCount}</span>
              </div>
              ` : ''}
            </div>

            <!-- Courses Table - Responsive -->
            <table class="courses-table">
              <thead>
                <tr>
                  <th>Khóa học</th>
                  <th>Trạng thái</th>
                  <th>Tải xuống</th>
                </tr>
              </thead>
              <tbody>
                ${courseRows}
              </tbody>
            </table>

            <!-- Compact Warning -->
            <div class="warning">
              <strong>⚠️ Lưu ý:</strong>
              File chỉ lưu 30 ngày. Tải về máy ngay!
            </div>
          </div>

          <!-- Minimal Footer -->
          <div class="footer">
            Hỗ trợ: <a href="mailto:${ADMIN_EMAIL}">${ADMIN_EMAIL}</a>
            <div style="margin-top: 4px;">© ${new Date().getFullYear()} KhoaHocGiaRe</div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
  
  Logger.success('[Batch Email] Order completion email sent successfully', {
    orderId: orderData.id,
    orderCode: orderData.order_code,
    email: orderData.user_email,
    totalTasks,
    successCount,
    failedCount
  });

  // ✅ LIFECYCLE LOG: Email Sent
  lifecycleLogger.logEmailSent(
    orderData.id,
    orderData.user_email,
    'completion'
  );
};

module.exports = {
  sendErrorAlert,
  sendBatchCompletionEmail,
  isTaskSuccessful
};
