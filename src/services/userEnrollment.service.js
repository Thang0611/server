/**
 * User Enrollment Service
 * Handles creating and managing user enrollments to courses after payment
 * @module services/userEnrollment
 */

const { User, UserEnrollment, Order, DownloadTask, Course } = require('../models');
const Logger = require('../utils/logger.util');

/**
 * Create user enrollments after payment completion
 * Links the user to courses they purchased via the order
 * @param {number} orderId - The order ID
 * @returns {Promise<Object>} - Result with created enrollments info
 */
const createEnrollmentsForOrder = async (orderId) => {
    try {
        // Get order with user info
        const order = await Order.findByPk(orderId, {
            attributes: ['id', 'user_id', 'user_email', 'order_status', 'payment_status']
        });

        if (!order) {
            Logger.warn('[Enrollment] Order not found', { orderId });
            return { success: false, message: 'Order not found', enrollmentsCreated: 0 };
        }

        // Check if order has a linked user
        if (!order.user_id) {
            Logger.info('[Enrollment] Order has no user_id, skipping enrollment creation', {
                orderId,
                email: order.user_email,
                note: 'This may be a legacy anonymous order'
            });
            return { success: true, message: 'No user linked to order', enrollmentsCreated: 0 };
        }

        // Get user
        const user = await User.findByPk(order.user_id);
        if (!user) {
            Logger.warn('[Enrollment] User not found for order', { orderId, userId: order.user_id });
            return { success: false, message: 'User not found', enrollmentsCreated: 0 };
        }

        // Get download tasks with completed drive links
        const tasks = await DownloadTask.findAll({
            where: { order_id: orderId },
            attributes: ['id', 'course_url', 'title', 'drive_link', 'course_id', 'category', 'status']
        });

        if (tasks.length === 0) {
            Logger.info('[Enrollment] No tasks found for order', { orderId });
            return { success: true, message: 'No tasks to enroll', enrollmentsCreated: 0 };
        }

        let enrollmentsCreated = 0;
        let enrollmentsFailed = 0;
        const createdEnrollments = [];

        for (const task of tasks) {
            try {
                // Check if enrollment already exists (prevent duplicates)
                // We use a combination of user_id + course_id (if exists) or user_id + order_id + course_url
                let existingEnrollment = null;

                if (task.course_id) {
                    existingEnrollment = await UserEnrollment.findOne({
                        where: {
                            user_id: order.user_id,
                            course_id: task.course_id
                        }
                    });
                }

                if (existingEnrollment) {
                    // Update existing enrollment with new info if drive link available
                    if (task.drive_link && !existingEnrollment.drive_link) {
                        await existingEnrollment.update({
                            drive_link: task.drive_link,
                            order_id: orderId
                        });
                        Logger.info('[Enrollment] Updated existing enrollment with drive link', {
                            enrollmentId: existingEnrollment.id,
                            userId: order.user_id,
                            courseId: task.course_id,
                            driveLink: task.drive_link ? 'Set' : 'Empty'
                        });
                    }
                    continue;
                }

                // Create new enrollment
                const enrollment = await UserEnrollment.create({
                    user_id: order.user_id,
                    course_id: task.course_id || null,
                    order_id: orderId,
                    drive_link: task.drive_link || null,
                    bunny_video_id: null, // Will be set when Bunny CDN is integrated
                    access_type: 'lifetime',
                    expires_at: null // Permanent access
                });

                createdEnrollments.push({
                    id: enrollment.id,
                    courseId: task.course_id,
                    title: task.title,
                    driveLink: task.drive_link ? 'Set' : 'Pending'
                });

                enrollmentsCreated++;

                Logger.success('[Enrollment] Created enrollment', {
                    enrollmentId: enrollment.id,
                    userId: order.user_id,
                    courseId: task.course_id,
                    taskId: task.id,
                    driveLink: task.drive_link ? 'Set' : 'Pending'
                });

            } catch (enrollError) {
                enrollmentsFailed++;

                // Handle duplicate key error gracefully
                if (enrollError.name === 'SequelizeUniqueConstraintError') {
                    Logger.info('[Enrollment] Enrollment already exists (duplicate)', {
                        orderId,
                        userId: order.user_id,
                        courseId: task.course_id
                    });
                } else {
                    Logger.error('[Enrollment] Failed to create enrollment for task', enrollError, {
                        orderId,
                        taskId: task.id,
                        courseId: task.course_id
                    });
                }
            }
        }

        Logger.info('[Enrollment] Order enrollment summary', {
            orderId,
            userId: order.user_id,
            totalTasks: tasks.length,
            enrollmentsCreated,
            enrollmentsFailed
        });

        return {
            success: true,
            enrollmentsCreated,
            enrollmentsFailed,
            enrollments: createdEnrollments
        };

    } catch (error) {
        Logger.error('[Enrollment] Failed to create enrollments for order', error, { orderId });
        return { success: false, message: error.message, enrollmentsCreated: 0 };
    }
};

/**
 * Update enrollment with drive link when download completes
 * @param {number} orderId - The order ID
 * @param {number} taskId - The download task ID
 * @param {string} driveLink - The Google Drive link
 * @returns {Promise<Object>} - Update result
 */
const updateEnrollmentDriveLink = async (orderId, taskId, driveLink) => {
    try {
        // Get task to find course_id
        const task = await DownloadTask.findByPk(taskId, {
            attributes: ['id', 'course_id']
        });

        if (!task) {
            Logger.warn('[Enrollment] Task not found for drive link update', { orderId, taskId });
            return { success: false, message: 'Task not found' };
        }

        // Get order to find user_id
        const order = await Order.findByPk(orderId, {
            attributes: ['id', 'user_id']
        });

        if (!order || !order.user_id) {
            Logger.info('[Enrollment] Order has no user, skipping enrollment update', { orderId });
            return { success: true, message: 'No user linked' };
        }

        // Find enrollment and update
        const enrollment = await UserEnrollment.findOne({
            where: {
                user_id: order.user_id,
                order_id: orderId,
                course_id: task.course_id || null
            }
        });

        if (enrollment) {
            await enrollment.update({ drive_link: driveLink });
            Logger.success('[Enrollment] Updated enrollment with drive link', {
                enrollmentId: enrollment.id,
                orderId,
                driveLink: 'Set'
            });
            return { success: true, enrollmentId: enrollment.id };
        } else {
            // Create enrollment if it doesn't exist
            const newEnrollment = await UserEnrollment.create({
                user_id: order.user_id,
                course_id: task.course_id || null,
                order_id: orderId,
                drive_link: driveLink,
                access_type: 'lifetime'
            });
            Logger.success('[Enrollment] Created enrollment with drive link', {
                enrollmentId: newEnrollment.id,
                orderId
            });
            return { success: true, enrollmentId: newEnrollment.id, created: true };
        }

    } catch (error) {
        Logger.error('[Enrollment] Failed to update enrollment drive link', error, { orderId, taskId });
        return { success: false, message: error.message };
    }
};

module.exports = {
    createEnrollmentsForOrder,
    updateEnrollmentDriveLink
};
