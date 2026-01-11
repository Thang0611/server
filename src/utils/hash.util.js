


/* src/utils/hash.util.js */
const crypto = require('crypto');
require('dotenv').config();

// Lấy Secret Key (Đảm bảo giống hệt bên plugin WordPress)
const SECRET_KEY = process.env.SECRET_KEY;
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
    console.log("--- DEBUG SIGNATURE ---");
    console.log("📥 Client gửi: ", clientSignature);
    console.log("🧮 Server tính: ", expectedSignature); // Thay biến này bằng biến chứa hash server tính
    console.log("🔑 Secret Key: ", process.env.SECRET_KEY); // Kiểm tra xem có nhận được key không
    console.log("📄 Chuỗi gốc: ", /* Biến chứa chuỗi order_id+email+timestamp */);
    console.log("-----------------------");
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