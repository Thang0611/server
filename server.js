require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sequelize = require('./src/config/database');
const downloadRoutes = require('./src/routes/download.routes');
const DownloadTask = require('./src/models/downloadTask.model');
const transporter = require('./src/config/email'); // Nhớ file config email của bạn
const webhookRoutes = require('./src/routes/webhook.routes');
const grantAccess = require('./src/routes/grantAccess.routes');
const infoCourse =require('./src/routes/infoCourse.routes')
const enroll =require('./src/routes/enroll.routes')
const cors = require('cors'); // Import thư viện

const corsOptions = {
    origin: 'https://khoahocgiare.info', // Thay bằng domain WordPress của bạn (không có dấu / ở cuối)
    optionsSuccessStatus: 200, // Một số trình duyệt cũ cần cái này
    methods: "GET, POST", // Các phương thức cho phép
};

const app = express();
app.use(cors(corsOptions))
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1', downloadRoutes);
app.use('/api/v1/webhook', webhookRoutes);
app.get('/', (req, res) => {
    console.log("Hello world")
    res.send("Hello World - Server is running!");
});
app.use('/api/v1', infoCourse);
app.use('/api/v1', enroll);


// ---> THÊM DÒNG NÀY

app.use('/api/v1', grantAccess);
const PORT = process.env.PORT;


// Khởi động Server
sequelize.sync().then(async () => {
    console.log('[Database] Kết nối thành công.');

    // --- CẢNH BÁO QUAN TRỌNG ---
    // Mình đã REMOVE đoạn "Reset Zombie Tasks" vì file Python đang chạy độc lập.
    // Nếu bạn reset ở đây, khi Node.js restart, nó sẽ phá hỏng các task mà Python đang tải.
    app.listen(PORT,'0.0.0.0', () => {
        console.log(`Server Node.js (API) đang chạy tại cổng ${PORT}`);
        
        // CHỈ chạy logic gửi mail, KHÔNG chạy logic download
        // Ví dụ: Quét email mỗi 1 phút
        // setInterval(processEmailQueue, 60000); 
    });
}).catch(err => {
    console.error('[Database] Lỗi kết nối:', err);
});