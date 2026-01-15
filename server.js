/**
 * Main server entry point
 * @module server
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const cors = require('cors');
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
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// CORS Configuration for Production
const allowedOrigins = CORS_ORIGIN === '*' 
  ? '*' 
  : CORS_ORIGIN.split(',').map(origin => origin.trim());

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all origins if CORS_ORIGIN is '*'
    if (allowedOrigins === '*') return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      Logger.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Still allow but log warning
    }
  },
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
};

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

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
      Logger.info(`WebSocket CORS allowed origins: ${process.env.FRONTEND_URL || 'https://khoahocgiare.info'}`);
    } catch (error) {
      Logger.warn('WebSocket initialization failed (non-critical)', error);
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