const crypto = require('crypto');

// 1. Cấu hình (Phải khớp với Server)
const SECRET_KEY = 'homnaylanoel'; // Thay bằng key trong .env của bạn
const email = 'nguyenhuuthanga3@gmail.com';
const urls = [
    "https://drive.google.com/drive/u/1/folders/1eL2oCyq5CFPtCmAp7VDg-hheVgXWFmq9",
    "1_kck6l_Undc8ZrLKlfu_aBDvAVNJNA0s"
];

// 2. Tạo chuỗi dữ liệu: email + url1 + url2 + ...
const dataString = email + urls.join('');

// 3. Hash HMAC SHA256
const token = crypto.createHmac('sha256', SECRET_KEY)
                    .update(dataString)
                    .digest('hex');

// 4. In ra JSON để copy vào Postman
console.log(JSON.stringify({
    email: email,
    token: token,
    urls: urls
}, null, 4));