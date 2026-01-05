const DownloadTask = require('../models/downloadTask.model');
const { verifyRequestSignature } = require('../utils/hash.util');
const { transformToNormalizeUdemyCourseUrl,transformToSamsungUdemy } = require('../utils/url.util');
const downloadWorker = require('../workers/download.worker');

exports.download = async (req, res) => {
  console.log("📥 [Req] Nhận yêu cầu mới...");
  console.log(req.body);

  try {
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    const { order_id, email, urls, courses } = req.body;

    // 1️⃣ Validate input cơ bản
    if (!signature || !timestamp || !order_id || !email) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    // 2️⃣ Verify signature
    const isValid = verifyRequestSignature(order_id, email, timestamp, signature);
    if (!isValid) {
      return res.status(403).json({ message: 'Sai chữ ký bảo mật' });
    }

    // 3️⃣ Chuẩn hoá input list
    let inputCourses = [];

    if (Array.isArray(courses)) {
      inputCourses = courses;
    } else if (Array.isArray(urls)) {
      inputCourses = urls.map(url => ({ url }));
    }

    if (inputCourses.length === 0) {
      return res.status(400).json({ message: 'Không có khóa học hợp lệ' });
    }

    // 4️⃣ Normalize + filter URL
    const uniqueUrls = new Set();
    const tasksToCreate = [];

    for (const item of inputCourses) {
      if (!item?.url) continue;

      const cleanUrl = transformToSamsungUdemy(item.url);
      if (!cleanUrl) continue;

      if (uniqueUrls.has(cleanUrl)) continue;
      uniqueUrls.add(cleanUrl);
      const vnTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      tasksToCreate.push({
        email,
        order_id,
        course_url: cleanUrl,
        status: 'pending',
        created_at: vnTime
      });
    }

    if (tasksToCreate.length === 0) {
      return res.status(400).json({ message: 'Không có link Udemy hợp lệ' });
    }

    // 5️⃣ Lưu DB
    const savedTasks = await DownloadTask.bulkCreate(tasksToCreate);

    // 6️⃣ Gửi worker xử lý
    for (const task of savedTasks) {
      downloadWorker.processTask(task);
    }

    return res.status(200).json({
      status: 'queued',
      message: `Đã nhận ${savedTasks.length} khóa học`,
      urls: Array.from(uniqueUrls),
      order_id
    });

  } catch (err) {
    console.error("❌ Controller Error:", err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
};
