/**
 * Migration: Add VPS storage and course curriculum tables
 * 
 * Run: NODE_ENV=production node scripts/migrations/add_vps_storage_tables.js
 */

const sequelize = require('../../src/config/database');
const Logger = require('../../src/utils/logger.util');

const runMigration = async () => {
    console.log('Starting migration: VPS Storage & Curriculum tables...\n');

    try {
        // 1. Add columns to courses table
        console.log('1. Adding columns to courses table...');

        const columnsToAdd = [
            { name: 'vps_path', sql: "ADD COLUMN vps_path VARCHAR(500) NULL COMMENT 'VPS storage path'" },
            { name: 'total_sections', sql: "ADD COLUMN total_sections INT DEFAULT 0" },
            { name: 'total_lectures', sql: "ADD COLUMN total_lectures INT DEFAULT 0" },
            { name: 'total_size', sql: "ADD COLUMN total_size BIGINT DEFAULT 0 COMMENT 'Size in bytes'" },
            { name: 'has_subtitles', sql: "ADD COLUMN has_subtitles BOOLEAN DEFAULT FALSE" },
            { name: 'has_resources', sql: "ADD COLUMN has_resources BOOLEAN DEFAULT FALSE" },
            { name: 'streaming_ready', sql: "ADD COLUMN streaming_ready BOOLEAN DEFAULT FALSE" }
        ];

        const [existingColumns] = await sequelize.query('SHOW COLUMNS FROM courses');
        const columnNames = existingColumns.map(c => c.Field);

        for (const col of columnsToAdd) {
            if (!columnNames.includes(col.name)) {
                await sequelize.query(`ALTER TABLE courses ${col.sql}`);
                console.log(`  ✓ Added ${col.name}`);
            } else {
                console.log(`  ✓ ${col.name} already exists`);
            }
        }

        // 2. Create course_sections table
        console.log('\n2. Creating course_sections table...');
        await sequelize.query(`
      CREATE TABLE IF NOT EXISTS course_sections (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        course_id INT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        position INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        INDEX idx_course_position (course_id, position)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
        console.log('  ✓ course_sections table ready');

        // 3. Create course_lectures table
        console.log('\n3. Creating course_lectures table...');
        await sequelize.query(`
      CREATE TABLE IF NOT EXISTS course_lectures (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        section_id INT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        position INT DEFAULT 0,
        filename VARCHAR(255),
        relative_path VARCHAR(500),
        size BIGINT DEFAULT 0,
        duration INT DEFAULT 0 COMMENT 'Duration in seconds',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (section_id) REFERENCES course_sections(id) ON DELETE CASCADE,
        INDEX idx_section_position (section_id, position)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
        console.log('  ✓ course_lectures table ready');

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('ERROR:', error.message);
        Logger.error('Migration failed', error);
        process.exit(1);
    }
};

runMigration();
