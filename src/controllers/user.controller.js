/**
 * User controller for handling user-related HTTP requests
 * @module controllers/user
 */

const { User, UserEnrollment, Course, Order } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { AppError } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');

/**
 * Get or create user by email/Google ID
 * Called after successful Google OAuth login from frontend
 * @param {Object} req - Express request object with body: { email, google_id, name, avatar_url }
 * @param {Object} res - Express response object
 */
const syncUser = asyncHandler(async (req, res) => {
    const { email, google_id, name, avatar_url } = req.body;

    if (!email) {
        throw new AppError('Email is required', 400);
    }

    Logger.info('Syncing user from OAuth', { email, google_id: google_id ? 'present' : 'missing' });

    // Find or create user
    let user = await User.findOne({
        where: google_id ? { google_id } : { email }
    });

    if (user) {
        // Update existing user
        await user.update({
            name: name || user.name,
            avatar_url: avatar_url || user.avatar_url,
            google_id: google_id || user.google_id
        });
        Logger.info('Updated existing user', { userId: user.id, email: user.email });
    } else {
        // Create new user
        user = await User.create({
            email,
            google_id,
            name,
            avatar_url
        });
        Logger.success('Created new user', { userId: user.id, email });
    }

    res.json({
        success: true,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar_url,
            is_premium: user.is_premium,
            premium_expires_at: user.premium_expires_at
        }
    });
});

/**
 * Get current user profile
 * @param {Object} req - Express request object with userId from auth
 * @param {Object} res - Express response object
 */
const getProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
        attributes: ['id', 'email', 'name', 'avatar_url', 'is_premium', 'premium_expires_at', 'created_at']
    });

    if (!user) {
        throw new AppError('User not found', 404);
    }

    res.json({
        success: true,
        user
    });
});

/**
 * Get user's enrolled courses
 * @param {Object} req - Express request object with userId from auth
 * @param {Object} res - Express response object
 */
const getEnrollments = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const enrollments = await UserEnrollment.findAll({
        where: { user_id: userId },
        include: [
            {
                model: Course,
                as: 'course',
                attributes: ['id', 'title', 'thumbnail', 'category', 'instructor', 'duration', 'lectures']
            }
        ],
        order: [['granted_at', 'DESC']]
    });

    res.json({
        success: true,
        count: enrollments.length,
        enrollments: enrollments.map(e => ({
            id: e.id,
            course: e.course,
            drive_link: e.drive_link,
            bunny_video_id: e.bunny_video_id,
            access_type: e.access_type,
            granted_at: e.granted_at,
            expires_at: e.expires_at
        }))
    });
});

/**
 * Get user's orders
 * @param {Object} req - Express request object with userId from auth
 * @param {Object} res - Express response object
 */
const getUserOrders = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const orders = await Order.findAll({
        where: { user_id: userId },
        attributes: ['id', 'order_code', 'total_amount', 'payment_status', 'order_status', 'created_at'],
        order: [['created_at', 'DESC']]
    });

    res.json({
        success: true,
        count: orders.length,
        orders
    });
});

/**
 * Check if user has access to a specific course
 * @param {Object} req - Express request object with userId and courseId
 * @param {Object} res - Express response object
 */
const checkCourseAccess = asyncHandler(async (req, res) => {
    const { userId, courseId } = req.params;

    const enrollment = await UserEnrollment.findOne({
        where: {
            user_id: userId,
            course_id: courseId
        }
    });

    // Also check if user is premium (and premium is not expired)
    const user = await User.findByPk(userId);
    const isPremiumActive = user?.is_premium &&
        (!user.premium_expires_at || new Date(user.premium_expires_at) > new Date());

    const hasAccess = !!enrollment || isPremiumActive;

    res.json({
        success: true,
        hasAccess,
        accessType: enrollment?.access_type || (isPremiumActive ? 'premium' : null),
        drive_link: enrollment?.drive_link || null,
        bunny_video_id: enrollment?.bunny_video_id || null
    });
});

module.exports = {
    syncUser,
    getProfile,
    getEnrollments,
    getUserOrders,
    checkCourseAccess
};
