
const DownloadTask = require('../models/downloadTask.model');
const { verifyRequestSignature } = require('../utils/hash.util');
const { transformToSamsungUdemy } = require('../utils/url.util');
const downloadWorker = require('../workers/download.worker');

exports.download = async (req, res) => {
  console.log("📥 [Req] Nhận yêu cầu download...");

  try {
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    const { order_id, email, urls, courses, phone_number } = req.body;

    // 1️⃣ Validate cơ bản
    if (!signature || !timestamp || !order_id || !email) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    // 2️⃣ Verify Signature
    const isValid = verifyRequestSignature(order_id, email, timestamp, signature);
    if (!isValid) {
      console.warn(`❌ [Security] Sai chữ ký! Order: ${order_id}`);
      return res.status(403).json({ message: 'Sai chữ ký bảo mật' });
    }

    // 3️⃣ Chuẩn hóa input courses/urls
    let inputCourses = [];
    if (Array.isArray(courses)) inputCourses = courses;
    else if (Array.isArray(urls)) inputCourses = urls.map(url => ({ url }));

    if (inputCourses.length === 0) {
      return res.status(400).json({ message: 'Không có khóa học nào' });
    }

    // 4️⃣ Xử lý dữ liệu & Lọc trùng
    const uniqueUrls = new Set();
    const tasksToCreate = [];

    for (const item of inputCourses) {
      if (!item?.url) continue;

      // Clean URL
      const cleanUrl = transformToSamsungUdemy(item.url);
      if (!cleanUrl) continue;

      if (uniqueUrls.has(cleanUrl)) continue;
      uniqueUrls.add(cleanUrl);

      // Map dữ liệu vào Model (Snake Case)
      tasksToCreate.push({
        email: email,
        course_url: cleanUrl,
        status: 'pending',
        order_id: order_id.toString(),
        phone_number: phone_number || null, // Ưu tiên phone_number

        // Các trường này để null, worker hoặc webhook sẽ update sau
        title: null,
        price: 0,
        driver_url: null,
        driver_folder: null
      });
    }

    if (tasksToCreate.length === 0) {
      return res.status(400).json({ message: 'Không có URL hợp lệ sau khi lọc' });
    }

    // 5️⃣ Lưu vào DB
    const savedTasks = await DownloadTask.bulkCreate(tasksToCreate);

    console.log(`✅ [DB] Đã queue ${savedTasks.length} task. OrderID: ${order_id}`);

    for (const task of savedTasks) {
      downloadWorker.processTask(task);
    }
    return res.status(200).json({
      status: 'queued',
      message: `Đã nhận ${savedTasks.length} khóa học`,
      order_id: order_id,
      urls: Array.from(uniqueUrls)
    });

  } catch (err) {
    console.error("❌ Controller Error:", err);
    return res.status(500).json({ message: 'Lỗi server nội bộ' });
  }
};