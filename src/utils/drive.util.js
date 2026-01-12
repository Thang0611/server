/**
 * Google Drive utility functions
 * @module utils/drive
 */

const { google } = require('googleapis');
const path = require('path');
const Logger = require('./logger.util');

// Load service account key file
const KEY_FILE_PATH = path.join(__dirname, '../../service-account.json');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });


/**
 * Extracts Google Drive file/folder ID from URL or raw ID
 * Supports multiple URL formats and raw IDs
 * @param {string} input - URL or raw ID
 * @returns {string|null} - Extracted ID or null if not found
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
 * Finds a folder by name on Google Drive
 * @param {string} folderName - Name of the folder to find
 * @returns {Promise<Object|null>} - Folder object with id, name, webViewLink or null if not found
 */
const findFolderByName = async (folderName) => {
    try {
        // Find folder, ensure it's not in trash
        const res = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
            fields: 'files(id, name, webViewLink)',
        });
        
        if (res.data.files.length > 0) {
            return res.data.files[0];
        }
        return null;
    } catch (error) {
        Logger.error('Error finding Drive folder', error, { folderName });
        return null;
    }
};

/**
 * Grants read (Viewer) access to email
 * @param {string} fileId - Google Drive file/folder ID
 * @param {string} userEmail - Email to grant access to
 * @returns {Promise<boolean>} - True if successful
 */
const grantReadAccess = async (fileId, userEmail) => {
    try {
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'user',
                emailAddress: userEmail,
            },
        });
        Logger.info('Granted Drive access', { fileId, userEmail });
        return true;
    } catch (error) {
        Logger.error('Error granting Drive access', error, { fileId, userEmail });
        return false;
    }
};

module.exports = { findFolderByName, grantReadAccess,extractIdFromUrl };