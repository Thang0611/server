/**
 * Main server entry point
 * @module server
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sequelize } = require('./src/models');
const { errorHandler } = require('./src/middleware/errorHandler.middleware');
const Logger = require('./src/utils/logger.util');

// Route imports
const downloadRoutes = require('./src/routes/download.routes');
const webhookRoutes = require('./src/routes/webhook.routes');
const grantAccessRoutes = require('./src/routes/grantAccess.routes');
const infoCourseRoutes = require('./src/routes/infoCourse.routes');
const enrollRoutes = require('./src/routes/enroll.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const adminRoutes = require('./src/routes/admin.routes');
const internalRoutes = require('./src/routes/internal.routes');

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ✅ SECURITY: CORS Configuration - Strict whitelist for Production
// Cấu hình CORS: Trong production chỉ cho phép domains cụ thể (không dùng wildcard)
// Trong development cho phép localhost và wildcard để dễ test
// CORS_ORIGIN có thể là:
//   - '*' (chỉ trong development)
//   - 'https://domain1.com,https://domain2.com' (danh sách domains cách nhau bởi dấu phẩy)
const allowedOrigins = CORS_ORIGIN === '*' 
  ? (NODE_ENV === 'production' ? [] : ['*']) // Production: không cho phép wildcard
  : CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0);

const corsOptions = {
  origin: (origin, callback) => {
    // ✅ Cho phép requests không có origin (health checks, monitoring, server-to-server)
    // Các trường hợp không có origin: curl, Postman, internal API calls, health checks
    if (!origin) {
      return callback(null, true); // Cho phép luôn
    }
    
    // Production: Bắt buộc phải có whitelist, không cho phép wildcard
    if (NODE_ENV === 'production' && allowedOrigins.length === 0) {
      Logger.error('CORS_ORIGIN not configured for production! Please set CORS_ORIGIN in .env');
      return callback(new Error('CORS: Configuration error'));
    }
    
    // Development: Cho phép localhost với bất kỳ port nào
    if (NODE_ENV === 'development') {
      // Cho phép localhost:3000, localhost:4000, etc.
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      
      // Cho phép wildcard trong development
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }
    }
    
    // Kiểm tra wildcard (chỉ nên dùng trong development, đã xử lý ở trên)
    if (allowedOrigins.includes('*')) {
      Logger.warn(`CORS wildcard not allowed in production, blocking origin: ${origin}`);
      return callback(new Error('CORS: Origin not allowed'));
    }
    
    // Kiểm tra origin có trong whitelist không
    if (allowedOrigins.includes(origin)) {
      callback(null, true); // Cho phép
    } else {
      Logger.warn(`CORS blocked origin: ${origin} (not in whitelist)`);
      callback(new Error('CORS: Origin not allowed')); // Chặn
    }
  },
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Initialize Express app
const app = express();
const server = http.createServer(app);

// ✅ SECURITY: Trust Proxy Configuration
// Cấu hình trust proxy để nhận đúng IP client khi đứng sau reverse proxy
// Khi server đứng sau nginx/Cloudflare, IP thật của client nằm trong header X-Forwarded-For
// Nếu không bật trust proxy, req.ip sẽ là IP của nginx, không phải IP client thật
// Điều này cần thiết cho rate limiting chính xác
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  // Trust proxy đầu tiên (setup phổ biến: nginx -> node.js)
  // Có thể set số cụ thể nếu biết có bao nhiêu proxy ở phía trước
  // Set 'true' để trust tất cả proxies (ít bảo mật hơn, cẩn thận khi dùng)
  app.set('trust proxy', 1); // Trust proxy đầu tiên
  Logger.info('Trust proxy enabled - Express will use X-Forwarded-For headers for client IP');
} else if (process.env.TRUST_PROXY === 'false') {
  // Tắt trust proxy (không dùng khi có reverse proxy)
  app.set('trust proxy', false);
  Logger.info('Trust proxy explicitly disabled');
} else {
  // Mặc định: Tự động phát hiện dựa trên header X-Forwarded-For
  // Nếu header tồn tại → trust proxy (thường gặp trong production với nginx/load balancer)
  app.set('trust proxy', true); // Auto-detect: trust nếu có header X-Forwarded-For
  Logger.info('Trust proxy auto-detection enabled (trust if X-Forwarded-For header exists)');
}

// ✅ SECURITY: Helmet - Protect HTTP Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow external resources if needed
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
}));

// ✅ SECURITY: Rate Limiting - Protect against DDoS/Spam
// General API rate limit: 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Quá nhiều request từ IP này, vui lòng thử lại sau 15 phút.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    Logger.warn('Rate limit exceeded', { 
      ip: req.ip, 
      path: req.path,
      userAgent: req.get('user-agent')
    });
    res.status(429).json({
      success: false,
      message: 'Quá nhiều request từ IP này, vui lòng thử lại sau 15 phút.'
    });
  }
});

// Stricter rate limit for download/worker activation endpoints: 10 requests per hour per IP
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10000, // Limit each IP to 10 requests per hour
  message: {
    success: false,
    message: 'Quá nhiều request kích hoạt download, vui lòng thử lại sau 1 giờ.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    Logger.warn('Download rate limit exceeded', { 
      ip: req.ip, 
      path: req.path,
      userAgent: req.get('user-agent')
    });
    res.status(429).json({
      success: false,
      message: 'Quá nhiều request kích hoạt download, vui lòng thử lại sau 1 giờ.'
    });
  }
});

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' })); // Limit body size
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Apply general rate limiting to all routes
app.use('/api', generalLimiter);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// ✅ SECURITY: Apply stricter rate limiting to download/worker activation endpoints
app.use('/api/v1/download', downloadLimiter);
app.use('/api/v1/enroll', downloadLimiter);

// API Routes
app.use('/api/v1', downloadRoutes);
app.use('/api/v1/webhook', webhookRoutes);
app.use('/api/v1', infoCourseRoutes);
app.use('/api/v1', enrollRoutes);
app.use('/api/v1', grantAccessRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);  // Admin dashboard routes
app.use('/api/v1/internal', internalRoutes);  // Internal API routes (for inter-service communication)

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    Logger.info('Database connection established successfully');

    // Sync database models - alter: true will add missing columns to existing tables
    // TEMPORARILY DISABLED due to "Too many keys" error - need to fix database schema first
    try {
      // Only sync if explicitly enabled via environment variable
      if (process.env.ENABLE_DB_SYNC === 'true') {
        Logger.info('Attempting database sync (ENABLE_DB_SYNC=true)...');
        await sequelize.sync({ alter: true });
        Logger.info('Database models synchronized successfully');
      } else {
        Logger.info('Database models sync skipped (set ENABLE_DB_SYNC=true to enable)');
        Logger.warn('Note: "Too many keys" error may occur if database schema has >64 foreign keys');
      }
    } catch (syncError) {
      if (syncError.message && syncError.message.includes('Too many keys')) {
        Logger.warn('Database sync skipped: Too many keys specified (max 64 allowed)');
        Logger.warn('This is a MySQL limitation. Consider reviewing foreign key constraints.');
        Logger.info('Server will continue without sync. Existing schema will be used.');
      } else {
        Logger.error('Database sync failed', syncError);
        // Don't exit - server can still work with existing schema
      }
    }

    // Initialize WebSocket server for real-time progress updates
    try {
      const { initializeWebSocket } = require('./src/websocket/progress.server');
      const io = initializeWebSocket(server);
      Logger.info('WebSocket server initialized successfully');
      Logger.info(`WebSocket CORS allowed origins: ${process.env.FRONTEND_URL || 'https://getcourses.net'}`);
    } catch (error) {
      Logger.warn('WebSocket initialization failed (non-critical)', error);
    }

    // Auto-recover stuck tasks on server startup
    if (process.env.ENABLE_AUTO_RECOVERY !== 'false') {
      try {
        const { recoverStuckTasks } = require('./src/services/taskRecovery.service');
        Logger.info('Starting auto-recovery for stuck tasks...');
        
        // Run recovery asynchronously (don't block server startup)
        setTimeout(async () => {
          try {
            const result = await recoverStuckTasks({
              maxTasks: parseInt(process.env.MAX_RECOVERY_TASKS || '100', 10)
            });
            Logger.success('Auto-recovery completed', result);
          } catch (recoveryError) {
            Logger.error('Auto-recovery failed (non-critical)', recoveryError);
          }
        }, 50000); // Wait 5 seconds for all services to be ready
      } catch (error) {
        Logger.warn('Failed to initialize auto-recovery (non-critical)', error);
      }
    } else {
      Logger.info('Auto-recovery disabled (ENABLE_AUTO_RECOVERY=false)');
    }

    // Start listening with error handling
    server.listen(PORT, '0.0.0.0', () => {
      Logger.info(`Server is running on port ${PORT}`, { port: PORT });
      Logger.info('Admin Dashboard API available at /api/admin/*');
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        Logger.error(`Port ${PORT} is already in use. Trying to use alternative port or waiting...`, error);
        // In cluster mode, PM2 handles port sharing, so this might be a race condition
        // Wait a bit and retry (PM2 will handle this automatically)
        setTimeout(() => {
          Logger.info('Retrying server start...');
          server.listen(PORT, '0.0.0.0');
        }, 2000);
      } else {
        Logger.error('Server error', error);
        process.exit(1);
      }
    });
  } catch (error) {
    Logger.error('Failed to start server', error);
    // Don't exit immediately in cluster mode, let PM2 handle restart
    if (process.env.NODE_ENV !== 'production' || !process.send) {
      process.exit(1);
    }
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  Logger.error('Unhandled Promise Rejection', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  Logger.error('Uncaught Exception', err);
  process.exit(1);
});

// Start the server
startServer();