/**
 * Logger usage examples
 * This file demonstrates the new colored logging format
 */

const Logger = require('./logger.util');

// Example 1: Info log (GREEN)
Logger.info('Download tasks created', { taskId: 123, email: 'user@example.com', count: 5 });

// Example 2: Success log (GREEN with checkmark)
Logger.success('Order created successfully', { orderCode: 'DH000123', amount: 5000 });

// Example 3: Warning log (YELLOW)
Logger.warn('Order not found in database', { orderId: 456, orderCode: 'DH000456' });

// Example 4: Error log (RED)
Logger.error('Failed to create download tasks', new Error('Database connection failed'), {
  orderId: 789,
  email: 'user@example.com'
});

// Example 5: Debug log (CYAN) - only in development
Logger.debug('Processing enrollment task', { taskId: 10, url: 'https://udemy.com/course/example/' });

// Example output:
// [INFO]  13:45:30 Download tasks created [taskId=123, email=user@example.com, count=5]
// ✓ [SUCCESS] 13:45:31 Order created successfully [orderCode=DH000123, amount=5000]
// [WARN]  13:45:32 Order not found in database [orderId=456, orderCode=DH000456]
// [ERROR] 13:45:33 Failed to create download tasks: Database connection failed [orderId=789, email=user@example.com]
// [DEBUG] 13:45:34 Processing enrollment task [taskId=10, url=https://udemy.com/course/example/]
