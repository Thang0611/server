/**
 * Migration: Add Bunny CDN columns to user_enrollments table
 * 
 * Run this migration in production:
 * NODE_ENV=production node scripts/migrations/add_bunny_columns.js
 */

const sequelize = require('../../src/config/database');
const Logger = require('../../src/utils/logger.util');

const runMigration = async () => {
    console.log('Starting migration: Add Bunny CDN columns to user_enrollments...\n');

    try {
        // Check if columns already exist
        const [existingColumns] = await sequelize.query(`
      SHOW COLUMNS FROM user_enrollments
    `);

        const columnNames = existingColumns.map(c => c.Field);

        // Add bunny_collection_id if not exists
        if (!columnNames.includes('bunny_collection_id')) {
            console.log('Adding bunny_collection_id column...');
            await sequelize.query(`
        ALTER TABLE user_enrollments 
        ADD COLUMN bunny_collection_id VARCHAR(255) NULL 
        COMMENT 'Bunny CDN collection ID (for course with multiple videos)'
        AFTER bunny_video_id
      `);
            console.log('✓ Added bunny_collection_id column');
        } else {
            console.log('✓ bunny_collection_id column already exists');
        }

        // Add can_stream if not exists
        if (!columnNames.includes('can_stream')) {
            console.log('Adding can_stream column...');
            await sequelize.query(`
        ALTER TABLE user_enrollments 
        ADD COLUMN can_stream BOOLEAN DEFAULT TRUE 
        COMMENT 'Whether user can stream videos from Bunny CDN'
        AFTER bunny_collection_id
      `);
            console.log('✓ Added can_stream column');
        } else {
            console.log('✓ can_stream column already exists');
        }

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('ERROR:', error.message);
        Logger.error('Migration failed', error);
        process.exit(1);
    }
};

runMigration();
