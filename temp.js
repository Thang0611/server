



document.addEventListener( 'wpcf7mailsent', function( event ) {
    // 1. Lấy giá trị từ các input
    var emailInput = document.querySelector('input[name="your-email"]').value;
    var urlsInput = document.querySelector('textarea[name="course-urls"]').value;

    // 2. Xử lý tách mảng URL
    // Tách bằng xuống dòng, xóa khoảng trắng thừa, lọc bỏ dòng rỗng
    var urlArray = urlsInput.split(/\r?\n/).map(url => url.trim()).filter(url => url !== "");

    // 3. Tạo object dữ liệu
    var payload = {
        email: emailInput,
        urls: urlArray
    };

    console.log("Đang gửi dữ liệu đi:", payload);

    // 4. Gửi lên Server
    fetch('https://api.khoahocgiare.info/api/v1/get-course-info', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        console.log('Server phản hồi:', data);
        alert('Đã gửi yêu cầu check khóa học thành công!');
    })
    .catch((error) => {
        console.error('Lỗi:', error);
    });

}, false );


document.addEventListener('DOMContentLoaded', function() {
    // Các element cần dùng
    const modal = document.getElementById("nht-course-modal");
    const closeBtn = document.querySelector(".nht-close-btn");
    const listContainer = document.getElementById("nht-course-list");
    const payBtn = document.getElementById("nht-payment-btn");

    // Hàm đóng Modal
    function closeModal() {
        modal.style.display = "none";
    }

    // Sự kiện đóng modal khi click X hoặc ra ngoài
    closeBtn.onclick = closeModal;
    window.onclick = function(event) {
        if (event.target == modal) closeModal();
    }

    // Sự kiện nút Thanh Toán (Bạn tự xử lý chuyển trang ở đây)
    payBtn.onclick = function() {
        alert("Chuyển hướng đến trang thanh toán...");
        // window.location.href = "/thanh-toan"; 
    }

    // --- LOGIC GỬI FORM CF7 VÀ HIỆN POPUP ---
    document.addEventListener( 'wpcf7mailsent', function( event ) {
        
        // 1. Lấy dữ liệu input
        var emailInput = document.querySelector('input[name="your-email"]').value;
        var urlsInput = document.querySelector('textarea[name="course-urls"]').value;
        
        // Tách chuỗi thành mảng
        var urlArray = urlsInput.split(/\r?\n/).map(u => u.trim()).filter(u => u !== "");

        var payload = { email: emailInput, urls: urlArray };

        // Hiển thị loading (tùy chọn)
        listContainer.innerHTML = '<p style="text-align:center;">Đang kiểm tra khóa học...</p>';
        modal.style.display = "flex"; // Hiện modal ngay để người dùng biết đang chạ

        // 2. Gọi API
        fetch('https://api.khoahocgiare.info/api/v1/get-course-info', { // Thay link server nodejs của bạn
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => response.json())
        .then(data => {
            // Xử lý dữ liệu trả về (JSON mẫu của bạn)
            if(data.success && data.results.length > 0) {
                renderCourses(data.results);
            } else {
                listContainer.innerHTML = '<p style="color:red; text-align:center;">Không tìm thấy khóa học nào hợp lệ.</p>';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            listContainer.innerHTML = '<p style="color:red; text-align:center;">Lỗi kết nối server.</p>';
        });

    }, false );

    // Hàm Render danh sách khóa học ra HTML
    function renderCourses(courses) {
        let html = '';
        courses.forEach(item => {
            // Chỉ hiển thị item có success = true
            if(item.success) {
                html += `
                <div class="nht-course-item">
                    <img src="${item.image}" alt="Course Img" class="nht-course-img">
                    <div class="nht-course-info">
                        <h4 class="nht-course-title">${item.title}</h4>
                        <a href="${item.url}" target="_blank" class="nht-course-link">Xem link gốc</a>
                    </div>
                </div>
                `;
            }
        });
        listContainer.innerHTML = html;
    }
});

