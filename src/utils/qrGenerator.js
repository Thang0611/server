const bankConfig = require('../config/bank.config');

/**
 * Hàm tạo URL QR Code VietQR
 * @param {number} amount - Số tiền
 * @param {string} content - Nội dung chuyển khoản (Mã đơn hàng)
 */
const generateVietQR = (amount, content) => {
    const { BANK_ID, ACCOUNT_NO, TEMPLATE, ACCOUNT_NAME } = bankConfig;
    
    // Encode tên để tránh lỗi ký tự đặc biệt trên URL
    const encodedName = encodeURIComponent(ACCOUNT_NAME);
    
    // Format chuẩn VietQR
    return `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-${TEMPLATE}.png?amount=${amount}&addInfo=${content}&accountName=${encodedName}`;
};

module.exports = { generateVietQR };