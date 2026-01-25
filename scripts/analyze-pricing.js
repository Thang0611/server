/**
 * Script to analyze pricing for courses by URL vs courses in database
 * Compares dynamic pricing (from URL) with fixed pricing (in courses table)
 */

const { sequelize } = require('../src/models');
const Course = require('../src/models/course.model');
const { pricingConfig } = require('../src/utils/pricing.util');
const { calculateTotalPrice, getComboPriceDistribution } = require('../src/utils/pricing.util');

async function analyzePricing() {
  try {
    console.log('📊 PHÂN TÍCH GIÁ BÁN KHÓA HỌC\n');
    console.log('='.repeat(80));

    // 1. Pricing Configuration
    console.log('\n1️⃣  CẤU HÌNH GIÁ (pricing.config.js):');
    console.log(`   - Giá mỗi khóa học: ${pricingConfig.PRICE_PER_COURSE.toLocaleString('vi-VN')} VND`);
    console.log(`   - Combo 5 khóa: ${pricingConfig.PRICE_COMBO_5.toLocaleString('vi-VN')} VND`);
    console.log(`   - Combo 10 khóa: ${pricingConfig.PRICE_COMBO_10.toLocaleString('vi-VN')} VND`);
    console.log(`   - Giá mỗi khóa trong Combo 5: ${(pricingConfig.PRICE_COMBO_5 / 5).toLocaleString('vi-VN')} VND`);
    console.log(`   - Giá mỗi khóa trong Combo 10: ${(pricingConfig.PRICE_COMBO_10 / 10).toLocaleString('vi-VN')} VND`);

    // 2. Courses in Database
    console.log('\n2️⃣  KHÓA HỌC TRONG DATABASE (bảng courses):');
    const [coursesStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN price = 2000 THEN 1 END) as price_2000,
        COUNT(CASE WHEN price != 2000 THEN 1 END) as price_other,
        MIN(price) as min_price,
        MAX(price) as max_price,
        AVG(price) as avg_price,
        SUM(price) as total_value
      FROM courses
      WHERE status = 'active'
    `, { type: sequelize.QueryTypes.SELECT });

    console.log(`   - Tổng số khóa học: ${coursesStats.total}`);
    console.log(`   - Khóa học giá 2,000 VND: ${coursesStats.price_2000}`);
    console.log(`   - Khóa học giá khác: ${coursesStats.price_other}`);
    console.log(`   - Giá thấp nhất: ${parseInt(coursesStats.min_price).toLocaleString('vi-VN')} VND`);
    console.log(`   - Giá cao nhất: ${parseInt(coursesStats.max_price).toLocaleString('vi-VN')} VND`);
    console.log(`   - Giá trung bình: ${parseInt(coursesStats.avg_price).toLocaleString('vi-VN')} VND`);
    console.log(`   - Tổng giá trị: ${parseInt(coursesStats.total_value).toLocaleString('vi-VN')} VND`);

    // 3. Sample courses with prices
    console.log('\n3️⃣  MẪU KHÓA HỌC VÀ GIÁ:');
    const sampleCourses = await Course.findAll({
      where: { status: 'active' },
      attributes: ['id', 'title', 'course_url', 'price', 'original_price'],
      limit: 10,
      order: [['id', 'DESC']]
    });

    sampleCourses.forEach((course, index) => {
      console.log(`   ${index + 1}. ${course.title.substring(0, 50)}...`);
      console.log(`      - ID: ${course.id}`);
      console.log(`      - Giá bán: ${parseInt(course.price).toLocaleString('vi-VN')} VND`);
      console.log(`      - Giá gốc: ${course.original_price ? parseInt(course.original_price).toLocaleString('vi-VN') + ' VND' : 'NULL'}`);
      console.log(`      - URL: ${course.course_url.substring(0, 60)}...`);
      console.log('');
    });

    // 4. Pricing by URL (Dynamic Pricing)
    console.log('4️⃣  GIÁ BÁN THEO URL (Dynamic Pricing):');
    console.log('   Khi khách hàng nhập URL, giá được tính như sau:');
    console.log('');
    
    const testCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
    testCounts.forEach(count => {
      const totalPrice = calculateTotalPrice(count);
      const pricePerCourse = totalPrice / count;
      const combo5Price = count === 5 ? pricingConfig.PRICE_COMBO_5 : null;
      const combo10Price = count === 10 ? pricingConfig.PRICE_COMBO_10 : null;
      
      let pricingType = 'Per-course';
      if (count === 5) pricingType = 'Combo 5';
      if (count === 10) pricingType = 'Combo 10';
      
      console.log(`   ${count} khóa học:`);
      console.log(`      - Loại: ${pricingType}`);
      console.log(`      - Tổng tiền: ${totalPrice.toLocaleString('vi-VN')} VND`);
      console.log(`      - Giá mỗi khóa: ${pricePerCourse.toLocaleString('vi-VN')} VND`);
      
      if (count === 5 || count === 10) {
        const distribution = getComboPriceDistribution(count, totalPrice);
        if (distribution) {
          console.log(`      - Phân bổ giá: ${distribution.map(p => p.toLocaleString('vi-VN')).join(', ')} VND`);
        }
      }
      console.log('');
    });

    // 5. Comparison
    console.log('5️⃣  SO SÁNH GIÁ BÁN:');
    console.log('   📌 Giá trong Database (courses table):');
    console.log(`      - Tất cả khóa học có giá cố định: ${pricingConfig.PRICE_PER_COURSE.toLocaleString('vi-VN')} VND`);
    console.log(`      - Giá này được dùng khi hiển thị trên trang courses`);
    console.log('');
    console.log('   📌 Giá theo URL (Dynamic):');
    console.log(`      - Giá được tính động dựa trên số lượng khóa học`);
    console.log(`      - 1-4 khóa: ${pricingConfig.PRICE_PER_COURSE.toLocaleString('vi-VN')} VND/khóa`);
    console.log(`      - 5 khóa: Combo 5 = ${pricingConfig.PRICE_COMBO_5.toLocaleString('vi-VN')} VND (${(pricingConfig.PRICE_COMBO_5/5).toLocaleString('vi-VN')} VND/khóa)`);
    console.log(`      - 10 khóa: Combo 10 = ${pricingConfig.PRICE_COMBO_10.toLocaleString('vi-VN')} VND (${(pricingConfig.PRICE_COMBO_10/10).toLocaleString('vi-VN')} VND/khóa)`);
    console.log(`      - >10 khóa: ${pricingConfig.PRICE_PER_COURSE.toLocaleString('vi-VN')} VND/khóa`);
    console.log('');

    // 6. Recommendations
    console.log('6️⃣  KHUYẾN NGHỊ:');
    console.log('   ✅ Giá trong database (courses.price) nên giữ nguyên để hiển thị');
    console.log('   ✅ Giá theo URL được tính động khi tạo order');
    console.log('   ✅ Khi mua từ trang courses, giá sẽ là giá trong database');
    console.log('   ✅ Khi mua bằng URL, giá sẽ được tính theo combo/per-course');
    console.log('   ⚠️  Có thể cần sync giá từ database vào order nếu mua từ trang courses');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzePricing();
