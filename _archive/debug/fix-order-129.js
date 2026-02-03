/**
 * Fix Order 129 - Re-enroll courses to download account (huu.thang@samsung.com)
 * and update tasks to 'enrolled' status for download
 */

const enrollService = require('./src/services/enroll.service');
const { DownloadTask } = require('./src/models');
const Logger = require('./src/utils/logger.util');
const Redis = require('ioredis');

// IMPORTANT: This will enroll courses to the account in cookies.txt (huu.thang@samsung.com)
// NOT to the user email (annguyenhoang20@gmail.com)

async function fixOrder129() {
    try {
        Logger.info('='.repeat(60));
        Logger.info('Order 129 Fix - Re-enroll to Download Account');
        Logger.info('='.repeat(60));

        const courses = [
            'https://samsungu.udemy.com/course/excel-ai-trong-phan-tich-du-lieu-doanh-nghiep/',
            'https://samsungu.udemy.com/course/alan-sharpe-copywriting-masterclass/'
        ];

        // Get tasks for order 129
        const tasks = await DownloadTask.findAll({
            where: { order_id: 129 },
            attributes: ['id', 'email', 'course_url', 'status']
        });

        if (tasks.length === 0) {
            Logger.error('No tasks found for order 129');
            process.exit(1);
        }

        Logger.info(`Found ${tasks.length} tasks for order 129:`);
        tasks.forEach(t => {
            Logger.info(`  Task ${t.id}: ${t.email} - ${t.course_url} - Status: ${t.status}`);
        });

        // Step 1: Update tasks to use download email temporarily for enrollment
        Logger.info('\n[Step 1] Updating tasks to download account email...');
        await DownloadTask.update(
            {
                email: 'huu.thang@samsung.com',  // Enrollment email (account with cookie)
                status: 'processing'
            },
            {
                where: { order_id: 129 }
            }
        );
        Logger.success('✓ Tasks updated to huu.thang@samsung.com for enrollment');

        // Step 2: Enroll courses using download account
        Logger.info('\n[Step 2] Enrolling courses to download account (huu.thang@samsung.com)...');
        Logger.info('Using cookie from /root/project/server/cookies.txt');

        const enrollResults = await enrollService.enrollCourses(
            courses,
            'huu.thang@samsung.com',  // Email parameter (matches cookie account)
            129  // order_id
        );

        Logger.info('Enrollment results:');
        enrollResults.forEach((result, index) => {
            Logger.info(`  Course ${index + 1}: ${result.success ? '✓' : '✗'} - ${result.message || result.status}`);
        });

        // Check if all enrollments succeeded
        const allEnrolled = enrollResults.every(r => r.success && r.status === 'enrolled');

        if (!allEnrolled) {
            Logger.error('\n❌ Some enrollments failed:');
            enrollResults.filter(r => !r.success).forEach(r => {
                Logger.error(`  - ${r.url}: ${r.message}`);
            });
            process.exit(1);
        }

        Logger.success('\n✓ All courses enrolled successfully to huu.thang@samsung.com');

        // Step 3: Verify tasks are in 'enrolled' status
        Logger.info('\n[Step 3] Verifying task statuses...');
        const verifiedTasks = await DownloadTask.findAll({
            where: { order_id: 129 },
            attributes: ['id', 'email', 'status', 'course_url']
        });

        verifiedTasks.forEach(t => {
            const symbol = t.status === 'enrolled' ? '✓' : '✗';
            Logger.info(`  ${symbol} Task ${t.id}: ${t.status}`);
        });

        const allEnrolledStatus = verifiedTasks.every(t => t.status === 'enrolled');
        if (!allEnrolledStatus) {
            Logger.error('\n❌ Not all tasks have enrolled status. Please check manually.');
            process.exit(1);
        }

        Logger.success('✓ All tasks verified as enrolled');

        // Step 4: Push to download queue
        Logger.info('\n[Step 4] Pushing tasks to download queue...');

        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: 3
        });

        for (const task of verifiedTasks) {
            const jobData = {
                taskId: task.id,
                email: task.email,  // huu.thang@samsung.com
                courseUrl: task.course_url
            };

            await redis.lpush('rq:queue:downloads', JSON.stringify(jobData));
            Logger.info(`  ✓ Task ${task.id} pushed to queue`);
        }

        await redis.quit();

        Logger.success('\n' + '='.repeat(60));
        Logger.success('✓ Order 129 fix completed successfully!');
        Logger.success('='.repeat(60));
        Logger.info('\nNext steps:');
        Logger.info('1. Worker will download courses using huu.thang@samsung.com cookie');
        Logger.info('2. After upload to GDrive, link will be shared with annguyenhoang20@gmail.com');
        Logger.info('\nMonitor progress:');
        Logger.info('  pm2 log worker');
        Logger.info('  tail -f server/logs/tasks/task-268.log');
        Logger.info('  tail -f server/logs/tasks/task-269.log');

        process.exit(0);
    } catch (error) {
        Logger.error('\n❌ Failed to fix Order 129:', error);
        Logger.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the fix
fixOrder129().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
