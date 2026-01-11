const { Order, DownloadTask, sequelize } = require('../models');
const { generateVietQR } = require('../utils/qrGenerator');
const bankConfig = require('../config/bank.config');

// --- 1. TẠO ĐƠN HÀNG ---
exports.createOrder = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { email, courses } = req.body;

        if (!email || !courses || courses.length === 0) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "Thiếu thông tin." });
        }

        // Tính tổng tiền
        const totalAmount = courses.reduce((sum, item) => sum + (item.price || 0), 0);

        // Tạo row tạm
        const tempCode = 'TMP_' + Date.now();
        const newOrder = await Order.create({
            order_code: tempCode,
            user_email: email,
            total_amount: totalAmount,
            payment_status: 'pending',
            items: courses.map(c => ({
                course_url: c.url,
                title: c.title || 'Unknown',
                price: c.price || 0,
                status: 'pending'
            }))
        }, { include: ['items'], transaction: t });

        // Update mã chuẩn (DH000...)
        const finalOrderCode = 'DH' + String(newOrder.id).padStart(6, '0');
        await newOrder.update({ order_code: finalOrderCode }, { transaction: t });

        await t.commit();

        // Gọi Utils để lấy link QR
        const qrUrl = generateVietQR(totalAmount, finalOrderCode);

        return res.json({
            success: true,
            orderCode: finalOrderCode,
            amount: totalAmount,
            qrUrl: qrUrl,
            bankInfo: {
                bankName: bankConfig.BANK_ID,
                accountNo: bankConfig.ACCOUNT_NO,
                accountName: bankConfig.ACCOUNT_NAME
            }
        });

    } catch (error) {
        await t.rollback();
        console.error("Lỗi Create Order:", error);
        return res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

// --- 2. WEBHOOK XỬ LÝ THANH TOÁN ---
exports.handleWebhook = async (req, res) => {
    try {
        const { transferContent, transferAmount } = req.body;
        
        // Regex tìm mã đơn (DH + số)
        const match = transferContent.match(/DH\d+/i);
        if (!match) return res.json({ success: true }); // Không tìm thấy mã -> Vẫn báo success để gateway không retry

        const orderCode = match[0].toUpperCase();

        const order = await Order.findOne({ 
            where: { order_code: orderCode },
            include: ['items'] // Alias 'items' phải khớp trong model
        });

        // Các lớp bảo vệ
        if (!order) return res.json({ success: true });
        if (order.payment_status === 'paid') return res.json({ success: true });
        if (parseFloat(transferAmount) < parseFloat(order.total_amount)) return res.json({ success: true });

        // Cập nhật Database (Dùng transaction)
        await sequelize.transaction(async (t) => {
            await order.update({ 
                payment_status: 'paid',
                payment_gateway_data: req.body 
            }, { transaction: t });

            // Kích hoạt bot download
            await DownloadTask.update(
                { status: 'processing' },
                { where: { order_id: order.id }, transaction: t }
            );
        });

        console.log(`✅ Thanh toán thành công: ${orderCode}`);
        
        // TODO: Có thể bắn email xác nhận tại đây
        
        return res.json({ success: true });

    } catch (error) {
        console.error("Lỗi Webhook:", error);
        return res.json({ success: true }); // Luôn return true với webhook để tránh spam
    }
};

// --- 3. CHECK TRẠNG THÁI ---
exports.checkStatus = async (req, res) => {
    try {
        const order = await Order.findOne({ 
            where: { order_code: req.params.orderCode },
            attributes: ['payment_status'] // Chỉ lấy trường cần thiết cho nhẹ
        });
        
        if (!order) return res.status(404).json({ success: false });
        return res.json({ success: true, status: order.payment_status });
    } catch (e) {
        return res.status(500).json({ success: false });
    }
};