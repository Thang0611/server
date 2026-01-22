/**
 * Authentication Middleware for Express Server
 * Verifies JWT tokens from Next.js Gateway
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const Logger = require('../utils/logger.util');
const { AppError } = require('./errorHandler.middleware');

/**
 * Verify JWT token from Authorization header
 * Token is created by NextAuth.js and shared via NEXTAUTH_SECRET
 */
const verifyToken = (req, res, next) => {
  try {
    // Log incoming request for debugging
    Logger.info('[Auth] Incoming request', {
      method: req.method,
      path: req.path,
      hasAuthHeader: !!req.headers.authorization
    });

    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. No authorization token provided.',
      });
    }

    // Extract token from "Bearer <token>" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. Invalid token format. Expected: Bearer <token>',
      });
    }

    const token = parts[1];

    // Verify token using shared NEXTAUTH_SECRET
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      Logger.error('NEXTAUTH_SECRET is not set in environment variables');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error. Please contact administrator.',
      });
    }

    // Verify and decode token
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized. Token has expired.',
        });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized. Invalid token.',
        });
      }
      throw jwtError;
    }

    // Attach user info to request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    // Log authenticated request (optional, for debugging)
    Logger.info(`[Auth] Authenticated request from user: ${req.user.email} (${req.user.role})`, {
      method: req.method,
      path: req.path
    });

    next();
  } catch (error) {
    Logger.error('Token verification error', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during authentication.',
    });
  }
};

/**
 * Verify admin role
 * Must be used after verifyToken middleware
 */
const verifyAdmin = (req, res, next) => {
  Logger.info('[Auth] Verifying admin access', {
    method: req.method,
    path: req.path,
    hasUser: !!req.user,
    userRole: req.user?.role
  });

  if (!req.user) {
    Logger.warn('[Auth] Admin verification failed: No user in request', {
      method: req.method,
      path: req.path
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Please authenticate first.',
    });
  }

  if (req.user.role !== 'admin') {
    Logger.warn(`[Auth] Unauthorized access attempt by user: ${req.user.email} (${req.user.role})`, {
      method: req.method,
      path: req.path
    });
    return res.status(403).json({
      success: false,
      error: 'Forbidden. Admin access required.',
    });
  }

  Logger.info('[Auth] Admin access granted', {
    method: req.method,
    path: req.path,
    userEmail: req.user.email
  });

  next();
};

/**
 * Optional: Verify user role (for future user authentication)
 * Must be used after verifyToken middleware
 */
const verifyUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Please authenticate first.',
    });
  }

  // Allow both admin and user roles
  if (req.user.role !== 'admin' && req.user.role !== 'user') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden. Invalid user role.',
    });
  }

  next();
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyUser,
};
