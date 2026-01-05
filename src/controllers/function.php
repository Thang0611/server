/* -------------------------------------------------------------------------- */
/* PHẦN 1: GIAO DIỆN CHECKOUT, VALIDATE & SYNC DỮ LIỆU                        */
/* -------------------------------------------------------------------------- */

// 1.1 Hiển thị ô nhập và chèn JS (Ẩn ô mặc định + Chặn click nếu sai)
add_action('learn-press/before-checkout-form', 'nht_render_drive_input_field');
function nht_render_drive_input_field() {
    $current_user = wp_get_current_user();
    $is_logged_in = is_user_logged_in();
    
    // Nếu login thì lấy email tài khoản, nếu không thì rỗng
    $val = $is_logged_in ? $current_user->user_email : '';
    if (isset($_POST['drive_email'])) $val = sanitize_email($_POST['drive_email']);

    ?>
    <div class="lp-drive-box" id="lp-drive-box-container" style="margin-bottom: 25px; padding: 20px; background:#e8f0fe; border-left: 5px solid #4285f4; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #1967d2;">
            📧 Email nhận tài liệu Google Drive <span style="color:red">*</span>
        </h3>
        <label for="drive_email" style="display:block; margin-bottom: 8px; font-size: 14px; color:#555;">
            Nhập chính xác <strong>Gmail</strong>. Hệ thống sẽ cấp quyền vào email này:
        </label>

        <input type="email" name="drive_email" id="drive_email" 
               value="<?php echo esc_attr($val); ?>" 
               required
               placeholder="ví_dụ@gmail.com" 
               style="width: 100%; height: 45px; padding: 0 15px; border: 1px solid #ccc; border-radius: 4px; font-weight:bold;">
        
        <div id="drive_error_msg" style="color:red; font-size:13px; margin-top:5px; font-weight:bold; display:none;"></div>
    </div>

    <script type="text/javascript">
    jQuery(document).ready(function($) {
        
        // 1. Ẩn các ô email mặc định của LearnPress và Sync dữ liệu
        var lpSelectors = ['input[name="guest_email"]', 'input[id="guest_email"]', 'input[name="user_email"]', '#checkout_email'];
        
        function hideAndSync() {
            var val = $('#drive_email').val();
            $.each(lpSelectors, function(i, sel) {
                var field = $(sel);
                if(field.length) {
                    // Ẩn giao diện
                    field.closest('.form-field').hide(); 
                    field.closest('li').hide();
                    // Copy giá trị sang để LP lưu vào core
                    field.val(val); 
                }
            });
        }
        
        // Chạy ngay khi load và khi gõ
        hideAndSync();
        $('#drive_email').on('input keyup change', hideAndSync);

        // 2. CHẶN NÚT ĐẶT HÀNG NẾU SAI
        $('body').on('click', '#learn-press-checkout-place-order', function(e) {
            var emailInput = $('#drive_email');
            var emailVal   = emailInput.val().trim();
            var errorDiv   = $('#drive_error_msg');
            var container  = $('#lp-drive-box-container');
            var isValid    = true;
            var errorText  = '';

            // Reset UI
            emailInput.css('border', '1px solid #ccc');
            errorDiv.hide();
            container.css('background', '#e8f0fe');

            // Validate
            if( emailVal === '' ) {
                isValid = false;
                errorText = '⚠️ Bạn chưa nhập Email nhận tài liệu!';
            } else if( ! /@gmail\.com$/.test(emailVal) ) {
                isValid = false;
                errorText = '⚠️ Lỗi: Vui lòng nhập đúng định dạng @gmail.com';
            }

            // Nếu lỗi -> Chặn đứng
            if (!isValid) {
                e.preventDefault();
                e.stopImmediatePropagation();
                
                errorDiv.html(errorText).show();
                emailInput.css('border', '2px solid red').focus();
                container.css('background', '#fff0f0');

                $('html, body').animate({ scrollTop: container.offset().top - 100 }, 500);
                return false;
            }
        });
    });
    </script>
    <?php
}

// 1.2 Validate Backend (PHP) - Lớp bảo vệ thứ 2
add_action('learn_press_checkout_validate_fields', 'nht_validate_drive_input');
function nht_validate_drive_input() {
    $email = isset($_POST['drive_email']) ? sanitize_email($_POST['drive_email']) : '';

    if ( empty($email) ) {
        throw new Exception(__('Lỗi: Bạn chưa nhập Email nhận tài liệu!', 'learnpress'));
    }
    if ( !preg_match('/@gmail\.com$/', $email) ) {
        throw new Exception(__('Lỗi: Hệ thống chỉ chấp nhận @gmail.com. Vui lòng kiểm tra lại.', 'learnpress'));
    }
    
    // Gán giá trị vào guest_email để LearnPress core không báo lỗi thiếu field
    if( !is_user_logged_in() ) {
        $_POST['guest_email'] = $email;
    }
}

// 1.3 LƯU DATA VÀO META
add_action('learn_press_checkout_order_created', 'nht_save_drive_email_data', 10, 2);
function nht_save_drive_email_data($order_id, $cart) {
    if ( !empty($_POST['drive_email']) ) {
        update_post_meta($order_id, 'drive_email', sanitize_email($_POST['drive_email']));
    }
}


/* -------------------------------------------------------------------------- */
/* PHẦN 2: QUẢN LÝ TRONG ADMIN (GIỮ NGUYÊN)                                   */
/* -------------------------------------------------------------------------- */

// 2.1 Meta box Link Drive
add_action( 'add_meta_boxes', 'nht_register_drive_meta_box' );
function nht_register_drive_meta_box() {
    add_meta_box('nht_drive_link_box', '📂 Cấu hình Drive', 'nht_render_drive_box_html', 'lp_course', 'side', 'high');
}
function nht_render_drive_box_html( $post ) {
    $value = get_post_meta( $post->ID, 'url_origin', true );
    echo '<label>Link Folder Gốc:</label>';
    echo '<input type="text" name="nht_url_origin" value="' . esc_attr( $value ) . '" placeholder="https://drive.google.com/..." style="width:100%; margin-top:5px;" />';
}
add_action( 'save_post', function($post_id) {
    if ( isset($_POST['nht_url_origin']) ) update_post_meta( $post_id, 'url_origin', sanitize_text_field( $_POST['nht_url_origin'] ) );
});

// 2.2 Meta box Info Đơn hàng
add_action( 'add_meta_boxes', 'nht_add_order_drive_info' );
function nht_add_order_drive_info() {
    add_meta_box('nht_drive_info', '📂 Thông tin cấp quyền Drive', 'nht_render_drive_info_html', 'lp_order', 'side', 'high');
}
function nht_render_drive_info_html( $post ) {
    $drive_email = get_post_meta( $post->ID, 'drive_email', true );
    
    // Fallback hiển thị
    if(empty($drive_email)) {
        $order = learn_press_get_order($post->ID);
        if($order) $drive_email = $order->get_user_email();
    }

    $status = get_post_meta( $post->ID, '_nht_drive_access_granted', true );
    
    if($drive_email) {
        echo '<p><strong>Email nhận:</strong> <input type="text" value="'.esc_attr($drive_email).'" readonly style="width:100%; background:#e8f0fe; color:#1a73e8; font-weight:bold; border:1px solid #ccc; padding:5px;"></p>';
    } else {
        echo '<p style="color:red; font-weight:bold;">⚠️ KHÔNG TÌM THẤY EMAIL!</p>';
    }
    echo '<hr>';
    if($status === 'yes') echo '<p style="color:green; font-weight:bold">✅ Đã cấp quyền xong</p>';
    else echo '<p style="color:orange; font-weight:bold">⏳ Đang chờ xử lý</p>';
}


/* -------------------------------------------------------------------------- */
/* PHẦN 3: LOGIC GỬI SANG NODE.JS (CÓ FALLBACK EMAIL + LOG)                   */
/* -------------------------------------------------------------------------- */

add_action( 'nht_sepay_full_payment_received', 'nht_handle_sepay_full_payment', 10, 2 );

function nht_handle_sepay_full_payment( $order_id, $order ) {
    error_log("🚀 [Auto Drive] Bắt đầu xử lý đơn #$order_id");

    if ( $order->get_status() !== LP_ORDER_PROCESSING ) {
        $order->update_status( LP_ORDER_PROCESSING, 'Tiền về. Đang cấp quyền Drive...' );
    }

    $api_endpoint = 'https://api.khoahocgiare.info/api/v1/grant-access'; 
    $api_secret   = 'KEY_BAO_MAT_CUA_BAN_2025';

    // 1. LẤY EMAIL
    $user_email = get_post_meta( $order_id, 'drive_email', true );
    if ( empty($user_email) ) $user_email = $order->get_user_email(); // Fallback

    if ( empty($user_email) ) {
        error_log("❌ [Auto Drive] Lỗi: Không có email.");
        return; 
    }

    // 2. LẤY KHÓA HỌC
    $items = $order->get_items();
    $courses_payload = [];
    foreach ( $items as $item ) {
        $course_id = $item['course_id'];
        $drive_link = get_post_meta( $course_id, 'url_origin', true );
        if ( $drive_link ) $courses_payload[] = [ 'course_name' => get_the_title( $course_id ), 'drive_link'  => $drive_link ];
    }

    if ( empty( $courses_payload ) ) {
        error_log("⚠️ [Auto Drive] Không có link Drive.");
        update_post_meta( $order_id, '_nht_drive_access_granted', 'yes' );
        $order->update_status( LP_ORDER_COMPLETED, 'Hoàn tất (Không có tài liệu).' );
        return;
    }

    // 3. TẠO CHỮ KÝ THEO CÁCH "NỐI CHUỖI" (SIÊU BỀN)
    $timestamp = time();
    
    // Công thức: order_id|email|timestamp
    // Ví dụ: 34468|khach@gmail.com|1700000000
    $data_to_hash = $order_id . '|' . $user_email . '|' . $timestamp;
    
    $signature = hash_hmac( 'sha256', $data_to_hash, $api_secret );

    error_log("📡 [Auto Drive] String to hash: " . $data_to_hash); // Log để check
    error_log("📡 [Auto Drive] Signature PHP: " . $signature);

    // 4. GỬI REQUEST
    $body_json = json_encode([ 
        'order_id' => $order_id, 
        'email'    => $user_email, 
        'courses'  => $courses_payload 
    ]);

    $response = wp_remote_post( $api_endpoint, [
        'method'    => 'POST',
        'body'      => $body_json,
        'headers'   => [ 
            'Content-Type' => 'application/json', 
            'X-Signature'  => $signature, 
            'X-Timestamp'  => $timestamp 
        ],
        'timeout'   => 15,    
        'blocking'  => true,
        'sslverify' => false
    ]);

    if ( is_wp_error( $response ) ) {
        error_log("❌ [Auto Drive] Gửi thất bại: " . $response->get_error_message());
    } else {
        $code = wp_remote_retrieve_response_code( $response );
        $body = wp_remote_retrieve_body( $response );
        error_log("✅ [Auto Drive] HTTP $code - Body: " . substr($body, 0, 100));
    }
}


/* -------------------------------------------------------------------------- */
/* PHẦN 4: CALLBACK API (NODE.JS BÁO KẾT QUẢ)                                 */
/* -------------------------------------------------------------------------- */

add_action( 'rest_api_init', function () {
    register_rest_route( 'nht-app/v1', '/complete-order', array(
        'methods'  => 'POST',
        'callback' => 'nht_handle_node_callback',
        'permission_callback' => '__return_true',
    ));
});

function nht_handle_node_callback( WP_REST_Request $request ) {
    $secret_key = 'KEY_BAO_MAT_CUA_BAN_2025'; 
    if ( $request->get_header( 'x-callback-secret' ) !== $secret_key ) return new WP_Error( 'forbidden', 'Sai Secret Key', array( 'status' => 403 ) );

    $params   = $request->get_json_params();
    $order_id = isset($params['order_id']) ? intval($params['order_id']) : 0;
    $success  = isset($params['success']) ? $params['success'] : false;
    $message  = isset($params['message']) ? $params['message'] : '';

    $order = learn_press_get_order( $order_id );
    if ( ! $order ) return new WP_Error( 'not_found', 'Order not found', array( 'status' => 404 ) );

    if ( $success ) {
        update_post_meta( $order_id, '_nht_drive_access_granted', 'yes' );
        $order->update_status( LP_ORDER_COMPLETED, '✅ Auto Drive: ' . $message );
    } else {
        $order->add_note( '⚠️ Node.js Error: ' . $message );
    }
    return rest_ensure_response(['status' => 'ok']);
}
