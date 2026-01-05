// // src/utils/hash.util.js
// const crypto = require('crypto');

// // Lấy secret key từ môi trường
// const SECRET_KEY = process.env.API_SECRET_KEY;

// if (!SECRET_KEY) {
//     console.error("CẢNH BÁO: Chưa cấu hình API_SECRET_KEY trong .env");
// }

// /**
//  * Hàm tạo Token chuẩn HMAC-SHA256
//  */
// const generateToken = (email, url) => {
//     // Dữ liệu cần băm = email + url (hoặc nối chuỗi tùy quy ước của bạn)
//     const data = email + url;
    
//     // Sử dụng HMAC update secret key
//     return crypto.createHmac('sha256', SECRET_KEY)
//                  .update(data)
//                  .digest('hex');
// };

// /**
//  * [MỚI] Xác thực Token cho danh sách URL (API Batch)
//  * Quy tắc: Hash( email + url[0] + url[1] + ... + url[n] )
//  */
// const verifyBatchToken = (email, urls, clientToken) => {
//     if (!clientToken || !SECRET_KEY || !Array.isArray(urls)) return false;

//     // Nối email với tất cả các url trong mảng thành 1 chuỗi liền mạch
//     const data = email + urls.join('');
    
//     // Tạo Hash HMAC SHA256
//     const serverHash = crypto.createHmac('sha256', SECRET_KEY)
//                              .update(data)
//                              .digest('hex');

//     // So sánh an toàn
//     const bufferServer = Buffer.from(serverHash);
//     const bufferClient = Buffer.from(clientToken);

//     if (bufferServer.length !== bufferClient.length) return false;
//     return crypto.timingSafeEqual(bufferServer, bufferClient);
// };

// /**
//  * Hàm kiểm tra Token
//  * Sử dụng timingSafeEqual để chống tấn công phân tích thời gian
//  */
// const verifyToken = (email, url, clientToken) => {
//     if (!clientToken) return false;

//     // 1. Server tự tính toán lại hash chuẩn
//     const serverHash = generateToken(email, url);

//     // 2. So sánh serverHash với clientToken
//     // Chuyển về Buffer để so sánh an toàn
//     const bufferServer = Buffer.from(serverHash);
//     const bufferClient = Buffer.from(clientToken);

//     // Nếu độ dài không bằng nhau thì sai luôn (tránh lỗi crash buffer)
//     if (bufferServer.length !== bufferClient.length) return false;

//     // So sánh an toàn
//     return crypto.timingSafeEqual(bufferServer, bufferClient);
// };

// module.exports = { generateToken, verifyToken ,verifyBatchToken};


/* src/utils/hash.util.js */
const crypto = require('crypto');
require('dotenv').config();

// Lấy Secret Key (Đảm bảo giống hệt bên plugin WordPress)
const SECRET_KEY = process.env.SECRET_KEY ;
// const SECRET_KEY = process.env.SECRET_KEY || 'KEY_BAO_MAT_CUA_BAN_2025';


if (!SECRET_KEY) {
    console.error("⚠️ CẢNH BÁO: Chưa cấu hình SECRET_KEY trong .env");
}

/**
 * Hàm xác thực chữ ký (Signature) từ WordPress
 * Logic: HMAC_SHA256( order_id + email + timestamp )
 * * @param {string|number} orderId - ID đơn hàng
 * @param {string} email - Email khách hàng
 * @param {string|number} timestamp - Thời gian gửi (Unix timestamp)
 * @param {string} clientSignature - Chữ ký nhận được từ Header (X-Signature)
 * @returns {boolean} - True nếu hợp lệ, False nếu sai
 */
const verifyRequestSignature = (orderId, email, timestamp, clientSignature) => {
    // 1. Kiểm tra dữ liệu đầu vào
    if (!clientSignature || !SECRET_KEY || !orderId || !email || !timestamp) {
        return false;
    }

    // 2. Tạo chuỗi dữ liệu để hash
    // QUAN TRỌNG: Phải ép kiểu String() cho từng biến.
    // Lý do: Bên PHP dùng toán tử nối chuỗi (.) -> "123" . "email" . "time"
    // Bên JS nếu orderId là số (Int) mà dùng dấu (+) có thể gây lỗi hoặc ra kết quả khác.
    const payload = String(orderId) + String(email) + String(timestamp);
    
    // 3. Server tự tính toán lại Hash (Expected Signature)
    const expectedSignature = crypto
        .createHmac('sha256', SECRET_KEY)
        .update(payload)
        .digest('hex');

    // 4. So sánh an toàn (Timing Safe Equal)
    // Chống tấn công Timing Attack (kẻ tấn công đoán thời gian phản hồi để dò key)
    try {
        const bufferExpected = Buffer.from(expectedSignature);
        const bufferClient = Buffer.from(clientSignature);

        // Nếu độ dài hash không bằng nhau thì return false ngay
        // (Hàm timingSafeEqual sẽ lỗi nếu độ dài 2 buffer khác nhau)
        if (bufferExpected.length !== bufferClient.length) {
            return false;
        }

        return crypto.timingSafeEqual(bufferExpected, bufferClient);
    } catch (error) {
        // Phòng trường hợp clientSignature gửi lên chuỗi không phải hex hợp lệ
        console.error('Lỗi so sánh chữ ký:', error.message);
        return false; 
    }
};

module.exports = { 
    verifyRequestSignature 
};