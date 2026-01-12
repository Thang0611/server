
/**
 * Hash utility for signature verification
 * @module utils/hash
 */

const crypto = require('crypto');
const Logger = require('./logger.util');

/**
 * Gets the secret key from environment variables
 * @returns {string} - Secret key
 * @throws {Error} - If secret key is not configured
 */
const getSecretKey = () => {
  const secretKey = process.env.SECRET_KEY;
  if (!secretKey) {
    Logger.error('SECRET_KEY not configured in environment variables');
    throw new Error('SECRET_KEY not configured');
  }
  return secretKey;
};

/**
 * Verifies request signature using HMAC SHA256
 * Logic: HMAC_SHA256(order_id + email + timestamp)
 * @param {string|number} orderId - Order ID
 * @param {string} email - Customer email
 * @param {string|number} timestamp - Request timestamp (Unix timestamp)
 * @param {string} clientSignature - Signature received from header (X-Signature)
 * @returns {boolean} - True if valid, False if invalid
 */
const verifyRequestSignature = (orderId, email, timestamp, clientSignature) => {
  try {
    // Validate input
    if (!clientSignature || !orderId || !email || !timestamp) {
      return false;
    }

    const SECRET_KEY = getSecretKey();

    // Create payload string (must match PHP concatenation logic)
    // Important: Must use String() for each variable to match PHP string concatenation
    const payload = String(orderId) + String(email) + String(timestamp);

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const bufferExpected = Buffer.from(expectedSignature);
    const bufferClient = Buffer.from(clientSignature);

    // If lengths differ, return false immediately
    if (bufferExpected.length !== bufferClient.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferExpected, bufferClient);
  } catch (error) {
    Logger.error('Error verifying signature', error, {
      orderId,
      email,
      hasTimestamp: !!timestamp,
      hasSignature: !!clientSignature
    });
    return false;
  }
};

module.exports = {
  verifyRequestSignature
};