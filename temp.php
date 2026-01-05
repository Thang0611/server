/**
 * Plugin Name: Course Downloader System
 * Description: Shortcode [course_download_form] để hiển thị form download khóa học.
 */
/**
 * Plugin Name: Course Downloader System
 * Description: Shortcode [course_download_form] hiển thị form download khóa học.
 */


/* ==========================================================================
   TÍCH HỢP HỆ THỐNG DOWNLOAD KHÓA HỌC (WOOCOMMERCE + SEPAY + NODEJS)
   ========================================================================== */

// 1. CẤU HÌNH HỆ THỐNG
// ID sản phẩm trong WooCommerce (Loại Virtual/Downloadable, giá 50k)
define('CD_PRODUCT_ID', 23339); // <--- THAY ID SẢN PHẨM CỦA BẠN VÀO ĐÂY

// API Node.js
define('NODEJS_API_INFO', 'https://api.khoahocgiare.info/api/v1/get-course-info'); 
define('NODEJS_API_DOWN', 'https://api.khoahocgiare.info/api/v1/download');

// ==========================================================================
// A. SHORTCODE & FRONTEND
// ==========================================================================
add_shortcode('course_download_form', 'render_course_download_form');
/* ==========================================================================
   SHORTCODE & FRONTEND (FORM ĐẸP + VALIDATE GMAIL + LOGIC TÍNH TIỀN)
   ========================================================================== */

add_shortcode('course_download_form', 'render_course_download_form');

function render_course_download_form() {
    wp_enqueue_script('jquery');
    add_action('wp_footer', 'course_downloader_assets');
    
    ob_start();
    ?>
    <div class="cd-wrapper">
        <form id="course-download-form" class="cd-form">
            <h3 class="cd-title">🚀 Tải Xuống Khóa Học</h3>
            <p class="cd-desc">Hệ thống hỗ trợ tải khóa học chất lượng cao từ Udemy.</p>
            
            <div class="cd-form-group">
                <label for="cd-email">Gmail nhận tài liệu <span style="color:red">*</span></label>
                <input type="email" id="cd-email" name="email" placeholder="example@gmail.com" required>
                <!--<span class="cd-error-msg" id="err-email">Vui lòng nhập đúng địa chỉ Gmail (@gmail.com).</span>-->
            </div>

            <div class="cd-form-group">
                <label for="cd-urls">Danh sách link khóa học <span style="color:red">*</span></label>
                <textarea id="cd-urls" name="urls" rows="5" placeholder="Dán link khóa học vào đây (Mỗi dòng 1 link)..."></textarea>
                <span >Hỗ trợ nhiều link khoá học Udemy. Nhập mỗi link 1 dòng.</span>
            </div>

            <button type="submit" id="cd-submit-btn" class="cd-btn">
                <span class="btn-text">Kiểm tra & Báo giá</span>
                <span class="cd-loader"></span>
            </button>
        </form>
    </div>

    <div id="cd-modal" class="cd-modal-overlay">
        <div class="cd-modal-content">
            <div class="cd-modal-header">
                <h4>Kết quả kiểm tra</h4>
                <span class="cd-close">&times;</span>
            </div>
            
            <div class="cd-modal-body" id="cd-results-list">
                </div>
            
            <div class="cd-modal-footer">
                <div id="cd-total-wrapper" style="display:none;">
                    <span class="cd-total-label">Tổng thanh toán (<span id="cd-valid-count">0</span> khóa):</span>
                    <span id="cd-total-price">0 đ</span>
                </div>

                <button id="cd-btn-checkout" class="cd-btn cd-btn-success" style="display:none;">
                    <span class="btn-text">Tiến hành thanh toán</span>
                    <span class="cd-loader"></span>
                </button>
            </div>
        </div>
    </div>
    <?php
    return ob_get_clean();
}

function course_downloader_assets() {
    ?>
    <style>
        :root { --cd-primary: #0073aa; --cd-success: #28a745; --cd-bg: #f9f9f9; --cd-err: #d63031; --cd-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        
        /* --- 1. FORM STYLE (Giao diện cũ đẹp hơn) --- */
        .cd-wrapper { max-width: 550px; margin: 3rem auto; font-family: 'Roboto', sans-serif; }
        .cd-form { background: #fff; padding: 2.5rem; border-radius: 16px; box-shadow: var(--cd-shadow); border: 1px solid #eee; }
        .cd-title { text-align: center; margin: 0 0 10px; color: #333; font-weight: 800; font-size: 24px; text-transform: uppercase; letter-spacing: 0.5px; }
        .cd-desc { text-align: center; color: #666; font-size: 14px; margin-bottom: 25px; }
        
        .cd-form-group { margin-bottom: 20px; position: relative; }
        .cd-form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #444; font-size: 14px; }
        .cd-form-group input, .cd-form-group textarea { 
            width: 100%; padding: 14px; border: 2px solid #f0f0f0; border-radius: 8px; 
            font-size: 14px; transition: all 0.3s ease; background: #fdfdfd;
        }
        .cd-form-group input:focus, .cd-form-group textarea:focus { border-color: var(--cd-primary); background: #fff; outline: none; box-shadow: 0 0 0 4px rgba(0, 115, 170, 0.1); }
        
        .cd-error-msg { display: none; color: var(--cd-err); font-size: 12px; margin-top: 6px; font-weight: 500; display: flex; align-items: center; }
        .cd-error-msg::before { content: "⚠ "; margin-right: 4px; }
        span.cd-error-msg { display: none; } /* Mặc định ẩn */
        .cd-input-error { border-color: var(--cd-err) !important; background: #fff5f5 !important; }
        
        .cd-btn { 
            width: 100%; padding: 16px; background: linear-gradient(135deg, #0073aa 0%, #005a87 100%); 
            color: #fff; border: none; border-radius: 50px; cursor: pointer; font-weight: 700; 
            font-size: 15px; text-transform: uppercase; letter-spacing: 1px; transition: all 0.3s; 
            box-shadow: 0 4px 15px rgba(0, 115, 170, 0.3); position: relative;
        }
        .cd-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 115, 170, 0.4); }
        .cd-btn:disabled { background: #ccc; cursor: not-allowed; transform: none; box-shadow: none; }
        .cd-btn-success { background: linear-gradient(135deg, #28a745 0%, #218838 100%); box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3); }
        .cd-btn-success:hover { box-shadow: 0 6px 20px rgba(40, 167, 69, 0.4); }

        /* Loader */
        .cd-loader { display: none; width: 18px; height: 18px; border: 2px solid #fff; border-bottom-color: transparent; border-radius: 50%; position: absolute; right: 20px; top: 16px; animation: rotation 0.8s linear infinite; }
        .loading .cd-loader { display: inline-block; }
        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        /* --- 2. MODAL & RESULT STYLE --- */
        .cd-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 2147483647 !important; align-items: center; justify-content: center; backdrop-filter: blur(2px); }
        .cd-modal-content { background: #fff; width: 95%; max-width: 600px; max-height: 85vh; border-radius: 12px; display: flex; flex-direction: column; z-index: 2147483648 !important; box-shadow: 0 20px 60px rgba(0,0,0,0.2); animation: slideUp 0.3s ease; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .cd-modal-header { padding: 15px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; border-radius: 12px 12px 0 0; }
        .cd-close { font-size: 28px; cursor: pointer; color: #999; line-height: 1; }
        .cd-close:hover { color: #333; }
        .cd-modal-body { padding: 20px; overflow-y: auto; background: #fcfcfc; }
        .cd-modal-footer { padding: 20px; border-top: 1px solid #eee; background: #fff; border-radius: 0 0 12px 12px; }

        /* Result Items */
        .cd-section-title { font-size: 13px; font-weight: 700; margin: 15px 0 8px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .cd-course-item { display: flex; gap: 15px; border: 1px solid #eef2f5; background: #fff; padding: 12px; margin-bottom: 10px; border-radius: 8px; align-items: flex-start; transition: 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
        .cd-course-item:hover { border-color: var(--cd-primary); }
        .cd-course-img { width: 90px; height: 50px; object-fit: cover; border-radius: 6px; flex-shrink: 0; background: #eee; }
        .cd-course-info { flex: 1; min-width: 0; }
        .cd-course-title { font-weight: 600; font-size: 14px; margin: 0 0 4px 0; line-height: 1.4; color: #2d3436; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .cd-course-price { font-size: 14px; color: var(--cd-success); font-weight: 700; }
        
        /* Error Item */
        .cd-error-item { display: flex; gap: 12px; background: #fff0f0; border: 1px solid #fadbd8; padding: 12px; margin-bottom: 8px; border-radius: 8px; align-items: center; }
        .cd-error-icon { color: var(--cd-err); font-size: 20px; flex-shrink: 0; }
        .cd-error-content { flex: 1; min-width: 0; }
        .cd-error-url { font-weight: 600; color: #444; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
        .cd-error-msg { display: block !important; margin: 2px 0 0 0; color: var(--cd-err); font-style: normal; }

        /* Footer Total */
        #cd-total-wrapper { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #eee; }
        .cd-total-label { font-size: 16px; font-weight: 600; color: #555; }
        #cd-total-price { color: #d63031; font-size: 22px; font-weight: 800; }
    </style>

    <script type="text/javascript">
    jQuery(document).ready(function($) {
        
        if ($('#cd-modal').length > 0) { $('body').append($('#cd-modal')); }

        let foundCourses = []; 

        // --- HÀM VALIDATE MỚI: Chỉ chấp nhận Gmail ---
        function validateGmail(email) {
            // Regex: Bắt đầu ký tự bất kỳ, kết thúc bắt buộc là @gmail.com
            const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
            return gmailRegex.test(String(email).toLowerCase());
        }

        // 1. Xử lý nút CHECK
        $('#course-download-form').on('submit', function(e) {
            e.preventDefault();
            $('.cd-input-error').removeClass('cd-input-error');
            $('.cd-error-msg').hide();

            const email = $('#cd-email').val().trim();
            const rawUrls = $('#cd-urls').val().trim();
            const urlArray = rawUrls.split(/\n/).map(u => u.trim()).filter(u => u !== "");

            let hasError = false;

            // Kiểm tra Gmail
            if (!validateGmail(email)) { 
                $('#cd-email').addClass('cd-input-error'); 
                $('#err-email').text('Bắt buộc phải sử dụng địa chỉ @gmail.com').show(); 
                hasError = true; 
            }

            if (urlArray.length === 0) { 
                $('#cd-urls').addClass('cd-input-error'); 
                $('#err-urls').show(); 
                hasError = true; 
            }
            if (hasError) return;

            const $btn = $('#cd-submit-btn');
            $btn.addClass('loading').prop('disabled', true);

            $.ajax({
                url: '<?php echo admin_url('admin-ajax.php'); ?>',
                type: 'POST',
                data: {
                    action: 'get_course_info_proxy',
                    nonce: '<?php echo wp_create_nonce('cd_nonce_action'); ?>',
                    url: urlArray
                },
                success: function(response) {
                    $btn.removeClass('loading').prop('disabled', false);
                    if (response.success && response.data.results) {
                        foundCourses = response.data.results;
                        renderModal(foundCourses);
                    } else {
                        let msg = response.data.message || 'Lỗi không xác định.';
                        alert('Thông báo: ' + msg);
                    }
                },
                error: function() {
                    $btn.removeClass('loading').prop('disabled', false);
                    alert('Lỗi kết nối đến server.');
                }
            });
        });

        // 2. Render Kết quả (Logic như cũ: Tách Lỗi/Đúng & Tính tiền)
        function renderModal(results) {
            const $list = $('#cd-results-list');
            $list.empty();
            
            const validItems = results.filter(item => item.success);
            const errorItems = results.filter(item => !item.success);

            // A. List Hợp lệ
            if (validItems.length > 0) {
                $list.append(`<div class="cd-section-title" style="color:#28a745">✅ ${validItems.length} khóa học hợp lệ:</div>`);
                validItems.forEach(course => {
                    let priceFormatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(course.price || 50000);
                    $list.append(`
                        <div class="cd-course-item">
                            <img src="${course.image}" class="cd-course-img" alt="img">
                            <div class="cd-course-info">
                                <h5 class="cd-course-title">${course.title}</h5>
                                <div class="cd-course-price">${priceFormatted}</div>
                                <a href="${course.url}" target="_blank" style="font-size:12px; color: #0073aa;">Link gốc</a>
                            </div>
                        </div>
                    `);
                });
            }

            // B. List Lỗi
            if (errorItems.length > 0) {
                $list.append(`<div class="cd-section-title" style="color:#dc3545; margin-top:20px;">⚠️ ${errorItems.length} Bỏ qua link lỗi:</div>`);
                errorItems.forEach(item => {
                    $list.append(`
                        <div class="cd-error-item">
                            <div class="cd-error-icon">✕</div>
                            <div class="cd-error-content">
                                <span class="cd-error-url">${item.url}</span>
                                <span class="cd-error-msg">${item.message || 'Link không hợp lệ'}</span>
                            </div>
                        </div>
                    `);
                });
            }

            // C. Logic Nút Mua & Tổng tiền
            if (validItems.length === 0) {
                $list.append('<p style="text-align:center; margin-top:30px; color:#777;">Không có link nào tải được.</p>');
                $('#cd-total-wrapper').hide();
                $('#cd-btn-checkout').hide();
            } else {
                // Tính tổng tiền
                let totalAmount = validItems.reduce((sum, item) => sum + (item.price ? parseInt(item.price) : 50000), 0);
                let totalFormatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount);
                
                $('#cd-valid-count').text(validItems.length);
                $('#cd-total-price').text(totalFormatted);
                
                $('#cd-total-wrapper').css('display', 'flex');
                $('#cd-btn-checkout').show();
            }

            $('#cd-modal').css('display', 'flex');
        }

        // 3. Checkout
        $('#cd-btn-checkout').on('click', function() {
            const validCourses = foundCourses.filter(c => c.success);
            if(validCourses.length === 0) return;

            const email = $('#cd-email').val().trim();
            const listUrls = validCourses.map(c => c.url);

            const $btn = $(this);
            $btn.addClass('loading').prop('disabled', true).find('.btn-text').text('Đang chuyển hướng...');

            $.ajax({
                url: '<?php echo admin_url('admin-ajax.php'); ?>',
                type: 'POST',
                data: {
                    action: 'add_courses_to_cart',
                    nonce: '<?php echo wp_create_nonce('cd_nonce_action'); ?>',
                    email: email,
                    urls: listUrls
                },
                success: function(response) {
                    if(response.success) {
                        window.location.href = response.data.checkout_url;
                    } else {
                        alert('Lỗi: ' + response.data);
                        $btn.removeClass('loading').prop('disabled', false).find('.btn-text').text('Tiến hành thanh toán');
                    }
                },
                error: function() {
                    alert('Lỗi kết nối server.');
                    $btn.removeClass('loading').prop('disabled', false).find('.btn-text').text('Tiến hành thanh toán');
                }
            });
        });

        $('.cd-close, .cd-modal-overlay').on('click', function(e) {
            if (e.target === this) $('#cd-modal').hide();
        });
    });
    </script>
    <?php
}

// ==========================================================================
// C. BACKEND HANDLERS
// ==========================================================================

// 1. Proxy: Lấy thông tin khóa học từ Node.js
add_action('wp_ajax_get_course_info_proxy', 'cd_handle_get_info');
add_action('wp_ajax_nopriv_get_course_info_proxy', 'cd_handle_get_info');

function cd_handle_get_info() {
    check_ajax_referer('cd_nonce_action', 'nonce');
    $urls = isset($_POST['url']) ? $_POST['url'] : [];
    
    if (empty($urls) || !is_array($urls)) wp_send_json_error(['message' => 'Danh sách link không hợp lệ.']);

    // Gọi Node.js
    $response = wp_remote_post(NODEJS_API_INFO, [
        'body'    => json_encode(['urls' => $urls]),
        'headers' => ['Content-Type' => 'application/json'],
        'timeout' => 15,
    ]);

    if (is_wp_error($response)) wp_send_json_error(['message' => $response->get_error_message()]);

    $data = json_decode(wp_remote_retrieve_body($response), true);

    if (!empty($data) && !empty($data['results'])) {
        // --- LOGIC MỚI: LƯU DATA VÀO SESSION NGAY LÚC NÀY ---
        // Để đảm bảo giá tiền là do Server Node.js quyết định, không bị sửa ở Client
        WC()->session->set('cd_api_results', $data['results']);
        
        wp_send_json_success($data); 
    } else {
        wp_send_json_error(['message' => 'API không trả về kết quả.']);
    }
}

// 2. Add Cart: Thêm sản phẩm vào giỏ WooCommerce
add_action('wp_ajax_add_courses_to_cart', 'handle_add_courses_to_cart');
add_action('wp_ajax_nopriv_add_courses_to_cart', 'handle_add_courses_to_cart');
// TÌM HÀM handle_add_courses_to_cart CŨ VÀ THAY BẰNG CODE MỚI NÀY
function handle_add_courses_to_cart() {
    check_ajax_referer('cd_nonce_action', 'nonce');
    
    // URL người dùng muốn mua
    $urls_to_buy = isset($_POST['urls']) ? $_POST['urls'] : [];
    $email = isset($_POST['email']) ? sanitize_email($_POST['email']) : '';

    if (empty($urls_to_buy)) wp_send_json_error('Không có link nào.');
    if (!class_exists('WooCommerce')) wp_send_json_error('WooCommerce chưa cài đặt.');
    
    // Lấy dữ liệu giá gốc từ Session (cái này để tính tiền thì ok, mất cũng ko sao vì ta tính lại được)
    $api_results = WC()->session->get('cd_api_results');
    
    // Nếu mất Session kết quả API, ta chấp nhận rủi ro dùng luôn list khách gửi lên
    // (Hoặc bạn có thể bắt khách check lại, nhưng ở đây ta ưu tiên cho qua để bán được hàng)
    
    // --- LOGIC TÍNH TIỀN ---
    $final_urls = [];
    $total_price = 0;

    if (!empty($api_results)) {
        foreach ($api_results as $course) {
            if (!empty($course['courseId']) && in_array($course['url'], $urls_to_buy)) {
                $final_urls[] = $course['url'];
                $price = isset($course['price']) ? intval($course['price']) : 0;
                $total_price += $price;
            }
        }
    } else {
        // Fallback: Nếu session mất, ta tin tưởng client gửi lên (hoặc set mặc định)
        $final_urls = $urls_to_buy; 
        $total_price = count($final_urls) * 50000; // Giá mặc định nếu mất session
    }

    if (empty($final_urls)) wp_send_json_error('Không có khóa học hợp lệ.');

    // Xóa giỏ hàng cũ
    WC()->cart->empty_cart();

    // Lưu tổng tiền vào Session (để hàm override price dùng)
    WC()->session->set('cd_custom_total_price', $total_price);
    
    // Lưu Email vào Session (Email ít quan trọng hơn URL vì khách có thể nhập lại)
    WC()->session->set('cd_customer_email', $email);

    // === QUAN TRỌNG NHẤT: GẮN URL VÀO ITEM DATA CỦA GIỎ HÀNG ===
    // Tham số thứ 5 của add_to_cart là $cart_item_data
    $cart_item_data = [
        'cd_attached_urls' => $final_urls // Gắn chặt mảng URL vào món hàng này
    ];

    $quantity = count($final_urls);
    // add_to_cart( $product_id, $quantity, $variation_id, $variation, $cart_item_data )
    WC()->cart->add_to_cart(CD_PRODUCT_ID, $quantity, 0, [], $cart_item_data);

    wp_send_json_success([
        'checkout_url' => wc_get_checkout_url()
    ]);
}



// ==========================================================================
// D. WOOCOMMERCE HOOKS (SERVER-SIDE)
// ==========================================================================

// 1. Khi tạo đơn -> Lưu List URL vào Order Meta
add_action('woocommerce_checkout_create_order', 'save_urls_to_order_meta', 10, 2);

// TÌM HÀM save_urls_to_order_meta CŨ VÀ THAY BẰNG CODE MỚI NÀY
add_action('woocommerce_checkout_create_order', 'save_urls_to_order_meta', 10, 2);

function save_urls_to_order_meta($order, $data) {
    // 1. Tìm danh sách URL trong Giỏ hàng (Thay vì tìm trong Session)
    $found_urls = [];
    
    foreach (WC()->cart->get_cart() as $cart_item) {
        // Kiểm tra xem món hàng này có đính kèm URL không
        if (isset($cart_item['cd_attached_urls']) && !empty($cart_item['cd_attached_urls'])) {
            $found_urls = $cart_item['cd_attached_urls'];
            break; // Tìm thấy rồi thì dừng
        }
    }

    // Fallback: Nếu trong giỏ không có (hiếm), thử tìm lại Session lần cuối
    if (empty($found_urls)) {
        $found_urls = WC()->session->get('cd_download_urls');
    }

    // 2. Lưu vào Đơn hàng
    if (!empty($found_urls)) {
        // Lưu list URL vào meta data của Order
        $order->update_meta_data('_download_list_urls', json_encode($found_urls, JSON_UNESCAPED_UNICODE));
    }

    // 3. Xử lý Email (Lấy từ Session hoặc Input form)
    $email_session = WC()->session->get('cd_customer_email');
    $billing_email = $order->get_billing_email();

    // Nếu khách không nhập email ở checkout, lấy email từ lúc check tool
    if (empty($billing_email) && !empty($email_session)) {
        $order->set_billing_email($email_session);
    }
}



// 2. Khi Thanh toán thành công (Completed/Processing) -> Gọi Node.js
// ==========================================================================
// PHIÊN BẢN DEBUG: GHI LOG CHI TIẾT ĐỂ TÌM LỖI
// ==========================================================================


add_action('woocommerce_order_status_processing', 'trigger_nodejs_download_api_debug', 10, 1);

function trigger_nodejs_download_api_debug($order_id) {
    // 1. Ghi log: Báo hiệu Hook đã chạy
    $order = wc_get_order($order_id);
    $order->add_order_note('🔍 DEBUG: Bắt đầu quy trình gọi Node.js...');

    // 2. Kiểm tra cờ trùng lặp
    if ($order->get_meta('_is_sent_to_nodejs') == 'yes') {
        $order->add_order_note('ℹ️ DEBUG: Dừng lại vì đơn này đã gửi rồi.');
        return;
    }

    // 3. Kiểm tra dữ liệu URL (Đây là chỗ nghi ngờ nhất)
    $urls_json = $order->get_meta('_download_list_urls');
    
    // In thử dữ liệu ra xem có gì không
    if (empty($urls_json)) {
        $order->add_order_note('❌ LỖI NGHIÊM TRỌNG: Không tìm thấy danh sách URL trong đơn hàng (Meta _download_list_urls bị rỗng). Có thể lỗi ở bước Lưu Session khi Checkout.');
        return; // Dừng tại đây
    } else {
        $order->add_order_note('✅ DEBUG: Tìm thấy dữ liệu URL: ' . substr($urls_json, 0, 50) . '...');
    }

    $urls = json_decode($urls_json, true);
    $email = $order->get_billing_email();

    // 4. Chuẩn bị dữ liệu gửi đi
    $body_data = [
        'order_id' => (string)$order_id,
        'email'    => $email,
        'courses'  => array_map(function($url) {
             return ['url' => $url];    
        }, $urls)
    ];

    $order->add_order_note('🚀 DEBUG: Đang gửi request sang Node.js...');

    // 5. Gọi API
    $response = wp_remote_post(NODEJS_API_DOWN, [
        'body'    => json_encode($body_data),
        'headers' => ['Content-Type' => 'application/json'],
        'timeout' => 20,
        'blocking' => true
    ]);

    // 6. Xử lý kết quả trả về
    if (is_wp_error($response)) {
        $order->add_order_note('❌ LỖI KẾT NỐI: ' . $response->get_error_message());
    } else {
        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);
        
        if ($response_code == 200) {
            $order->add_order_note('✅ THÀNH CÔNG: Node.js đã nhận lệnh. (Response: ' . $response_body . ')');
            $order->update_meta_data('_is_sent_to_nodejs', 'yes');
            $order->save();
        } else {
            $order->add_order_note('⚠️ LỖI TỪ NODEJS (Code ' . $response_code . '): ' . $response_body);
        }
    }
}





// Hook ghi đè giá sản phẩm trong giỏ hàng
add_action('woocommerce_before_calculate_totals', 'cd_override_cart_item_price', 10, 1);

function cd_override_cart_item_price($cart) {
    if (is_admin() && !defined('DOING_AJAX')) return;

    // Lấy tổng tiền đã tính toán từ Session
    $custom_total = WC()->session->get('cd_custom_total_price');

    // Nếu không có giá tùy chỉnh thì thôi, dùng giá mặc định
    if (empty($custom_total)) return;

    foreach ($cart->get_cart() as $cart_item) {
        if ($cart_item['product_id'] == CD_PRODUCT_ID) {
            
            // Logic: WooCommerce tính Tổng = Giá * Số lượng
            // Nên ta phải tính ngược: Giá 1 item = Tổng tiền API / Số lượng
            $quantity = $cart_item['quantity'];
            
            if ($quantity > 0) {
                $price_per_item = $custom_total / $quantity;
                $cart_item['data']->set_price($price_per_item);
            }
        }
    }
}