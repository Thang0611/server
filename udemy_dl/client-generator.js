// client-generator.js
const crypto = require('crypto');

const secret = 'Chuoi_Bi_Mat_Cua_Ban_Dung_De_Lo_Ra_Ngoai_!!!'; // Phải trùng với server
const email = 'nht@test.com';
const url = 'https://www.udemy.com/course/test-course/';

// Logic tạo token y hệt server
const data = email + url;
const token = crypto.createHmac('sha256', secret).update(data).digest('hex');

console.log('Email:', email);
console.log('URL:', url);
console.log('Token:', token); 
// Copy Token này bỏ vào Postman