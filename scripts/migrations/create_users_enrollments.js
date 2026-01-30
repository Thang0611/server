/**
 * Migration: Create users and user_enrollments tables, add user_id to orders
 * Run with: node scripts/migrations/create_users_enrollments.js
 */

const sequelize = require('../../src/config/database');
const Logger = require('../../src/utils/logger.util');

async function migrate() {
    try {
        Logger.info('Starting migration: Create users and user_enrollments tables');

        // 1. Create users table
        await sequelize.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        google_id VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        avatar_url TEXT,
        is_premium BOOLEAN DEFAULT FALSE,
        premium_expires_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_email (email),
        INDEX idx_users_google_id (google_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
        Logger.success('Created users table');

        // 2. Create user_enrollments table
        await sequelize.query(`
      CREATE TABLE IF NOT EXISTS user_enrollments (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        course_id INT UNSIGNED NOT NULL,
        order_id INT UNSIGNED,
        drive_link TEXT,
        bunny_video_id VARCHAR(255),
        access_type ENUM('purchased', 'premium') DEFAULT 'purchased',
        granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_course (user_id, course_id),
        INDEX idx_enrollments_user (user_id),
        INDEX idx_enrollments_course (course_id),
        INDEX idx_enrollments_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
        Logger.success('Created user_enrollments table');

        // 3. Add user_id column to orders table (if not exists)
        const [columns] = await sequelize.query(`
      SHOW COLUMNS FROM orders LIKE 'user_id'
    `);

        if (columns.length === 0) {
            await sequelize.query(`
        ALTER TABLE orders ADD COLUMN user_id INT UNSIGNED NULL
          COMMENT 'Authenticated user who created this order'
      `);
            Logger.success('Added user_id column to orders table');
        } else {
            Logger.info('user_id column already exists in orders table');
        }

        // 4. Add foreign key constraints
        // Note: We use TRY/CATCH for each FK to handle cases where they already exist

        try {
            await sequelize.query(`
        ALTER TABLE user_enrollments 
        ADD CONSTRAINT fk_enrollments_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      `);
            Logger.success('Added foreign key: user_enrollments.user_id -> users.id');
        } catch (e) {
            if (e.original?.code === 'ER_DUP_KEYNAME' || e.original?.code === 'ER_FK_DUP_KEY') {
                Logger.info('Foreign key fk_enrollments_user already exists');
            } else {
                throw e;
            }
        }

        try {
            await sequelize.query(`
        ALTER TABLE user_enrollments 
        ADD CONSTRAINT fk_enrollments_course 
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
      `);
            Logger.success('Added foreign key: user_enrollments.course_id -> courses.id');
        } catch (e) {
            if (e.original?.code === 'ER_DUP_KEYNAME' || e.original?.code === 'ER_FK_DUP_KEY') {
                Logger.info('Foreign key fk_enrollments_course already exists');
            } else {
                throw e;
            }
        }

        try {
            await sequelize.query(`
        ALTER TABLE user_enrollments 
        ADD CONSTRAINT fk_enrollments_order 
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      `);
            Logger.success('Added foreign key: user_enrollments.order_id -> orders.id');
        } catch (e) {
            if (e.original?.code === 'ER_DUP_KEYNAME' || e.original?.code === 'ER_FK_DUP_KEY') {
                Logger.info('Foreign key fk_enrollments_order already exists');
            } else {
                throw e;
            }
        }

        try {
            await sequelize.query(`
        ALTER TABLE orders 
        ADD CONSTRAINT fk_orders_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      `);
            Logger.success('Added foreign key: orders.user_id -> users.id');
        } catch (e) {
            if (e.original?.code === 'ER_DUP_KEYNAME' || e.original?.code === 'ER_FK_DUP_KEY') {
                Logger.info('Foreign key fk_orders_user already exists');
            } else {
                throw e;
            }
        }

        Logger.success('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        Logger.error('Migration failed', error);
        process.exit(1);
    }
}

migrate();
