/**
 * Database Setup Script
 * Tạo lại tất cả các bảng từ Sequelize models
 * 
 * Usage: node scripts/setup-database.js
 */

require('dotenv').config();
const sequelize = require('../src/config/database');
const { Order, DownloadTask, OrderAuditLog } = require('../src/models');

// Ensure console output is flushed
process.stdout.write('');

async function setupDatabase() {
  try {
    console.log('🔌 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    console.log('\n🗑️  Dropping existing tables (if any)...');
    // Drop tables in correct order (respecting foreign keys)
    await OrderAuditLog.drop({ cascade: true }).catch(() => {});
    await DownloadTask.drop({ cascade: true }).catch(() => {});
    await Order.drop({ cascade: true }).catch(() => {});
    console.log('✅ Existing tables dropped');

    console.log('\n📦 Creating tables from models...');
    
    // Create tables in correct order
    await Order.sync({ force: true });
    console.log('✅ Table "orders" created');

    await DownloadTask.sync({ force: true });
    console.log('✅ Table "download_tasks" created');

    await OrderAuditLog.sync({ force: true });
    console.log('✅ Table "order_audit_logs" created');

    console.log('\n✅ Associations already set up in models/index.js');

    console.log('\n📊 Verifying tables...');
    const tables = await sequelize.getQueryInterface().showAllTables();
    console.log(`✅ Found ${tables.length} tables:`, tables.join(', '));

    console.log('\n✨ Database setup completed successfully!');
    console.log('\n📋 Tables created:');
    console.log('   - orders');
    console.log('   - download_tasks');
    console.log('   - order_audit_logs');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database setup failed:');
    console.error(error);
    process.exit(1);
  }
}

setupDatabase();
