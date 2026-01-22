/**
 * WebSocket Server for Real-time Progress Updates
 * Bridges Redis Pub/Sub to WebSocket clients
 * @module websocket/progress
 */

const { Server } = require('socket.io');
const progressService = require('../services/progress.service');
const Logger = require('../utils/logger.util');
const { enableWebSocketDebugging } = require('./debug.server');

let io = null;

/**
 * Initialize WebSocket server
 * @param {Object} httpServer - HTTP server instance
 * @returns {Object} - Socket.IO instance
 */
const initializeWebSocket = (httpServer) => {
  // Get allowed origins from environment
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://getcourses.net',
    'http://getcourses.net',
    'https://www.getcourses.net',
    'http://www.getcourses.net'
  ].filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: process.env.WEBSOCKET_PATH || '/socket.io'
  });

  // Enable debug logging in development
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_WS_DEBUG === 'true') {
    enableWebSocketDebugging(io);
  }

  // Authentication middleware (optional - add JWT verification here)
  io.use((socket, next) => {
    // TODO: Add authentication logic
    // const token = socket.handshake.auth.token;
    // if (!token) {
    //   return next(new Error('Authentication error'));
    // }
    
    // For now, allow all connections
    next();
  });

  // Connection handler
  io.on('connection', (socket) => {
    Logger.info('[WebSocket] Client connected', {
      socketId: socket.id,
      ip: socket.handshake.address
    });

    // Send connection confirmation
    socket.emit('connected', {
      socketId: socket.id,
      message: 'Connected to WebSocket server'
    });

    /**
     * Subscribe to order progress
     * Client sends: { orderId: 123 } OR { orderId: 123 } (both formats supported)
     */
    socket.on('subscribe:order', (data) => {
      const orderId = data?.orderId || data?.order_id;
      
      if (!orderId) {
        Logger.warn('[WebSocket] subscribe:order called without orderId', { data, socketId: socket.id });
        socket.emit('error', { message: 'Order ID is required', received: data });
        return;
      }

      const room = `order:${orderId}`;
      socket.join(room);
      
      Logger.info('[WebSocket] Client subscribed to order', {
        socketId: socket.id,
        orderId,
        room,
        data
      });

      socket.emit('subscribed', {
        type: 'order',
        orderId,
        message: `Subscribed to order ${orderId}`
      });
    });

    /**
     * Subscribe to task progress
     * Client sends: { taskId: 456 } OR { task_id: 456 } (both formats supported)
     */
    socket.on('subscribe:task', (data) => {
      const taskId = data?.taskId || data?.task_id;
      
      if (!taskId) {
        Logger.warn('[WebSocket] subscribe:task called without taskId', { data, socketId: socket.id });
        socket.emit('error', { message: 'Task ID is required', received: data });
        return;
      }

      const room = `task:${taskId}`;
      socket.join(room);
      
      Logger.info('[WebSocket] Client subscribed to task', {
        socketId: socket.id,
        taskId,
        room,
        data
      });

      socket.emit('subscribed', {
        type: 'task',
        taskId,
        message: `Subscribed to task ${taskId}`
      });
    });

    /**
     * Unsubscribe from order
     */
    socket.on('unsubscribe:order', (data) => {
      const orderId = data?.orderId || data?.order_id;
      
      if (!orderId) {
        Logger.warn('[WebSocket] unsubscribe:order called without orderId', { data, socketId: socket.id });
        return;
      }
      
      const room = `order:${orderId}`;
      socket.leave(room);
      
      Logger.debug('[WebSocket] Client unsubscribed from order', {
        socketId: socket.id,
        orderId,
        room
      });
    });

    /**
     * Unsubscribe from task
     */
    socket.on('unsubscribe:task', (data) => {
      const taskId = data?.taskId || data?.task_id;
      
      if (!taskId) {
        Logger.warn('[WebSocket] unsubscribe:task called without taskId', { data, socketId: socket.id });
        return;
      }
      
      const room = `task:${taskId}`;
      socket.leave(room);
      
      Logger.debug('[WebSocket] Client unsubscribed from task', {
        socketId: socket.id,
        taskId,
        room
      });
    });

    /**
     * Client disconnect
     */
    socket.on('disconnect', (reason) => {
      Logger.info('[WebSocket] Client disconnected', {
        socketId: socket.id,
        reason
      });
    });
  });

  // Subscribe to Redis progress channels and broadcast to WebSocket clients
  setupRedisToWebSocketBridge();

  Logger.success('[WebSocket] Server initialized');
  
  return io;
};

/**
 * Bridge Redis Pub/Sub to WebSocket
 * Listens to Redis channels and broadcasts to appropriate Socket.IO rooms
 */
const setupRedisToWebSocketBridge = async () => {
  try {
    // Subscribe to all progress, status, and completion channels
    await progressService.subscribeToProgress(
      [
        'task:*:progress',
        'task:*:status',
        'order:*:progress',
        'order:*:status',
        'order:*:complete'
      ],
      (channel, data) => {
        // Parse channel name to determine routing
        // Format: task:123:progress or order:456:status
        const parts = channel.split(':');
        if (parts.length < 3) {
          Logger.warn('[WebSocket] Invalid channel format', { channel, parts });
          return;
        }
        
        const [scope, id, type] = parts;
        
        if (!io) {
          Logger.warn('[WebSocket] IO not initialized, cannot broadcast', { channel });
          return;
        }

        // Route message to appropriate room
        const room = `${scope}:${id}`;
        const eventPayload = {
          scope,
          id: parseInt(id),
          type,
          data,
          timestamp: Date.now()
        };
        
        Logger.debug('[WebSocket] Processing Redis message', {
          channel,
          room,
          type,
          scope,
          id,
          dataKeys: Object.keys(data || {})
        });
        
        // Get room info for logging
        io.in(room).fetchSockets().then(sockets => {
          const clientCount = sockets.length;
          
          // Emit to room with channel type
          io.to(room).emit(type, eventPayload);

          // Log all broadcasts (can be filtered later)
          if (clientCount > 0) {
            Logger.info('[WebSocket] ✅ Broadcasted to room', {
              channel,
              room,
              type,
              clientCount,
              socketIds: sockets.map(s => s.id),
              dataPreview: type === 'progress' 
                ? `${data.percent || data.percent || 0}% - ${data.currentFile || 'N/A'}` 
                : JSON.stringify(data).substring(0, 100)
            });
          } else {
            Logger.warn('[WebSocket] ⚠️ No clients in room - message not delivered', { 
              room, 
              channel, 
              type,
              scope,
              id,
              dataPreview: JSON.stringify(data).substring(0, 100)
            });
          }
        }).catch(err => {
          Logger.error('[WebSocket] Error fetching room sockets', err, { room, channel, type });
        });
      }
    );

    Logger.success('[WebSocket] Redis-to-WebSocket bridge established');
  } catch (error) {
    Logger.error('[WebSocket] Failed to setup Redis bridge', error);
    throw error;
  }
};

/**
 * Broadcast message to specific order room
 * @param {number} orderId - Order ID
 * @param {string} event - Event name
 * @param {Object} data - Data to send
 */
const broadcastToOrder = (orderId, event, data) => {
  if (!io) {
    Logger.warn('[WebSocket] IO not initialized');
    return;
  }

  const room = `order:${orderId}`;
  io.to(room).emit(event, data);
  
  Logger.debug('[WebSocket] Broadcasted to order', {
    orderId,
    event,
    room
  });
};

/**
 * Broadcast message to specific task room
 * @param {number} taskId - Task ID
 * @param {string} event - Event name
 * @param {Object} data - Data to send
 */
const broadcastToTask = (taskId, event, data) => {
  if (!io) {
    Logger.warn('[WebSocket] IO not initialized');
    return;
  }

  const room = `task:${taskId}`;
  io.to(room).emit(event, data);
  
  Logger.debug('[WebSocket] Broadcasted to task', {
    taskId,
    event,
    room
  });
};

/**
 * Get connected clients count
 * @returns {number} - Number of connected clients
 */
const getConnectedClientsCount = () => {
  if (!io) return 0;
  return io.engine.clientsCount;
};

/**
 * Get room information
 * @param {string} room - Room name
 * @returns {Object} - Room info
 */
const getRoomInfo = async (room) => {
  if (!io) return { clientCount: 0 };
  
  const sockets = await io.in(room).fetchSockets();
  return {
    clientCount: sockets.length,
    socketIds: sockets.map(s => s.id)
  };
};

module.exports = {
  initializeWebSocket,
  broadcastToOrder,
  broadcastToTask,
  getConnectedClientsCount,
  getRoomInfo
};
