const { google } = require('googleapis');
const path = require('path');

// Load file json service account bạn vừa tải
const KEY_FILE_PATH = path.join(__dirname, '../../service-account.json');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });


// --- HÀM MỚI: Tách ID từ Link Drive ---
/**
 * Hàm tách ID thông minh (Hỗ trợ cả URL và Raw ID)
 */
const extractIdFromUrl = (input) => {
    try {
        if (!input) return null;
        const text = input.trim(); // Xóa khoảng trắng thừa

        // CASE 1: Input là ID "trần" (Ví dụ: 17bbWrDQXmE4Ls8cHNBXGxI6RBD910LXg)
        // Regex: Bắt đầu (^) đến Kết thúc ($) chỉ chứa chữ, số, gạch ngang, gạch dưới.
        // Độ dài tối thiểu 25 ký tự (ID Google Drive thường là 33 hoặc dài hơn).
        const rawIdPattern = /^[-_\w]{25,}$/;
        
        if (rawIdPattern.test(text)) {
            return text; // Trả về nguyên gốc
        }

        // CASE 2: Input là URL (Chứa https, folder, file...)
        const urlPatterns = [
            /\/folders\/([-_\w]{25,})/,  // Bắt sau /folders/
            /\/d\/([-_\w]{25,})/,        // Bắt sau /d/ (Link file)
            /id=([-_\w]{25,})/,          // Bắt sau id=
            /([-_\w]{25,})/              // Fallback: Cố bắt chuỗi ID trong đám lộn xộn
        ];

        for (const pattern of urlPatterns) {
            const match = text.match(pattern);
            // match[1] là nhóm trong ngoặc (), match[0] là cả cụm khớp
            if (match) return match[1] || match[0];
        }

        return null;
    } catch (e) {
        return null;
    }
};

/**
 * Tìm ID của folder dựa trên tên (Vì Rclone chỉ biết tên)
 */
const findFolderByName = async (folderName) => {
    try {
        // Tìm folder, đảm bảo không nằm trong thùng rác
        const res = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
            fields: 'files(id, name, webViewLink)',
        });
        
        if (res.data.files.length > 0) {
            return res.data.files[0]; // Trả về folder tìm thấy đầu tiên
        }
        return null;
    } catch (error) {
        console.error('Lỗi tìm folder Drive:', error.message);
        return null;
    }
};

/**
 * Cấp quyền đọc (Viewer) cho email
 */
const grantReadAccess = async (fileId, userEmail) => {
    try {
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader', // Hoặc 'writer' nếu muốn cho sửa
                type: 'user',
                emailAddress: userEmail,
            },
        });
        console.log(`[Drive] Đã cấp quyền cho ${userEmail}`);
        return true;
    } catch (error) {
        console.error('Lỗi cấp quyền Drive:', error.message);
        return false;
    }
};

module.exports = { findFolderByName, grantReadAccess,extractIdFromUrl };