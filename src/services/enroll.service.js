/**
 * Enroll service for handling course enrollment business logic
 * @module services/enroll
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { transformToNormalizeUdemyCourseUrl, transformToSamsungUdemy } = require('../utils/url.util');
const DownloadTask = require('../models/downloadTask.model');
const Logger = require('../utils/logger.util');
const lifecycleLogger = require('./lifecycleLogger.service');
const { Op } = require('sequelize');

// --- CẤU HÌNH ---
const ssSUBDOMAIN = 'samsungu.udemy.com';
const COOKIE_FILE_PATH = path.join(__dirname, '../../cookies.txt');

// --- HELPER FUNCTIONS ---

const getCookieFromFile = () => {
    try {
        if (!fs.existsSync(COOKIE_FILE_PATH)) throw new Error("⚠️ Không tìm thấy file cookies.txt");
        return fs.readFileSync(COOKIE_FILE_PATH, 'utf8').replace(/(\r\n|\n|\r)/gm, "").trim();
    } catch (err) {
        throw new Error(err.message);
    }
};

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * [UPDATE] Hàm lấy Course ID mạnh mẽ (Retry + Deep Regex + Anti-bot)
 */
const getCourseInfo = async (rawUrl, cookieString) => {
    const { gotScraping } = await import('got-scraping');

    let targetUrl = rawUrl.trim();

    // ✅ FIX: Always transform URL to samsungu.udemy.com for enrollment
    // This ensures we use SamsungU tenant for all enrollments
    if (!targetUrl.includes('samsungu.udemy.com')) {
         const transformed = transformToSamsungUdemy(targetUrl);
         if (transformed) {
             targetUrl = transformed;
         } else {
             // Fallback: if transform fails, try normalize then transform
             const normalized = transformToNormalizeUdemyCourseUrl(targetUrl);
             if (normalized) {
                 targetUrl = transformToSamsungUdemy(normalized) || normalized;
             }
         }
    }

    Logger.debug('Scraping course info', { targetUrl });

    // 2. Vòng lặp Retry (Thử lại tối đa 3 lần)
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                Logger.debug('Retrying course info fetch', { attempt, targetUrl });
                await wait(2000 * attempt); // Đợi 2s, 4s...
            }

            const response = await gotScraping({
                url: targetUrl,
                method: 'GET',
                http2: true, // Bật HTTP2 để giống trình duyệt thật
                headerGeneratorOptions: {
                    browsers: [{ name: 'chrome', minVersion: 110 }],
                    devices: ['desktop'],
                    operatingSystems: ['windows'],
                },
                headers: {
                    'Cookie': cookieString,
                    'Referer': targetUrl,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Upgrade-Insecure-Requests': '1',
                },
                https: { rejectUnauthorized: false },
                retry: { limit: 0 }, // Tắt retry mặc định của thư viện để tự handle
                timeout: { request: 15000 } // Timeout 15s
            });

            // Nếu bị redirect về Login/SSO -> Cookie chết hoặc không có quyền -> Dừng ngay
            if (response.url.includes('login') || response.url.includes('sso')) {
                throw new Error("Cookie hết hạn hoặc không có quyền truy cập (Redirected to Login).");
            }

            const html = response.body;
            const $ = cheerio.load(html);
            let courseId = null;

            // --- CHIẾN THUẬT TÌM ID ---
            
            // Cách 1: Tìm trong Attributes (Udemy thường)
            courseId = $("body").attr("data-clp-course-id") || 
                       $("body").attr("data-course-id") ||
                       $("div[data-course-id]").attr("data-course-id") ||
                       $("div[data-clp-course-id]").attr("data-clp-course-id");

            // Cách 2: Tìm trong Scripts JSON (Udemy Business/SamsungU thường giấu ở đây)
            if (!courseId) {
                // Tìm trong script tags với JSON data
                const scriptTags = $('script').toArray();
                for (const script of scriptTags) {
                    const scriptContent = $(script).html() || '';
                    if (scriptContent) {
                        // ✅ FIX: Thêm nhiều patterns hơn để tìm Course ID
                        const patterns = [
                            /"courseId"\s*:\s*(\d+)/,
                            /"course_id"\s*:\s*(\d+)/,
                            /"id"\s*:\s*(\d+)(?:\s*,\s*"title"|\s*,\s*"name")/,
                            /courseId["\s]*[:=]["\s]*(\d+)/,
                            /course_id["\s]*[:=]["\s]*(\d+)/,
                            /"id"\s*:\s*(\d+),\s*"type"\s*:\s*"course"/,
                            /"course"\s*:\s*\{[^}]*"id"\s*:\s*(\d+)/,
                            /window\.__INITIAL_STATE__[^}]*"courseId"\s*:\s*(\d+)/,
                            /window\.__INITIAL_STATE__[^}]*"id"\s*:\s*(\d+)[^}]*"type"\s*:\s*"course"/,
                            // ✅ Thêm patterns mới cho SamsungU
                            /"courseId":\s*(\d+)/,
                            /courseId:\s*(\d+)/,
                            /"course":\s*\{[^}]*"id":\s*(\d+)/,
                            /"context":\s*\{[^}]*"courseId":\s*(\d+)/,
                            /__UDEMY_INITIAL_STATE__[^}]*"courseId":\s*(\d+)/,
                            /__UDEMY_INITIAL_STATE__[^}]*"id":\s*(\d+)[^}]*"type":\s*"course"/
                        ];
                        
                        for (const pattern of patterns) {
                            const match = scriptContent.match(pattern);
                            if (match && match[1]) {
                                courseId = match[1];
                                Logger.debug('Found courseId in script tag', { 
                                    pattern: pattern.toString(),
                                    courseId 
                                });
                                break;
                            }
                        }
                        
                        // ✅ FIX: Thử parse JSON trực tiếp nếu có
                        if (!courseId && scriptContent.trim().startsWith('{')) {
                            try {
                                const jsonData = JSON.parse(scriptContent);
                                // Tìm courseId trong nested objects
                                const findCourseId = (obj) => {
                                    if (typeof obj !== 'object' || obj === null) return null;
                                    if (obj.courseId) return obj.courseId;
                                    if (obj.course_id) return obj.course_id;
                                    if (obj.id && obj.type === 'course') return obj.id;
                                    for (const key in obj) {
                                        const result = findCourseId(obj[key]);
                                        if (result) return result;
                                    }
                                    return null;
                                };
                                const foundId = findCourseId(jsonData);
                                if (foundId) {
                                    courseId = String(foundId);
                                    Logger.debug('Found courseId in parsed JSON', { courseId });
                                }
                            } catch (parseError) {
                                // Not valid JSON, continue
                            }
                        }
                        
                        if (courseId) break;
                    }
                }
            }

            // Cách 3: Tìm trong HTML body với nhiều regex patterns
            if (!courseId) {
                const regexList = [
                    /courseId=(\d+)/,                            // courseId=1565838 (found in HTML!)
                    /"courseId"\s*:\s*(\d+)/,                    // "courseId": 12345
                    /"course_id"\s*:\s*(\d+)/,                   // "course_id": 12345
                    /"id"\s*:\s*(\d+),\s*"title"/,               // "id": 12345, "title"
                    /"id"\s*:\s*(\d+),\s*"name"/,                // "id": 12345, "name"
                    /data-course-id="(\d+)"/,                    // Attribute cũ
                    /data-clp-course-id="(\d+)"/,                 // Attribute mới
                    /course_id&quot;:(\d+)/,                      // HTML Encoded
                    /courseId["\s]*[:=]["\s]*(\d+)/,             // Flexible format
                    /course_id["\s]*[:=]["\s]*(\d+)/,            // Flexible format
                    /\/course\/([^\/]+)\/(\d+)/,                 // URL pattern: /course/slug/12345
                    /"course"\s*:\s*\{[^}]*"id"\s*:\s*(\d+)/,   // Nested course object
                    /"context"\s*:\s*\{[^}]*"courseId"\s*:\s*(\d+)/, // Context object
                    /window\.Udemy\.courseId\s*=\s*(\d+)/,       // Window variable
                    /__INITIAL_STATE__[^}]*"courseId"\s*:\s*(\d+)/, // Initial state
                    // ✅ FIX: Thêm patterns mới cho SamsungU và các format khác
                    /courseId:\s*(\d+)/,                          // courseId: 12345 (no quotes)
                    /"courseId":\s*(\d+)/,                        // "courseId": 12345 (with quotes)
                    /course_id:\s*(\d+)/,                         // course_id: 12345
                    /"course_id":\s*(\d+)/,                       // "course_id": 12345
                    /\/api-2\.0\/courses\/(\d+)\//,              // API URL pattern
                    /\/courses\/(\d+)\//,                         // Course URL with ID
                    /"id":\s*(\d+)[^}]*"type":\s*"course"/,      // Course object with type
                    /__UDEMY_INITIAL_STATE__[^}]*"courseId":\s*(\d+)/, // Udemy initial state
                    /__UDEMY_INITIAL_STATE__[^}]*"id":\s*(\d+)[^}]*"type":\s*"course"/, // Udemy initial state with type
                ];

                for (const regex of regexList) {
                    const match = html.match(regex);
                    if (match && match[1]) {
                        courseId = match[1];
                        Logger.debug('Found courseId via regex', { 
                            pattern: regex.toString(),
                            courseId 
                        });
                        break;
                    }
                }
            }

            // Cách 4: Thử extract từ URL nếu có course slug
            if (!courseId) {
                const urlMatch = targetUrl.match(/\/course\/([^\/]+)\/?$/);
                if (urlMatch) {
                    const courseSlug = urlMatch[1];
                    Logger.debug('Trying to extract courseId from URL slug', { courseSlug });
                    // Note: This is a fallback, we still need the actual ID from HTML
                }
            }

            // Lấy Title
            let title = $('h1.ud-heading-xl').text().trim() || 
                        $('meta[property="og:title"]').attr('content') ||
                        $('title').text().replace('| Udemy', '').replace('| Udemy Business', '').trim();

            if (courseId) {
                return { 
                    courseId: parseInt(courseId), 
                    title: title || "Unknown Course Title" 
                };
            }

            // Nếu HTML trả về quá ngắn hoặc lạ -> Có thể bị chặn Anti-bot
            if (html.length < 5000) {
                Logger.error('HTML response too short', { 
                    htmlLength: html.length,
                    url: targetUrl,
                    attempt 
                });
                throw new Error("HTML trả về quá ngắn (Anti-bot detected).");
            }

            // Log debug info khi không tìm thấy Course ID
            Logger.error('Course ID not found in HTML', {
                url: targetUrl,
                attempt,
                htmlLength: html.length,
                hasBodyTag: html.includes('<body'),
                hasScriptTags: html.includes('<script'),
                sampleHtml: html.substring(0, 500) // First 500 chars for debugging
            });

            throw new Error("Không tìm thấy Course ID trong HTML.");

        } catch (e) {
            lastError = e;
            // Nếu lỗi liên quan đến Cookie/Login thì throw luôn, không retry vô ích
            if (e.message.includes("Cookie") || e.message.includes("Login")) {
                throw e;
            }
            Logger.warn('Course info fetch attempt failed', { attempt, error: e.message, targetUrl });
        }
    }

    // Nếu hết 3 lần vẫn lỗi
    throw lastError;
};

/**
 * Gửi request Enroll khóa học
 */
const enrollByGet = async (courseId, cookieString, refererUrl) => {
    const { gotScraping } = await import('got-scraping');
    
    // URL Enroll cho SamsungU
    const subscribeUrl = `https://${ssSUBDOMAIN}/course/subscribe/?courseId=${courseId}`;
    
    const response = await gotScraping({
        url: subscribeUrl,
        method: 'GET',
        http2: true,
        followRedirect: true,
        headerGeneratorOptions: {
            browsers: [{ name: 'chrome', minVersion: 110 }],
            devices: ['desktop'],
            operatingSystems: ['windows'],
        },
        headers: {
            'Host': ssSUBDOMAIN,
            'Cookie': cookieString,
            'Referer': refererUrl,
        },
        https: { rejectUnauthorized: false }
    });

    return { statusCode: response.statusCode, finalUrl: response.url };
};

// --- MAIN SERVICE ---

const enrollCourses = async (urls, email, orderId = null) => {
    if (!email) throw new Error("Yêu cầu Email để cập nhật Database.");

    const cookieString = getCookieFromFile();
    const results = [];

    Logger.info('Starting enrollment', { 
      email, 
      count: urls.length, 
      orderId: orderId || null,
      orderIdType: typeof orderId,
      orderIdValue: orderId
    });

    for (const rawUrl of urls) {
        // Store task ID outside try-catch for error handling
        let currentTaskId = null;
        let task = null;
        
        // ✅ FIX: Transform URL to samsungu.udemy.com before processing
        const transformedUrl = transformToSamsungUdemy(rawUrl) || rawUrl;
        
        Logger.debug('URL transformation for enrollment', {
            originalUrl: rawUrl,
            transformedUrl: transformedUrl
        });
        
        try {
            // ✅ FIX: Tìm Task trong DB - ưu tiên task có order_id và status 'processing'
            // Nếu có orderId, tìm task theo order_id + email + course_url + status 'processing'
            // Nếu không có orderId (null), tìm task với order_id IS NULL hoặc order_id = 0 (tương thích với DB)
            // Note: Tìm theo cả rawUrl và transformedUrl để tương thích với dữ liệu cũ
            
            if (orderId) {
                // Tìm task theo order_id (chính xác nhất)
                task = await DownloadTask.findOne({
                    where: { 
                        order_id: orderId,
                        email: email, 
                        [Op.or]: [
                            { course_url: rawUrl },
                            { course_url: transformedUrl }
                        ],
                        status: ['processing', 'pending'] // Chỉ lấy task chưa enroll
                    },
                    attributes: ['id', 'email', 'course_url', 'title', 'status', 'order_id'],
                    order: [['id', 'DESC']] // Lấy task mới nhất nếu có nhiều
                });
            } else {
                // ✅ FIX: Khi orderId = null (permanent downloads), tìm task với order_id IS NULL
                // Note: order_id = 0 không được phép do foreign key constraint
                task = await DownloadTask.findOne({
                    where: { 
                        order_id: null, // Tìm task không có order (permanent downloads)
                        email: email, 
                        [Op.or]: [
                            { course_url: rawUrl },
                            { course_url: transformedUrl }
                        ],
                        status: ['processing', 'pending'] // Chỉ lấy task chưa enroll
                    },
                    attributes: ['id', 'email', 'course_url', 'title', 'status', 'order_id'],
                    order: [['id', 'DESC']] // Lấy task mới nhất
                });
            }
            
            // Fallback: Nếu không tìm thấy với điều kiện trên, tìm task mới nhất với status processing/pending (bỏ qua order_id)
            if (!task) {
                task = await DownloadTask.findOne({
                    where: { 
                        email: email, 
                        [Op.or]: [
                            { course_url: rawUrl },
                            { course_url: transformedUrl }
                        ],
                        status: ['processing', 'pending'] // Chỉ lấy task chưa enroll
                    },
                    attributes: ['id', 'email', 'course_url', 'title', 'status', 'order_id'],
                    order: [['id', 'DESC']] // Lấy task mới nhất
                });
            }
            
            // Last fallback: Tìm bất kỳ task nào (cho backward compatibility)
            if (!task) {
                task = await DownloadTask.findOne({
                    where: { 
                        email: email, 
                        [Op.or]: [
                            { course_url: rawUrl },
                            { course_url: transformedUrl }
                        ]
                    },
                    attributes: ['id', 'email', 'course_url', 'title', 'status', 'order_id'],
                    order: [['id', 'DESC']]
                });
            }

            if (!task) {
                Logger.warn('Task not found in database', { email, url: rawUrl, transformedUrl });
                results.push({ success: false, url: rawUrl, message: 'Not found in DB' });
                continue;
            }

            // Store task ID for error handling
            currentTaskId = task.id;

            Logger.debug('Processing enrollment task', { taskId: currentTaskId, url: transformedUrl });

            // 2. Lấy Info (Retry & Regex) - Use transformed URL
            const { courseId, title } = await getCourseInfo(transformedUrl, cookieString);
            
            // 3. Enroll - Use transformed URL for referer
            Logger.debug('Enrolling course', { courseId, title, taskId: task.id, url: transformedUrl });
            const enrollResult = await enrollByGet(courseId, cookieString, transformedUrl);

            // ✅ FIX: Better enrollment success detection
            // Check multiple indicators to ensure enrollment actually succeeded
            const hasLoginRedirect = enrollResult.finalUrl.includes("login") || enrollResult.finalUrl.includes("sso");
            const hasCourseUrl = enrollResult.finalUrl.includes("/course/") && !hasLoginRedirect;
            const isSuccess = !hasLoginRedirect && (hasCourseUrl || enrollResult.statusCode === 200);
            const finalStatus = isSuccess ? 'enrolled' : 'failed';
            
            Logger.debug('Enrollment result', {
              taskId: task.id,
              finalUrl: enrollResult.finalUrl,
              statusCode: enrollResult.statusCode,
              hasLoginRedirect,
              hasCourseUrl,
              isSuccess,
              finalStatus
            });

            // 4. Update DB (chỉ cập nhật các trường cần thiết)
            const [updatedRows] = await DownloadTask.update(
                { title, status: finalStatus },
                {
                    where: { id: task.id },
                    fields: ['title', 'status']
                }
            );

            // ✅ FIX: Verify update succeeded
            if (updatedRows === 0) {
                throw new Error(`Failed to update task ${task.id} status to ${finalStatus}`);
            }

            // ✅ FIX: Refresh task to verify status was actually updated
            // Use transaction to ensure data consistency
            const updatedTask = await DownloadTask.findByPk(task.id, {
                attributes: ['id', 'status', 'title', 'order_id'],
                transaction: null // Explicit read after write
            });

            if (!updatedTask || updatedTask.status !== finalStatus) {
                throw new Error(`Status verification failed: expected ${finalStatus}, got ${updatedTask?.status}`);
            }

            Logger.success('Enrollment completed', { 
                taskId: task.id, 
                status: finalStatus,
                verified: true,
                orderId: updatedTask.order_id
            });

            // ✅ FIX: LIFECYCLE LOG - Only log SUCCESS after DB verification
            // CRITICAL: Only log if status is actually 'enrolled' in database
            if (isSuccess && updatedTask.status === 'enrolled') {
              // Double-check: Verify status one more time before logging
              const finalCheck = await DownloadTask.findByPk(task.id, {
                attributes: ['id', 'status', 'order_id']
              });
              
              if (finalCheck && finalCheck.status === 'enrolled' && finalCheck.order_id) {
                lifecycleLogger.logEnrollSuccess(
                  finalCheck.order_id,
                  task.id,
                  email,
                  transformedUrl
                );
              } else {
                // Status changed or missing order_id - log warning
                Logger.warn('Enrollment success logged but status mismatch in final check', {
                  taskId: task.id,
                  expectedStatus: 'enrolled',
                  actualStatus: finalCheck?.status,
                  hasOrderId: !!finalCheck?.order_id
                });
              }
            } else if (isSuccess && updatedTask.status !== 'enrolled') {
              // Enrollment API returned success but DB status is not 'enrolled'
              Logger.error('Enrollment API success but DB status mismatch', new Error('Status mismatch'), {
                taskId: task.id,
                apiSuccess: isSuccess,
                dbStatus: updatedTask.status,
                expectedStatus: 'enrolled'
              });
              
              // Log as error instead
              if (updatedTask.order_id) {
                lifecycleLogger.logEnrollError(
                  task.id,
                  `Enrollment API success but DB status is ${updatedTask.status} instead of 'enrolled'`,
                  { orderId: updatedTask.order_id, url: transformedUrl, email }
                );
              }
            }

            results.push({
                success: isSuccess,
                url: transformedUrl, // Return transformed URL
                courseId: courseId,
                title: title,
                db_id: task.id,
                status: finalStatus
            });

        } catch (err) {
            // Safely get task ID - use currentTaskId which is defined outside try-catch
            const taskId = currentTaskId || (task && task.id ? task.id : null);
            
            Logger.error('Enrollment failed', err, { 
                originalUrl: rawUrl, 
                transformedUrl: transformedUrl,
                email, 
                taskId: taskId 
            });

            // ✅ FIX: Check if this is an admin download (permanent, no order)
            // For admin downloads, update status to 'failed' but with specific error message
            // Worker will check enrollment status and can proceed if course is already enrolled
            let isAdminDownload = false;
            if (taskId) {
                try {
                    const taskInfo = await DownloadTask.findByPk(taskId, {
                        attributes: ['id', 'course_type', 'order_id', 'status']
                    });
                    if (taskInfo && taskInfo.course_type === 'permanent' && taskInfo.order_id === null) {
                        isAdminDownload = true;
                        // ✅ FIX: Update status to 'failed' với error message rõ ràng
                        // Worker sẽ check enrollment status và có thể proceed nếu course đã được enroll
                        await DownloadTask.update(
                            { 
                                status: 'failed',
                                error_log: `Enrollment failed: ${err.message}. Worker will check if course is already enrolled.`
                            },
                            {
                                where: { id: taskId },
                                fields: ['status', 'error_log']
                            }
                        );
                        Logger.warn('Enrollment failed for admin download, updated status to failed', {
                            taskId: taskId,
                            error: err.message,
                            note: 'Worker will check enrollment status before download'
                        });
                    } else {
                        // Non-admin download: Update to failed
                        await DownloadTask.update(
                            { 
                                status: 'failed',
                                error_log: err.message || 'Enrollment failed'
                            },
                            {
                                where: { id: taskId },
                                fields: ['status', 'error_log']
                            }
                        );
                    }
                } catch (checkError) {
                    Logger.warn('Failed to check if admin download', checkError, { taskId: taskId });
                    // Fallback: Update to failed anyway
                    if (taskId) {
                        await DownloadTask.update(
                            { 
                                status: 'failed',
                                error_log: err.message || 'Enrollment failed'
                            },
                            {
                                where: { id: taskId },
                                fields: ['status', 'error_log']
                            }
                        );
                    }
                }
            }

            // ✅ LIFECYCLE LOG: Enrollment Error (only for non-admin downloads)
            if (!isAdminDownload) {
                try {
                  const taskWithOrder = await DownloadTask.findOne({
                    where: { email, course_url: rawUrl },
                    attributes: ['id', 'order_id'],
                    order: [['id', 'DESC']] // Get latest task
                  });
                  
                  if (taskWithOrder) {
                    lifecycleLogger.logEnrollError(
                      taskWithOrder.id,
                      err.message,
                      { orderId: taskWithOrder.order_id, url: rawUrl, email }
                    );
                  }
                } catch (logError) {
                  // Don't fail enrollment if logging fails
                  Logger.warn('Failed to log enrollment error to lifecycle logger', { taskId: taskId });
                }
            }

            // Cập nhật trạng thái failed vào DB để không bị treo pending
            // ✅ FIX: For admin downloads, keep status as 'processing' instead of 'failed'
            // Only update if we have a task ID, otherwise update by email and URL
            try {
                if (taskId) {
                    // Update specific task by ID
                    if (isAdminDownload) {
                        // Keep status as 'processing' for admin downloads
                        // Worker will check course_type and allow download even if enrollment failed
                        await DownloadTask.update(
                            { error_log: err.message },
                            {
                                where: { id: taskId },
                                fields: ['error_log']
                            }
                        );
                        Logger.info('Admin download enrollment failed, kept status as processing', {
                            taskId: taskId,
                            error: err.message
                        });
                    } else {
                        // Set status to 'failed' for regular downloads
                        await DownloadTask.update(
                            { status: 'failed', error_log: err.message },
                            {
                                where: { id: taskId },
                                fields: ['status', 'error_log']
                            }
                        );
                    }
                } else {
                    // Fallback: Update by email and URL (for cases where task wasn't found)
                    // Check if it's admin download by querying task
                    const fallbackTask = await DownloadTask.findOne({
                        where: { email, course_url: rawUrl },
                        attributes: ['id', 'course_type', 'order_id'],
                        order: [['id', 'DESC']]
                    });
                    
                    if (fallbackTask) {
                        const isFallbackAdmin = fallbackTask.course_type === 'permanent' && fallbackTask.order_id === null;
                        if (isFallbackAdmin) {
                            await DownloadTask.update(
                                { error_log: err.message },
                                {
                                    where: { email, course_url: rawUrl },
                                    fields: ['error_log']
                                }
                            );
                        } else {
                            await DownloadTask.update(
                                { status: 'failed', error_log: err.message },
                                {
                                    where: { email, course_url: rawUrl },
                                    fields: ['status', 'error_log']
                                }
                            );
                        }
                    } else {
                        // No task found, can't update
                        Logger.warn('No task found to update enrollment failure', { email, url: rawUrl });
                    }
                }
            } catch (e) {
                Logger.error('Failed to update task status after enrollment failure', e, { email, url: rawUrl, taskId: taskId, isAdminDownload });
            }

            results.push({
                success: false,
                url: rawUrl,
                status: 'error',
                message: err.message
            });
        }
        
        // Delay 3 giây giữa các khóa học để an toàn
        await wait(3000);
    }

    return results;
};

module.exports = {
    enrollCourses
};