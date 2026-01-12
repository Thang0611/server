/**
 * Main server entry point
 * @module server
 */

require('dotenv').config();
const express = require('express');
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

// Configuration
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const corsOptions = {
  origin: "*",
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
};

// Initialize Express app
const app = express();

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

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    Logger.info('Database connection established successfully');

    // Sync database models - alter: true will add missing columns to existing tables
    await sequelize.sync({ alter: true });
    Logger.info('Database models synchronized');

    // Start listening
    app.listen(PORT, '0.0.0.0', () => {
      Logger.info(`Server is running on port ${PORT}`, { port: PORT });
    });
  } catch (error) {
    Logger.error('Failed to start server', error);
    process.exit(1);
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