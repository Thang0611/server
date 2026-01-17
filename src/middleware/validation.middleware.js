/**
 * Validation middleware for request validation
 * ✅ SECURITY: Using Zod for strict input validation to prevent injection attacks
 * @module middleware/validation
 */

const { z } = require('zod');

/**
 * ✅ SECURITY: Strict URL validation schema - only allow Udemy URLs
 * Prevents command injection by validating URL format strictly
 */
const udemyUrlSchema = z.string()
  .url('URL không hợp lệ')
  .refine(
    (url) => {
      try {
        const parsedUrl = new URL(url);
        // Only allow https://www.udemy.com or https://udemy.com domains
        return parsedUrl.hostname === 'www.udemy.com' || 
               parsedUrl.hostname === 'udemy.com' ||
               parsedUrl.hostname.endsWith('.udemy.com');
      } catch {
        return false;
      }
    },
    { message: 'Chỉ chấp nhận URL từ Udemy (udemy.com)' }
  )
  .max(2048, 'URL quá dài (tối đa 2048 ký tự)');

/**
 * ✅ SECURITY: Email validation schema
 */
const emailSchema = z.string()
  .email('Email không hợp lệ')
  .max(255, 'Email quá dài (tối đa 255 ký tự)')
  .toLowerCase(); // Normalize to lowercase

/**
 * ✅ SECURITY: Order ID validation schema (string or number)
 */
const orderIdSchema = z.union([
  z.string().min(1, 'order_id không được rỗng').max(100, 'order_id quá dài'),
  z.number().int().positive('order_id phải là số dương')
]);

/**
 * ✅ SECURITY: Task ID validation schema
 */
const taskIdSchema = z.union([
  z.string().regex(/^\d+$/, 'task_id phải là số'),
  z.number().int().positive('task_id phải là số dương')
]);

/**
 * ✅ SECURITY: Course schema for download requests
 */
const courseSchema = z.object({
  url: udemyUrlSchema,
  title: z.string().max(500, 'Tiêu đề quá dài').optional().nullable(),
  price: z.number().nonnegative('Giá không được âm').optional()
});

/**
 * ✅ SECURITY: Download request validation schema
 */
const downloadRequestSchema = z.object({
  body: z.object({
    order_id: orderIdSchema,
    email: emailSchema,
    urls: z.array(udemyUrlSchema).optional(),
    courses: z.array(courseSchema).optional(),
    phone_number: z.string().max(20, 'Số điện thoại quá dài').optional().nullable()
  }).refine(
    (data) => (data.urls && data.urls.length > 0) || (data.courses && data.courses.length > 0),
    { message: 'Phải có ít nhất một URL hoặc course', path: ['urls'] }
  ),
  headers: z.object({
    'x-signature': z.string().min(1, 'Thiếu chữ ký'),
    'x-timestamp': z.string().min(1, 'Thiếu timestamp')
  })
});

/**
 * Validates email format (backward compatibility)
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validates order creation request
 */
const validateCreateOrder = (req, res, next) => {
  try {
    const { email, courses } = req.body;

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ'
      });
    }

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách khóa học không hợp lệ'
      });
    }

    // Validate each course
    for (const course of courses) {
      if (!course.url || typeof course.url !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'URL khóa học không hợp lệ'
        });
      }

      if (course.price !== undefined && (typeof course.price !== 'number' || course.price < 0)) {
        return res.status(400).json({
          success: false,
          message: 'Giá khóa học không hợp lệ'
        });
      }
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * Validates webhook request
 * Supports both old format (transferContent, transferAmount) and new SePay format
 */
const validateWebhook = (req, res, next) => {
  try {
    // New SePay format: code/content and transferAmount
    // Old format: transferContent and transferAmount
    const { code, content, transferContent, transferAmount } = req.body;

    // Check if it's new format (has code or content) or old format (has transferContent)
    const hasNewFormat = (code && typeof code === 'string') || (content && typeof content === 'string');
    const hasOldFormat = transferContent && typeof transferContent === 'string';

    // Must have either new format fields or old format fields
    if (!hasNewFormat && !hasOldFormat) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin chuyển khoản (code/content hoặc transferContent)'
      });
    }

    // Validate transferAmount
    if (!transferAmount || isNaN(parseFloat(transferAmount)) || parseFloat(transferAmount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền không hợp lệ'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * ✅ SECURITY: Validates download request using Zod
 * Prevents command injection by strictly validating URLs
 */
const validateDownload = (req, res, next) => {
  try {
    // Validate request using Zod schema
    const result = downloadRequestSchema.safeParse({
      body: req.body,
      headers: {
        'x-signature': req.headers['x-signature'],
        'x-timestamp': req.headers['x-timestamp']
      }
    });

    if (!result.success) {
      // Format Zod errors for user-friendly messages
      const firstError = result.error.errors[0];
      return res.status(400).json({
        success: false,
        message: firstError.message || 'Dữ liệu không hợp lệ',
        errors: result.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      });
    }

    // ✅ SECURITY: Sanitize and normalize validated data
    const validatedData = result.data.body;
    
    // Normalize email to lowercase
    req.body.email = validatedData.email;
    
    // Normalize URLs - ensure all are valid Udemy URLs
    if (validatedData.urls) {
      req.body.urls = validatedData.urls;
    }
    if (validatedData.courses) {
      req.body.courses = validatedData.courses.map(course => ({
        url: course.url,
        title: course.title || null,
        price: course.price !== undefined ? course.price : 0
      }));
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * ✅ SECURITY: Validates enroll request using Zod
 */
const validateEnroll = (req, res, next) => {
  try {
    const enrollSchema = z.object({
      urls: z.array(udemyUrlSchema).min(1, 'Phải có ít nhất một URL')
    });

    const result = enrollSchema.safeParse(req.body);

    if (!result.success) {
      const firstError = result.error.errors[0];
      return res.status(400).json({
        success: false,
        message: firstError.message || 'Dữ liệu không hợp lệ'
      });
    }

    // ✅ SECURITY: Sanitize URLs
    req.body.urls = result.data.urls;

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * Validates grant access request
 */
const validateGrantAccess = (req, res, next) => {
  try {
    const { order_id, email, courses } = req.body;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu order_id'
      });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ'
      });
    }

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách khóa học không hợp lệ'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * ✅ SECURITY: Validates webhook finalize request using Zod
 */
const validateWebhookFinalize = (req, res, next) => {
  try {
    const webhookFinalizeSchema = z.object({
      secret_key: z.string().min(1, 'Thiếu secret_key').max(500, 'secret_key quá dài'),
      task_id: taskIdSchema,
      folder_name: z.string()
        .min(1, 'Tên folder không được rỗng')
        .max(500, 'Tên folder quá dài')
        .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Tên folder chỉ được chứa chữ cái, số, dấu gạch dưới, dấu gạch ngang và dấu chấm')
    });

    const result = webhookFinalizeSchema.safeParse(req.body);

    if (!result.success) {
      const firstError = result.error.errors[0];
      return res.status(400).json({
        success: false,
        message: firstError.message || 'Dữ liệu không hợp lệ'
      });
    }

    // ✅ SECURITY: Sanitize folder_name to prevent path traversal
    req.body.folder_name = result.data.folder_name.replace(/\.\./g, '').replace(/\//g, '_');

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

module.exports = {
  validateCreateOrder,
  validateWebhook,
  validateDownload,
  validateEnroll,
  validateGrantAccess,
  validateWebhookFinalize
};
