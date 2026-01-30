/**
 * Fix Order 129 - Enroll courses to huu.thang@samsung.com and retry download
 */

const enrollService = require('./src/services/enroll.service');
const { DownloadTask } = require('./src/models');
const Logger = require('./src/utils/logger.util');

async function fixOrder129() {
    try {
        Logger.info('Starting Order 129 fix...');

        // Step 1: Enroll courses to huu.thang@samsung.com
        const courses = [
            'https://samsungu.udemy.com/course/excel-ai-trong-phan-tich-du-lieu-doanh-nghiep/',
            'https://samsungu.udemy.com/course/alan-sharpe-copywriting-masterclass/'
        ];

        Logger.info('Step 1: Enrolling courses to huu.thang@samsung.com...');
        const enrollResults = await enrollService.enrollCourses(
            courses,
            'huu.thang@samsung.com',
            129
        );

        Logger.info('Enrollment results:', { results: enrollResults });

        // Check if enrollment succeeded
        const allEnrolled = enrollResults.every(r => r.success && r.status === 'enrolled');

        if (!allEnrolled) {
            Logger.error('Some enrollments failed', { results: enrollResults });
            process.exit(1);
        }

        Logger.success('✓ All courses enrolled successfully');

        // Step 2: Update tasks to 'enrolled' status so they can be downloaded
        Logger.info('Step 2: Updating task statuses to enrolled...');

        await DownloadTask.update(
            {
                status: 'enrolled',
                error_log: null
            },
            {
                where: { order_id: 129 }
            }
        );

        Logger.success('✓ Task statuses updated to enrolled');

        // Step 3: Re-push to Redis queue for download
        Logger.info('Step 3: Pushing tasks to download queue...');

        const tasks = await DownloadTask.findAll({
            where: { order_id: 129 },
            attributes: ['id', 'email', 'course_url']
        });

        const Redis = require('ioredis');
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: 3
        });

        for (const task of tasks) {
            const jobData = {
                taskId: task.id,
                email: task.email,
                courseUrl: task.course_url
            };

            await redis.lpush('rq:queue:downloads', JSON.stringify(jobData));
            Logger.info(`✓ Task ${task.id} pushed to queue`);
        }

        await redis.quit();

        Logger.success('✓ All tasks pushed to download queue');
        Logger.success('✓ Order 129 fix completed - downloads will start automatically');

        process.exit(0);
    } catch (error) {
        Logger.error('Failed to fix Order 129', error);
        process.exit(1);
    }
}

fixOrder129();
