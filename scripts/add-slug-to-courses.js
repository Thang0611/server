/**
 * Migration script to add slug to existing courses
 * Extracts slug from course_url or generates from title
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const { extractSlugFromUrl, generateSlugFromTitle } = require('../src/utils/url.util');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false
  }
);

async function addSlugToCourses() {
  try {
    console.log('🔄 Starting migration: Add slug to courses...');
    
    // Check if slug column exists
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'courses' 
      AND COLUMN_NAME = 'slug'
    `);
    
    if (results.length === 0) {
      console.log('📝 Adding slug column to courses table...');
      await sequelize.query(`
        ALTER TABLE courses 
        ADD COLUMN slug VARCHAR(255) NULL UNIQUE AFTER course_url
      `);
      console.log('✅ Added slug column');
    } else {
      console.log('✅ Slug column already exists');
    }
    
    // Get all courses without slug
    const [courses] = await sequelize.query(`
      SELECT id, course_url, title, slug 
      FROM courses 
      WHERE slug IS NULL OR slug = ''
    `);
    
    console.log(`📊 Found ${courses.length} courses without slug`);
    
    let updated = 0;
    let errors = 0;
    
    for (const course of courses) {
      try {
        let slug = extractSlugFromUrl(course.course_url);
        
        if (!slug && course.title) {
          slug = generateSlugFromTitle(course.title);
        }
        
        if (!slug) {
          console.log(`⚠️  Skipping course ${course.id}: Cannot generate slug`);
          errors++;
          continue;
        }
        
        // Ensure uniqueness - append id if duplicate
        let finalSlug = slug;
        let counter = 1;
        while (true) {
          const [existing] = await sequelize.query(`
            SELECT id FROM courses WHERE slug = ? AND id != ?
          `, {
            replacements: [finalSlug, course.id]
          });
          
          if (existing.length === 0) {
            break;
          }
          
          finalSlug = `${slug}-${counter}`;
          counter++;
        }
        
        await sequelize.query(`
          UPDATE courses 
          SET slug = ? 
          WHERE id = ?
        `, {
          replacements: [finalSlug, course.id]
        });
        
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`  ✅ Updated ${updated}/${courses.length} courses...`);
        }
      } catch (error) {
        console.error(`  ❌ Error updating course ${course.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n✅ Migration completed!`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Errors: ${errors}`);
    console.log(`   - Total: ${courses.length}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run migration
addSlugToCourses();
