/**
 * Fake Python Worker Simulator
 * 
 * Simulates a Python worker downloading a course by publishing progress
 * updates to Redis channels, exactly as the real Python worker does.
 * 
 * Usage:
 *   node server/scripts/simulate-download.js [taskId] [orderId]
 * 
 * Example:
 *   node server/scripts/simulate-download.js 123 456
 * 
 * Interactive mode:
 *   node server/scripts/simulate-download.js
 */

const redis = require('redis');
const readline = require('readline');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Parse command line arguments
const taskId = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const orderId = process.argv[3] ? parseInt(process.argv[3], 10) : null;

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

// Main simulation function
async function simulateDownload(taskId, orderId) {
    log('\n========================================', 'cyan');
    log('  Fake Python Worker Simulator', 'bright');
    log('========================================\n', 'cyan');

    // Connect to Redis
    log('📡 Connecting to Redis...', 'blue');
    const redisClient = redis.createClient({
        socket: {
            host: REDIS_HOST,
            port: REDIS_PORT,
        },
        password: REDIS_PASSWORD,
    });

    redisClient.on('error', (err) => {
        log(`❌ Redis Error: ${err.message}`, 'red');
        process.exit(1);
    });

    try {
        await redisClient.connect();
        log(`✅ Connected to Redis at ${REDIS_HOST}:${REDIS_PORT}\n`, 'green');
    } catch (error) {
        log(`❌ Failed to connect to Redis: ${error.message}`, 'red');
        log('   Make sure Redis is running: redis-cli ping', 'yellow');
        process.exit(1);
    }

    // Display configuration
    log('Configuration:', 'bright');
    log(`  Task ID:  ${taskId}`, 'cyan');
    log(`  Order ID: ${orderId}`, 'cyan');
    log(`  Redis:    ${REDIS_HOST}:${REDIS_PORT}\n`, 'cyan');

    // Channels
    const taskChannel = `task:${taskId}:progress`;
    const orderChannel = `order:${orderId}:progress`;
    const taskStatusChannel = `task:${taskId}:status`;
    const orderStatusChannel = `order:${orderId}:status`;

    log('📤 Publishing to channels:', 'blue');
    log(`  • ${taskChannel}`, 'cyan');
    log(`  • ${orderChannel}`, 'cyan');
    log(`  • ${taskStatusChannel}`, 'cyan');
    log(`  • ${orderStatusChannel}\n`, 'cyan');

    // Simulate download progress
    log('🚀 Starting download simulation...\n', 'green');

    // Publish initial status: downloading
    const initialStatus = {
        taskId,
        orderId,
        newStatus: 'downloading',
        previousStatus: 'pending',
        message: 'Download started',
        timestamp: Date.now()
    };

    await redisClient.publish(taskStatusChannel, JSON.stringify(initialStatus));
    await redisClient.publish(orderStatusChannel, JSON.stringify(initialStatus));
    log(`📊 Status: pending → downloading`, 'yellow');

    // Simulate progress from 0% to 100%
    const totalSteps = 100;
    const intervalMs = 100; // Publish every 100ms
    let currentStep = 0;

    const progressInterval = setInterval(async () => {
        currentStep++;
        const percent = Math.min(currentStep, totalSteps);
        
        // Simulate file names
        const files = [
            'Introduction.mp4',
            'Getting Started.mp4',
            'Core Concepts.mp4',
            'Advanced Topics.mp4',
            'Best Practices.mp4',
            'Conclusion.mp4'
        ];
        const currentFileIndex = Math.floor((percent / 100) * files.length);
        const currentFile = files[Math.min(currentFileIndex, files.length - 1)];

        // Simulate download speed (varying between 1-5 MB/s)
        const speed = Math.floor((1 + Math.random() * 4) * 1024 * 1024); // 1-5 MB/s in bytes/sec

        // Simulate ETA
        const remaining = 100 - percent;
        const etaSeconds = Math.ceil((remaining / 100) * 30); // Rough estimate
        const eta = etaSeconds > 60 
            ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s`
            : `${etaSeconds}s`;

        // Create progress message (matches Python worker format)
        const progressData = {
            taskId,
            orderId,
            percent: Math.round(percent * 100) / 100, // Round to 2 decimals
            currentFile: currentFile,
            speed: speed,
            eta: eta,
            bytesDownloaded: Math.floor((percent / 100) * 2 * 1024 * 1024 * 1024), // Assume 2GB total
            totalBytes: 2 * 1024 * 1024 * 1024,
            timestamp: Date.now()
        };

        // Publish to both task and order channels
        const message = JSON.stringify(progressData);
        await redisClient.publish(taskChannel, message);
        await redisClient.publish(orderChannel, message);

        // Display progress
        const progressBar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
        const speedMB = (speed / (1024 * 1024)).toFixed(2);
        
        process.stdout.write(`\r📊 Progress: [${progressBar}] ${percent.toFixed(1)}% | ${currentFile} | ${speedMB} MB/s | ETA: ${eta}`);
        
        // When complete
        if (percent >= 100) {
            clearInterval(progressInterval);
            process.stdout.write('\n\n');

            // Publish completion status
            const completionStatus = {
                taskId,
                orderId,
                newStatus: 'completed',
                previousStatus: 'downloading',
                message: 'Download completed successfully',
                timestamp: Date.now()
            };

            await redisClient.publish(taskStatusChannel, JSON.stringify(completionStatus));
            await redisClient.publish(orderStatusChannel, JSON.stringify(completionStatus));
            
            log('✅ Status: downloading → completed', 'green');
            log('\n🎉 Download simulation complete!', 'green');
            log(`\n📊 Total messages published: ${totalSteps + 2}`, 'cyan');
            log('   • Progress updates: ' + totalSteps, 'cyan');
            log('   • Status updates: 2', 'cyan');

            // Close Redis connection
            await redisClient.quit();
            log('\n✅ Redis connection closed', 'green');
            
            rl.close();
            process.exit(0);
        }
    }, intervalMs);

    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
        clearInterval(progressInterval);
        log('\n\n⚠️  Simulation interrupted by user', 'yellow');
        await redisClient.quit();
        rl.close();
        process.exit(0);
    });
}

// Main execution
async function main() {
    let finalTaskId = taskId;
    let finalOrderId = orderId;

    // Interactive mode if IDs not provided
    if (!finalTaskId || !finalOrderId) {
        log('Interactive Mode\n', 'bright');
        
        if (!finalTaskId) {
            const answer = await askQuestion('Enter Task ID (default: 123): ');
            finalTaskId = answer.trim() ? parseInt(answer, 10) : 123;
        }
        
        if (!finalOrderId) {
            const answer = await askQuestion('Enter Order ID (default: 456): ');
            finalOrderId = answer.trim() ? parseInt(answer, 10) : 456;
        }
        
        console.log('');
    }

    // Validate IDs
    if (isNaN(finalTaskId) || finalTaskId <= 0) {
        log('❌ Invalid Task ID', 'red');
        rl.close();
        process.exit(1);
    }

    if (isNaN(finalOrderId) || finalOrderId <= 0) {
        log('❌ Invalid Order ID', 'red');
        rl.close();
        process.exit(1);
    }

    // Start simulation
    await simulateDownload(finalTaskId, finalOrderId);
}

// Run
main().catch((error) => {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    rl.close();
    process.exit(1);
});
