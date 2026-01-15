/**
 * WebSocket Debug Script
 * Logs all socket events for debugging
 */

const Logger = require('../utils/logger.util');

/**
 * Add debug logging to Socket.IO server
 * @param {Object} io - Socket.IO server instance
 */
function enableWebSocketDebugging(io) {
  if (!io) {
    Logger.warn('[WebSocket Debug] IO not initialized');
    return;
  }

  // Log all connections
  io.on('connection', (socket) => {
    Logger.info('[WebSocket Debug] ========================================');
    Logger.info('[WebSocket Debug] NEW CLIENT CONNECTED', {
      socketId: socket.id,
      transport: socket.conn.transport.name,
      address: socket.handshake.address,
      headers: socket.handshake.headers,
      query: socket.handshake.query,
      auth: socket.handshake.auth
    });

    // Log ALL events received from client
    const originalOnevent = socket.onevent;
    socket.onevent = function(packet) {
      const args = packet.data || [];
      Logger.info('[WebSocket Debug] CLIENT EVENT RECEIVED', {
        socketId: socket.id,
        event: args[0],
        data: args[1] || {},
        timestamp: new Date().toISOString()
      });
      originalOnevent.call(this, packet);
    };

    // Log all emits to client
    const originalEmit = socket.emit;
    socket.emit = function(event, ...args) {
      Logger.info('[WebSocket Debug] EMITTING TO CLIENT', {
        socketId: socket.id,
        event,
        data: args[0] || {},
        timestamp: new Date().toISOString()
      });
      return originalEmit.apply(this, [event, ...args]);
    };

    // Log room joins/leaves
    const originalJoin = socket.join;
    socket.join = function(rooms) {
      Logger.info('[WebSocket Debug] CLIENT JOINED ROOM', {
        socketId: socket.id,
        rooms: Array.isArray(rooms) ? rooms : [rooms],
        timestamp: new Date().toISOString()
      });
      return originalJoin.apply(this, [rooms]);
    };

    const originalLeave = socket.leave;
    socket.leave = function(rooms) {
      Logger.info('[WebSocket Debug] CLIENT LEFT ROOM', {
        socketId: socket.id,
        rooms: Array.isArray(rooms) ? rooms : [rooms],
        timestamp: new Date().toISOString()
      });
      return originalLeave.apply(this, [rooms]);
    };

    // Log disconnections
    socket.on('disconnect', (reason) => {
      Logger.info('[WebSocket Debug] CLIENT DISCONNECTED', {
        socketId: socket.id,
        reason,
        timestamp: new Date().toISOString()
      });
    });
  });

  // Log all room broadcasts
  const originalTo = io.to.bind(io);
  io.to = function(room) {
    const result = originalTo(room);
    const originalEmit = result.emit.bind(result);
    result.emit = function(event, data) {
      Logger.info('[WebSocket Debug] BROADCASTING TO ROOM', {
        room,
        event,
        dataPreview: typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : data,
        timestamp: new Date().toISOString()
      });
      return originalEmit(event, data);
    };
    return result;
  };

  Logger.info('[WebSocket Debug] Debug logging enabled');
}

module.exports = { enableWebSocketDebugging };
