const fs = require('fs');

const inputFile = 'list.txt';
const outputFile = 'samsung_udemy_courses.txt';

const targetDomain = 'samsungu.udemy.com'; // Sửa thành samsungu.edumy nếu cần

fs.readFile(inputFile, 'utf8', (err, data) => {
    if (err) {
        console.error("Lỗi đọc file:", err);
        return;
    }

    // Sử dụng Regex để thay thế toàn bộ (g flag)
    // Thay thế www.udemy.com hoặc udemy.com
    let result = data.replace(/www\.udemy\.com/g, targetDomain);
    result = result.replace(/\/\/udemy\.com/g, `//${targetDomain}`);

    fs.writeFile(outputFile, result, 'utf8', (err) => {
        if (err) return console.log(err);
        console.log(`✅ Thành công! Đã xuất ra file ${outputFile}`);
    });
});