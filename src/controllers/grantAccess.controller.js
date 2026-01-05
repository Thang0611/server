// const crypto = require('crypto');
// const axios = require('axios');
// const https = require('https'); // Để fix lỗi SSL
// const { extractIdFromUrl, grantReadAccess } = require('../utils/drive.util');
// const transporter = require('../config/email');
// require('dotenv').config();

// // CẤU HÌNH
// const SECRET_KEY = process.env.SECRET_KEY || 'KEY_BAO_MAT_CUA_BAN_2025';
// const WORDPRESS_URL = 'https://khoahocgiare.info';
// const EMAIL_USER = process.env.EMAIL_USER;
// const ADMIN_EMAIL = 'admin@khoahocgiare.info'; // <--- NHẬP EMAIL ADMIN CỦA BẠN VÀO ĐÂY

// exports.grantAccess = async (req, res) => {
//     // 1. Response ngay cho WP đỡ chờ
//     res.json({ status: 'received', message: 'Processing...' });

//     const { order_id, email, courses } = req.body;

//     try {
//         console.log(`[Processing] Order #${order_id} - Email: ${email}`);

//         // --- VALIDATE INPUT ---
//         if (!email || !courses || !Array.isArray(courses)) {
//             throw new Error('Dữ liệu đầu vào không hợp lệ (Thiếu email hoặc courses)');
//         }

//         const successList = [];
//         const failedList = [];

//         // --- XỬ LÝ CẤP QUYỀN ---
//         for (const item of courses) {
//             let finalUrl = item.drive_link;
//             if (finalUrl && finalUrl.includes('samsungu.')) finalUrl = finalUrl.replace('samsungu.', '');
            
//             const fileId = extractIdFromUrl(finalUrl);

//             // Logic: Nếu fileId lỗi hoặc cấp quyền false -> Đẩy vào FailedList
//             if (fileId && await grantReadAccess(fileId, email)) {
//                 successList.push({ name: item.course_name, url: finalUrl });
//             } else {
//                 failedList.push({ 
//                     name: item.course_name, 
//                     reason: fileId ? 'Lỗi Google API (Check log)' : 'Link Drive sai định dạng',
//                     link: finalUrl 
//                 });
//             }
//         }

//         // =====================================================================
//         // LOGIC QUYẾT ĐỊNH: THÀNH CÔNG HAY THẤT BẠI?
//         // =====================================================================

//         // TRƯỜNG HỢP CÓ LỖI (Dù chỉ 1 lỗi nhỏ) => GỬI EMAIL ADMIN
//         if (failedList.length > 0) {
//             console.error(`❌ Đơn #${order_id} có lỗi. Dừng quy trình, báo Admin.`);
//             await sendAdminAlert(order_id, email, failedList, 'Có khóa học cấp quyền thất bại');
//             // KHÔNG gọi axios về WordPress -> Đơn hàng sẽ treo ở Processing để bạn vào check
//             return; 
//         }

//         // TRƯỜNG HỢP THÀNH CÔNG 100%
//         if (successList.length > 0 && failedList.length === 0) {
            
//             // 1. Gửi mail cho khách
//             await sendSuccessEmail(email, order_id, successList);

//             // 2. Báo hoàn thành về WordPress
//             const agent = new https.Agent({ rejectUnauthorized: false }); // Fix lỗi SSL
            
//             await axios.post(`${WORDPRESS_URL}/wp-json/nht-app/v1/complete-order`, {
//                 order_id: order_id,
//                 success: true,
//                 message: `✅ Auto Drive: Đã cấp quyền ${successList.length} khóa.`
//             }, {
//                 headers: { 'x-callback-secret': SECRET_KEY },
//                 httpsAgent: agent
//             });
            
//             console.log(`✅ Đơn #${order_id} hoàn tất 100%.`);
//         }

//     } catch (error) {
//         // TRƯỜNG HỢP LỖI CODE (Crash, Exception) => GỬI EMAIL ADMIN
//         console.error(`❌ FATAL ERROR #${order_id}:`, error.message);
//         await sendAdminAlert(order_id, email || 'Unknown', [], error.message);
//     }
// };

// // --- HÀM GỬI MAIL BÁO LỖI CHO ADMIN ---
// async function sendAdminAlert(orderId, customerEmail, failedList, errorMessage) {
//     try {
//         let errorDetail = '';
//         if (failedList.length > 0) {
//             errorDetail = failedList.map(f => `<li><strong>${f.name}</strong>: ${f.reason} <br>Link: ${f.link}</li>`).join('');
//         } else {
//             errorDetail = `<li>${errorMessage}</li>`;
//         }

//         await transporter.sendMail({
//             from: `"System Bot" <${EMAIL_USER}>`,
//             to: ADMIN_EMAIL, // Gửi cho Admin
//             subject: `⚠️ LỖI CẤP QUYỀN: Đơn hàng #${orderId}`,
//             html: `
//                 <h3>Có vấn đề cần xử lý thủ công!</h3>
//                 <p><strong>Order ID:</strong> ${orderId}</p>
//                 <p><strong>Khách hàng:</strong> ${customerEmail}</p>
//                 <p><strong>Trạng thái:</strong> <span style="color:red">Chưa hoàn thành trên Website</span></p>
//                 <hr>
//                 <h4>Chi tiết lỗi:</h4>
//                 <ul>${errorDetail}</ul>
//                 <p><em>Vui lòng kiểm tra và cấp quyền tay, sau đó hoàn thành đơn trên Web.</em></p>
//             `
//         });
//         console.log('📧 Đã gửi email cảnh báo cho Admin.');
//     } catch (e) {
//         console.error('Không gửi được email Admin:', e.message);
//     }
// }

// // --- HÀM GỬI MAIL KHÁCH (GIỮ NGUYÊN) ---
// async function sendSuccessEmail(email, orderId, successList) {
//     // ... (Code HTML gửi mail cho khách như cũ) ...
//     // Copy lại đoạn gửi mail HTML đẹp từ câu trả lời trước
//     const listHtml = successList.map((item, index) => {
//         return `<div>${index + 1}. ${item.name} - <a href="${item.url}">Mở Drive</a></div>`;
//     }).join('');

//     await transporter.sendMail({
//         from: `"KhoaHocGiaRe" <${EMAIL_USER}>`,
//         to: email,
//         subject: `✅ Tài liệu đơn hàng #${orderId}`,
//         html: `<h3>Xin chào,</h3><p>Đã cấp quyền thành công:</p>${listHtml}`
//     });
// }




// const crypto = require('crypto');
// const axios = require('axios');
// const { extractIdFromUrl, grantReadAccess } = require('../utils/drive.util');
// const transporter = require('../config/email');
// require('dotenv').config();

// // CẤU HÌNH
// const SECRET_KEY = process.env.SECRET_KEY || 'KEY_BAO_MAT_CUA_BAN_2025';
// const WORDPRESS_URL = 'https://khoahocgiare.info'; // Domain WordPress của bạn
// const EMAIL_USER = process.env.EMAIL_USER; // Email dùng để gửi đi

// exports.grantAccess = async (req, res) => {
//     // =========================================================================
//     // BƯỚC 1: TRẢ VỀ PHẢN HỒI NGAY LẬP TỨC (ACK)
//     // =========================================================================
//     // Giúp WordPress không bị treo (timeout) khi chờ gửi mail/cấp quyền
//     res.json({ 
//         status: 'received', 
//         message: 'Request received. Processing in background...' 
//     });

//     console.log('[API] 📥 Đã nhận Task. Đang xác thực và xử lý ngầm...');

//     // Lấy dữ liệu
//     const { order_id, email, courses } = req.body;
//     const receivedSignature = req.headers['x-signature'];
//     const timestamp = req.headers['x-timestamp'];

//     // =========================================================================
//     // BƯỚC 2: KIỂM TRA BẢO MẬT (SIGNATURE)
//     // =========================================================================
//     // Dù đã trả lời client, ta vẫn phải check bảo mật trước khi xử lý logic
//     try {
//         if (!receivedSignature || !timestamp || !order_id || !email || !courses) {
//             throw new Error('Thiếu dữ liệu bắt buộc (Signature, Email, Courses...)');
//         }

//         // Tạo chữ ký để so khớp: order_id + email + timestamp
//         const stringToSign = String(order_id) + String(email) + String(timestamp);
//         const expectedSignature = crypto
//             .createHmac('sha256', SECRET_KEY)
//             .update(stringToSign)
//             .digest('hex');

//         // So sánh chữ ký
//         if (expectedSignature !== receivedSignature) {
//             console.error(`❌ [Security] Chữ ký sai! Order: #${order_id}`);
//             // Vì đã res.json rồi nên không return res.status được nữa,
//             // Ta chỉ dừng xử lý và không gọi Callback hoàn thành.
//             return; 
//         }

//         console.log(`✅ Auth OK. Bắt đầu xử lý ${courses.length} khóa học cho: ${email}`);

//         // =====================================================================
//         // BƯỚC 3: XỬ LÝ CẤP QUYỀN DRIVE (Logic cũ + mới)
//         // =====================================================================
//         const successList = [];
//         const failedList = [];

//         for (const item of courses) {
//             const courseName = item.course_name;
//             let finalUrl = item.drive_link;

//             // --- Logic fix link Samsung (Từ code cũ) ---
//             if (finalUrl && finalUrl.includes('samsungu.')) {
//                 finalUrl = finalUrl.replace('samsungu.', '');
//                 // console.log(`🔸 Fix link Samsung: ...${finalUrl.slice(-20)}`);
//             }
//             // ------------------------------------------

//             // Tách ID và cấp quyền
//             const fileId = extractIdFromUrl(finalUrl);

//             if (!fileId) {
//                 console.warn(`⚠️ Link lỗi: ${courseName}`);
//                 failedList.push({ name: courseName, reason: 'Link không đúng định dạng' });
//                 continue;
//             }

//             // Gọi Utils cấp quyền
//             const isGranted = await grantReadAccess(fileId, email);

//             if (isGranted) {
//                 successList.push({ name: courseName, url: finalUrl });
//             } else {
//                 failedList.push({ name: courseName, reason: 'Lỗi API Google (Check server log)' });
//             }
//         }

//         // =====================================================================
//         // BƯỚC 4: GỬI EMAIL BÁO CÁO (Logic HTML từ code cũ)
//         // =====================================================================
//         if (successList.length > 0) {
//             await sendSuccessEmail(email, order_id, successList);
//         }

//         // =====================================================================
//         // BƯỚC 5: GỌI CALLBACK VỀ WORDPRESS (Báo hoàn tất)
//         // =====================================================================
//         console.log(`✅ Xong đơn #${order_id}. Success: ${successList.length}, Failed: ${failedList.length}. Báo lại WP...`);

//         await axios.post(`${WORDPRESS_URL}/wp-json/nht-app/v1/complete-order`, {
//             order_id: order_id,
//             success: true, // Coi là thành công dù có link lỗi (để Admin vào check note)
//             message: `Đã cấp quyền ${successList.length}/${courses.length} khóa. (Lỗi: ${failedList.length})`
//         }, {
//             headers: { 'x-callback-secret': SECRET_KEY }
//         });

//     } catch (error) {
//         console.error('❌ Lỗi xử lý Fatal:', error.message);

//         // Báo lỗi về WordPress để Admin biết mà xử lý tay
//         await axios.post(`${WORDPRESS_URL}/wp-json/nht-app/v1/complete-order`, {
//             order_id: order_id,
//             success: false,
//             message: `Lỗi Node.js: ${error.message}`
//         }, {
//             headers: { 'x-callback-secret': SECRET_KEY }
//         }).catch(err => console.error('Không gọi được Callback báo lỗi:', err.message));
//     }
// };

/**
 * Hàm gửi email tách riêng để code gọn hơn
 * (Sử dụng lại HTML template từ code cũ của bạn)
 */
// async function sendSuccessEmail(email, orderId, successList) {
//     try {
//         // Tạo HTML danh sách khóa học
//         const listHtml = successList.map((item, index) => {
//             return `
//             <div style="margin-bottom: 12px; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #4CAF50; border-radius: 4px;">
//                 <div style="font-weight: bold; color: #333; margin-bottom: 5px;">${index + 1}. ${item.name}</div>
//                 <a href="${item.url}" style="display: inline-block; background-color: #2196F3; color: #ffffff; text-decoration: none; padding: 8px 15px; border-radius: 4px; font-size: 14px; font-weight: bold;">
//                     📂 Mở thư mục Drive
//                 </a>
//             </div>`;
//         }).join('');

//         // Gửi mail
//         await transporter.sendMail({
//             from: `"KhoaHocGiaRe Support" <${EMAIL_USER}>`,
//             to: email,
//             subject: `✅ Đã kích hoạt: Đơn hàng #${orderId}`,
//             html: `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
//                     <h2 style="color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px;">Xin chào,</h2>
//                     <p>Hệ thống đã cấp quyền truy cập thành công cho email <strong>${email}</strong>.</p>
//                     <p>👇 <strong>Danh sách tài liệu của bạn:</strong></p>
                    
//                     ${listHtml}

//                     <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
//                     <div style="background-color: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; font-size: 14px;">
//                         <strong>💡 Lưu ý:</strong> Kiểm tra mục <strong>"Shared with me" (Được chia sẻ với tôi)</strong> trên Google Drive nếu không thấy folder.
//                     </div>
//                 </div>
//             `
//         });
//         console.log(`📧 Đã gửi email thông báo cho ${email}`);
//     } catch (error) {
//         console.error('⚠️ Lỗi gửi email (nhưng đã cấp quyền xong):', error.message);
//         // Không throw error để code vẫn chạy tiếp xuống phần callback báo thành công
//     }
// }



// // const crypto = require('crypto'); // Thư viện có sẵn của Node.js
// // const { extractIdFromUrl, grantReadAccess } = require('../utils/drive.util');
// // const transporter = require('../config/email');
// // require('dotenv').config();

// // // Đảm bảo SECRET_KEY giống hệt bên plugin WordPress
// // const SECRET_KEY = process.env.SECRET_KEY || 'KEY_BAO_MAT_CUA_BAN_2025';

// // exports.grantAccess = async (req, res) => {
// //     console.log('[Batch] 📥 Nhận yêu cầu cấp quyền từ WordPress');

// //     try {
// //         // 1. NHẬN DỮ LIỆU TỪ HEADER VÀ BODY
// //         const receivedSignature = req.headers['x-signature'];
// //         const timestamp = req.headers['x-timestamp'];
// //         const { order_id, email, courses } = req.body; // PHP gửi 'courses', không phải 'urls'

// //         // 2. VALIDATE INPUT CƠ BẢN
// //         if (!receivedSignature || !timestamp || !order_id || !email || !courses || !Array.isArray(courses)) {
// //             console.log("❌ Thiếu dữ liệu đầu vào");
// //             return res.status(400).json({ message: 'Thiếu dữ liệu bắt buộc (Signature, Email, Courses...)' });
// //         }

// //         // 3. XÁC THỰC CHỮ KÝ (HMAC SHA256)
// //         // Logic ghép chuỗi phải giống hệt PHP: order_id + email + timestamp
// //         const stringToSign = String(order_id) + String(email) + String(timestamp);
        
// //         const expectedSignature = crypto
// //             .createHmac('sha256', SECRET_KEY)
// //             .update(stringToSign)
// //             .digest('hex');

// //         // So sánh chữ ký (An toàn thời gian thực)
// //         if (expectedSignature !== receivedSignature) {
// //             console.log(`❌ Chữ ký sai! Kẻ tấn công hoặc sai Key.`);
// //             return res.status(403).json({ message: 'Xác thực thất bại. Chữ ký không khớp.' });
// //         }

// //         // 4. BẮT ĐẦU XỬ LÝ CẤP QUYỀN
// //         console.log(`✅ Auth OK. Xử lý ${courses.length} khóa học cho: ${email}`);
        
// //         const successList = [];
// //         const failedList = [];

// //         // Lặp qua danh sách khóa học (courses là mảng object { course_name, drive_link })
// //         for (const item of courses) {
// //             const courseName = item.course_name;
// //             let finalUrl = item.drive_link;

// //             // --- LOGIC RIÊNG: SỬA LINK SAMSUNG ---
// //             if (finalUrl && finalUrl.includes('samsungu.')) {
// //                 finalUrl = finalUrl.replace('samsungu.', '');
// //                 console.log(`   🔸 Đã fix link Samsung: ...${finalUrl.slice(-20)}`);
// //             }
// //             // -------------------------------------

// //             // Tách ID từ Link
// //             const fileId = extractIdFromUrl(finalUrl);

// //             if (!fileId) {
// //                 console.warn(`   ⚠️ Link lỗi: ${courseName}`);
// //                 failedList.push({ name: courseName, url: finalUrl, reason: 'Link không đúng định dạng Drive' });
// //                 continue;
// //             }

// //             // Gọi Google API cấp quyền
// //             const isGranted = await grantReadAccess(fileId, email);

// //             if (isGranted) {
// //                 // Lưu lại thông tin để gửi mail
// //                 successList.push({
// //                     name: courseName,
// //                     url: finalUrl
// //                 });
// //             } else {
// //                 failedList.push({ name: courseName, url: finalUrl, reason: 'Lỗi API Google' });
// //             }
// //         }

// //         // 5. GỬI EMAIL BÁO CÁO (CHỈ GỬI NẾU CÓ KHÓA THÀNH CÔNG)
// //         if (successList.length > 0) {
// //             // Tạo HTML danh sách đẹp hơn (có tên khóa học)
// //             const listHtml = successList.map((item, index) => {
// //                 return `
// //                 <div style="margin-bottom: 12px; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #4CAF50; border-radius: 4px;">
// //                     <div style="font-weight: bold; color: #333; margin-bottom: 5px;">${index + 1}. ${item.name}</div>
// //                     <a href="${item.url}" style="display: inline-block; background-color: #2196F3; color: #ffffff; text-decoration: none; padding: 8px 15px; border-radius: 4px; font-size: 14px; font-weight: bold;">
// //                         📂 Mở thư mục Drive
// //                     </a>
// //                 </div>`;
// //             }).join('');

// //             // Gửi mail
// //             await transporter.sendMail({
// //                 from: `"KhoaHocGiaRe Support" <${process.env.EMAIL_USER}>`,
// //                 to: email,
// //                 subject: `✅ Đã kích hoạt: Đơn hàng #${order_id}`,
// //                 html: `
// //                     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
// //                         <h2 style="color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px;">Xin chào,</h2>
// //                         <p>Hệ thống đã cấp quyền truy cập thành công cho email <strong>${email}</strong>.</p>
// //                         <p>👇 <strong>Danh sách tài liệu của bạn:</strong></p>
                        
// //                         ${listHtml}

// //                         <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
// //                         <div style="background-color: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; font-size: 14px;">
// //                             <strong>💡 Lưu ý:</strong> Kiểm tra mục <strong>"Shared with me" (Được chia sẻ với tôi)</strong> trên Google Drive nếu không thấy folder.
// //                         </div>
// //                     </div>
// //                 `
// //             });
// //             console.log(`📧 Đã gửi email thông báo cho ${email}`);
// //         }

// //         // 6. TRẢ KẾT QUẢ VỀ CLIENT (WORDPRESS)
// //         res.json({
// //             success: true,
// //             total: courses.length,
// //             success_count: successList.length,
// //             failed_count: failedList.length,
// //             results: { success: successList, failed: failedList }
// //         });

// //     } catch (error) {
// //         console.error('[Grant Access Error]', error);
// //         res.status(500).json({ message: 'Lỗi server nội bộ' });
// //     }
// // };


// const crypto = require('crypto');
// const axios = require('axios'); // Dùng để gọi ngược lại WordPress
// const { extractIdFromUrl, grantReadAccess } = require('../utils/drive.util');
// const transporter = require('../config/email');
// require('dotenv').config();

// const SECRET_KEY = process.env.SECRET_KEY || 'KEY_BAO_MAT_CUA_BAN_2025';
// const WORDPRESS_URL = 'https://khoahocgiare.info'; // Thay bằng domain của bạn

// exports.grantAccess = async (req, res) => {
//     // 1. TRẢ VỀ NGAY LẬP TỨC (ACK)
//     // Để Plugin WordPress không bị treo kết nối
//     res.json({ status: 'received', message: 'Processing in background...' });

//     console.log('[API] 📥 Đã nhận Task. Đang xử lý ngầm...');

//     const { order_id, email, courses } = req.body;
//     // (Bỏ qua bước check signature ở đây cho ngắn gọn, nhưng thực tế nên giữ để an toàn)
    
//     try {
//         const successList = [];
//         const failedList = [];

//         // 2. XỬ LÝ CẤP QUYỀN (Tốn thời gian)
//         for (const item of courses) {
//             let finalUrl = item.drive_link;
//             if (finalUrl && finalUrl.includes('samsungu.')) finalUrl = finalUrl.replace('samsungu.', '');
            
//             const fileId = extractIdFromUrl(finalUrl);
//             if (fileId && await grantReadAccess(fileId, email)) {
//                 successList.push({ name: item.course_name, url: finalUrl });
//             } else {
//                 failedList.push({ name: item.course_name, reason: 'Error' });
//             }
//         }

//         // 3. GỬI MAIL (Tốn thời gian)
//         if (successList.length > 0) {
//             await sendSuccessEmail(email, order_id, successList);
//         }

//         // 4. [QUAN TRỌNG] GỌI NGƯỢC LẠI WORDPRESS (CALLBACK)
//         console.log(`✅ Xong đơn #${order_id}. Đang báo lại cho WordPress...`);
        
//         await axios.post(`${WORDPRESS_URL}/wp-json/nht-app/v1/complete-order`, {
//             order_id: order_id,
//             success: true,
//             message: `Cấp quyền thành công ${successList.length} khóa.`
//         }, {
//             headers: { 'x-callback-secret': SECRET_KEY }
//         });

//     } catch (error) {
//         console.error('❌ Lỗi xử lý:', error.message);
        
//         // Báo lỗi về WordPress để Admin biết
//         await axios.post(`${WORDPRESS_URL}/wp-json/nht-app/v1/complete-order`, {
//             order_id: order_id,
//             success: false,
//             message: error.message
//         }, {
//             headers: { 'x-callback-secret': SECRET_KEY }
//         }).catch(err => console.error('Không gọi được Callback báo lỗi:', err.message));
//     }
// };

// async function sendSuccessEmail(email, orderId, list) {
//     // (Code gửi mail giữ nguyên)
// }


const axios = require('axios');
const https = require('https'); // Để fix lỗi SSL khi gọi về WP
const { extractIdFromUrl, grantReadAccess } = require('../utils/drive.util');
const transporter = require('../config/email');
require('dotenv').config();

// CẤU HÌNH
// const SECRET_KEY = process.env.SECRET_KEY || 'KEY_BAO_MAT_CUA_BAN_2025';
const SECRET_KEY = process.env.SECRET_KEY;

const WORDPRESS_URL = 'https://khoahocgiare.info'; // Không có dấu / ở cuối
const EMAIL_USER = process.env.EMAIL_USER;
const ADMIN_EMAIL = 'admin@khoahocgiare.info'; // Email Admin nhận cảnh báo

exports.grantAccess = async (req, res) => {
    // 1. Response ngay lập tức cho WordPress đỡ chờ (Timeout)
    // WordPress nhận được cái này sẽ in ra log "HTTP 200"
    res.json({ status: 'received', message: 'Node.js đang xử lý ngầm...' });

    const { order_id, email, courses } = req.body;
    const startTime = Date.now();

    console.log(`\n==================================================`);
    console.log(`🚀 [START] Bắt đầu xử lý Order #${order_id}`);
    console.log(`📧 Email khách: ${email}`);
    console.log(`📚 Số lượng: ${courses ? courses.length : 0} khóa`);

    try {
        // --- VALIDATE INPUT ---
        if (!email || !courses || !Array.isArray(courses)) {
            throw new Error('Dữ liệu đầu vào không hợp lệ (Thiếu email hoặc courses)');
        }

        const successList = [];
        const failedList = [];

        // --- LOOP XỬ LÝ TỪNG KHÓA ---
        for (const item of courses) {
            let finalUrl = item.drive_link || '';
            console.log(`👉 Đang xử lý: "${item.course_name}"`);

            // Fix link redirect (nếu có)
            if (finalUrl.includes('samsungu.')) finalUrl = finalUrl.replace('samsungu.', '');
            
            const fileId = extractIdFromUrl(finalUrl);

            if (!fileId) {
                console.warn(`   ⚠️ Lỗi: Link không chuẩn (${finalUrl})`);
                failedList.push({ 
                    name: item.course_name, 
                    reason: 'Link Drive sai định dạng', 
                    link: finalUrl 
                });
                continue;
            }

            console.log(`   🆔 File ID: ${fileId}`);

            try {
                // Gọi Google API
                const isGranted = await grantReadAccess(fileId, email);
                
                if (isGranted) {
                    console.log(`   ✅ Google API: Thành công.`);
                    successList.push({ name: item.course_name, url: finalUrl });
                } else {
                    console.error(`   ❌ Google API: Thất bại (Trả về false).`);
                    failedList.push({ 
                        name: item.course_name, 
                        reason: 'Google API từ chối (Lỗi quyền Bot)', 
                        link: finalUrl 
                    });
                }
            } catch (err) {
                console.error(`   ❌ Exception: ${err.message}`);
                failedList.push({ 
                    name: item.course_name, 
                    reason: `Lỗi hệ thống: ${err.message}`, 
                    link: finalUrl 
                });
            }
        }

        // =====================================================================
        // KẾT THÚC VÀ QUYẾT ĐỊNH
        // =====================================================================

        // TRƯỜNG HỢP 1: CÓ LỖI -> GỬI MAIL ADMIN -> DỪNG
        if (failedList.length > 0) {
            console.error(`❌ [FAILED] Đơn #${order_id} có lỗi. Đang báo Admin...`);
            await sendAdminAlert(order_id, email, failedList, 'Có khóa học cấp quyền thất bại');
            console.log(`📧 Đã gửi mail cảnh báo Admin.`);
            return; // Không gọi về WP để đơn hàng treo ở Processing cho Admin biết
        }

        // TRƯỜNG HỢP 2: THÀNH CÔNG 100%
        if (successList.length > 0 && failedList.length === 0) {
            console.log(`✅ [SUCCESS] Tất cả khóa học đã xong.`);

            // A. Gửi mail cho khách
            try {
                await sendSuccessEmail(email, order_id, successList);
                console.log(`📧 Đã gửi mail cho khách: ${email}`);
            } catch (mailErr) {
                console.error(`⚠️ Lỗi gửi mail khách: ${mailErr.message}`);
            }

            // B. Gọi Callback về WordPress
            console.log(`📡 Đang gọi về WordPress để hoàn tất đơn...`);
            
            // Agent để bỏ qua lỗi SSL (nếu server WP dùng SSL tự ký hoặc lỗi)
            const agent = new https.Agent({ rejectUnauthorized: false });

            try {
                const wpRes = await axios.post(`${WORDPRESS_URL}/wp-json/nht-app/v1/complete-order`, {
                    order_id: order_id,
                    success: true,
                    message: `✅ Auto Drive: Đã cấp quyền ${successList.length} khóa.`
                }, {
                    headers: { 'x-callback-secret': SECRET_KEY },
                    httpsAgent: agent,
                    timeout: 10000 // 10s
                });
                console.log(`📡 WordPress phản hồi: ${wpRes.status} ${wpRes.statusText}`);
            } catch (wpErr) {
                console.error(`⚠️ Lỗi gọi lại WP: ${wpErr.message}`);
                // Vẫn tính là thành công vì khách đã nhận được tài liệu
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`🏁 [DONE] Hoàn tất đơn #${order_id} trong ${duration}s`);
        console.log(`==================================================\n`);

    } catch (error) {
        // Lỗi nghiêm trọng (Crash code)
        console.error(`❌ FATAL ERROR #${order_id}:`, error.message);
        await sendAdminAlert(order_id, email || 'Unknown', [], error.message);
    }
};

// --- HELPER 1: GỬI MAIL ADMIN ---
async function sendAdminAlert(orderId, customerEmail, failedList, errorMessage) {
    try {
        let errorDetail = '';
        if (failedList.length > 0) {
            errorDetail = failedList.map(f => `<li><strong>${f.name}</strong>: ${f.reason} <br>Link: ${f.link}</li>`).join('');
        } else {
            errorDetail = `<li>${errorMessage}</li>`;
        }

        await transporter.sendMail({
            from: `"System Bot" <${EMAIL_USER}>`,
            to: ADMIN_EMAIL,
            subject: `⚠️ LỖI CẤP QUYỀN: Đơn hàng #${orderId}`,
            html: `
                <h3>Cần xử lý thủ công!</h3>
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Khách hàng:</strong> ${customerEmail}</p>
                <hr>
                <h4>Chi tiết lỗi:</h4>
                <ul>${errorDetail}</ul>
                <p><em>Vui lòng kiểm tra và cấp quyền tay.</em></p>
            `
        });
    } catch (e) {
        console.error('Không gửi được email Admin:', e.message);
    }
}

// --- HELPER 2: GỬI MAIL KHÁCH HÀNG ---
async function sendSuccessEmail(email, orderId, successList) {
    const listHtml = successList.map((item, index) => {
        return `<div style="margin-bottom:8px; padding:10px; background:#f9f9f9; border-left:4px solid #28a745;">
            <strong>${index + 1}. ${item.name}</strong><br>
            <a href="${item.url}" style="color:#007bff; text-decoration:none; font-weight:bold;">👉 Bấm vào đây để mở Google Drive</a>
        </div>`;
    }).join('');

    await transporter.sendMail({
        from: `"KhoaHocGiaRe" <${EMAIL_USER}>`,
        to: email,
        subject: `✅ Tài liệu đơn hàng #${orderId} đã sẵn sàng`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color:#28a745;">Cấp quyền thành công!</h2>
                <p>Xin chào,</p>
                <p>Hệ thống đã tự động thêm email <strong>${email}</strong> vào danh sách được phép truy cập tài liệu.</p>
                <hr style="border:0; border-top:1px solid #eee;">
                ${listHtml}
                <hr style="border:0; border-top:1px solid #eee;">
                <p style="font-size:13px; color:#666;"><em>Lưu ý: Vui lòng đăng nhập đúng email trên để xem tài liệu.</em></p>
            </div>
        `
    });
}