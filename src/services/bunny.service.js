/**
 * Bunny CDN Pull Zone Service
 * Generates signed URLs for video streaming from VPS via Bunny CDN
 * @module services/bunny
 */

const crypto = require('crypto');
const path = require('path');
const Logger = require('../utils/logger.util');

// Bunny CDN Configuration (Pull Zone)
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL; // e.g., https://getcourses.b-cdn.net
const BUNNY_TOKEN_KEY = process.env.BUNNY_TOKEN_KEY; // Token authentication key

/**
 * Check if Bunny CDN is configured
 * @returns {boolean}
 */
const isConfigured = () => {
    return !!(BUNNY_PULL_ZONE_URL);
};

/**
 * Normalize path for URL (ensure no double slashes, proper encoding)
 * @param {string} filePath - File path relative to storage
 * @returns {string} Normalized URL path
 */
const normalizePath = (filePath) => {
    // Remove leading slash if present
    let normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    // Replace backslashes with forward slashes
    normalized = normalized.replace(/\\/g, '/');
    // URL encode the path components (but not slashes)
    normalized = normalized.split('/').map(encodeURIComponent).join('/');
    return normalized;
};

/**
 * Generate signed URL for video streaming via Bunny Pull Zone
 * @param {string} videoPath - Path to video relative to storage root
 * @param {number} expiresInSeconds - URL expiration (default 2 hours)
 * @returns {string} Signed streaming URL
 */
const generateSignedUrl = (videoPath, expiresInSeconds = 7200) => {
    if (!BUNNY_PULL_ZONE_URL) {
        throw new Error('Bunny Pull Zone URL is not configured');
    }

    const normalizedPath = normalizePath(videoPath);
    const fullPath = `/${normalizedPath}`;

    // If no token key, return unsigned URL
    if (!BUNNY_TOKEN_KEY) {
        return `${BUNNY_PULL_ZONE_URL}${fullPath}`;
    }

    const expirationTime = Math.floor(Date.now() / 1000) + expiresInSeconds;

    // Bunny CDN token format: base64(md5(security_key + path + expiration))
    const hashableBase = `${BUNNY_TOKEN_KEY}${fullPath}${expirationTime}`;
    const token = crypto
        .createHash('md5')
        .update(hashableBase)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    const signedUrl = `${BUNNY_PULL_ZONE_URL}${fullPath}?token=${token}&expires=${expirationTime}`;

    return signedUrl;
};

/**
 * Generate signed URL for a course video
 * @param {string} courseSlug - Course slug
 * @param {string} relativePath - Video path relative to course folder
 * @param {string} courseType - 'permanent' or 'temporary'
 * @param {number} expiresInSeconds - URL expiration
 * @returns {string} Signed streaming URL
 */
const generateCourseVideoUrl = (courseSlug, relativePath, courseType = 'permanent', expiresInSeconds = 7200) => {
    const videoPath = path.join(courseType, courseSlug, relativePath);
    return generateSignedUrl(videoPath, expiresInSeconds);
};

/**
 * Generate multiple signed URLs for course lectures
 * @param {string} courseSlug - Course slug
 * @param {Array} lectures - Array of lecture objects with relativePath
 * @param {string} courseType - Course type
 * @param {number} expiresInSeconds - URL expiration
 * @returns {Array} Lectures with signed URLs
 */
const generateLectureUrls = (courseSlug, lectures, courseType = 'permanent', expiresInSeconds = 7200) => {
    return lectures.map(lecture => ({
        ...lecture,
        streamUrl: generateCourseVideoUrl(courseSlug, lecture.relativePath, courseType, expiresInSeconds)
    }));
};

/**
 * Validate that a video exists on CDN (basic check)
 * @param {string} videoPath - Video path
 * @returns {Promise<boolean>}
 */
const validateVideoExists = async (videoPath) => {
    if (!BUNNY_PULL_ZONE_URL) return false;

    try {
        const url = generateSignedUrl(videoPath, 60); // Short expiry for check
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        Logger.warn('[Bunny] Video validation failed', { videoPath, error: error.message });
        return false;
    }
};

/**
 * Get pull zone URL (for debugging/info)
 * @returns {string}
 */
const getPullZoneUrl = () => {
    return BUNNY_PULL_ZONE_URL || 'Not configured';
};

/**
 * Check if token authentication is enabled
 * @returns {boolean}
 */
const isTokenAuthEnabled = () => {
    return !!BUNNY_TOKEN_KEY;
};

module.exports = {
    isConfigured,
    generateSignedUrl,
    generateCourseVideoUrl,
    generateLectureUrls,
    validateVideoExists,
    getPullZoneUrl,
    isTokenAuthEnabled
};
