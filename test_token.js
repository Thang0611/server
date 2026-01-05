const crypto = require('crypto');

// 1. Cấu hình giống hệt Server
const SECRET_KEY = 'KEY_BAO_MAT_CUA_BAN_2025'; // Copy từ .env sang
const email = 'nguyenhuuthanga3@gmail.com';
const url = 'https://samsungu.udemy.com/course/digital-marketing-analytics-fundamentals-and-process/learn/';

// 2. Tạo Token
const data = email + url;
const token = crypto.createHmac('sha256', SECRET_KEY)
                    .update(data)
                    .digest('hex');

// 3. In ra kết quả để copy vào Postman
console.log('--- COPY DỮ LIỆU DƯỚI ĐÂY ĐỂ TEST ---');
console.log(JSON.stringify({
    email: email,
    url: url,
    token: token
}, null, 2));



