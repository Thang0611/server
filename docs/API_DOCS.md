# API Documentation - Frontend Integration Guide

> **Phiên bản:** 2.0 (Updated Jan 12, 2026)  
> **Base URL:** `http://your-domain.com/api/v1`  
> **Hệ thống:** Redis Queue + BullMQ + RQ Workers

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
   - [Get Course Info](#1-get-course-info)
   - [Create Order](#2-create-order)
   - [Check Order Status](#3-check-order-status)
3. [Complete User Flow](#complete-user-flow)
4. [Frontend Implementation Examples](#frontend-implementation-examples)
5. [Error Handling](#error-handling)
6. [Best Practices](#best-practices)

---

## Overview

### Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPLETE USER FLOW                        │
└─────────────────────────────────────────────────────────────┘

[1] User nhập URL khóa học
         ↓
[2] Frontend gọi GET COURSE INFO API
         ↓ (Lấy thông tin: title, giá)
[3] Hiển thị thông tin khóa học cho user
         ↓ (User xác nhận)
[4] Frontend gọi CREATE ORDER API
         ↓ (Nhận QR code + orderCode)
[5] Hiển thị QR code để user thanh toán
         ↓ (User quét mã thanh toán)
[6] Frontend polling CHECK ORDER STATUS API
         ↓ (Chờ payment_status = 'paid')
[7] Hệ thống tự động:
    - Xử lý thanh toán
    - Push job vào Redis Queue
    - Workers download khóa học
    - Upload lên Google Drive
    - Gửi email cho user
         ↓
[8] User nhận email với link Google Drive
```

### Price Information

- **Giá mỗi khóa học:** 2,000 VND
- **Tổng tiền:** `Số lượng khóa học × 2,000 VND`

---

## API Endpoints

### 1. Get Course Info

**Lấy thông tin chi tiết khóa học từ URL**

#### Request

```http
POST /api/v1/get-course-info
Content-Type: application/json
```

**Body:**

```json
{
  "urls": [
    "https://samsung.udemy.com/course/course-name-1/",
    "https://samsung.udemy.com/course/course-name-2/"
  ]
}
```

**Field Details:**
- `urls` (array, required): Mảng chứa các URL khóa học Udemy

#### Response

**Success (200):**

```json
{
  "success": true,
  "results": [
    {
      "url": "https://samsung.udemy.com/course/course-name-1/",
      "title": "Complete Python Bootcamp",
      "courseId": "1234567",
      "price": 2000,
      "success": true
    },
    {
      "url": "https://samsung.udemy.com/course/course-name-2/",
      "title": "Web Development Masterclass",
      "courseId": "7654321",
      "price": 2000,
      "success": true
    }
  ],
  "totalAmount": 4000,
  "validCourseCount": 2
}
```

**Response Fields:**
- `success` (boolean): Trạng thái tổng thể của request
- `results` (array): Danh sách kết quả từng khóa học
  - `url` (string): URL khóa học
  - `title` (string): Tên khóa học
  - `courseId` (string): ID khóa học
  - `price` (number): Giá khóa học (2000 VND)
  - `success` (boolean): Khóa học có hợp lệ không
- `totalAmount` (number): Tổng tiền phải trả
- `validCourseCount` (number): Số khóa học hợp lệ

**Error Response:**

```json
{
  "success": false,
  "error": "Invalid URL format"
}
```

#### Frontend Usage Example

```javascript
async function getCourseInfo(courseUrls) {
  try {
    const response = await fetch('http://your-domain.com/api/v1/get-course-info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        urls: courseUrls
      })
    });

    const data = await response.json();
    
    if (data.success) {
      // Hiển thị thông tin khóa học
      console.log('Total Amount:', data.totalAmount, 'VND');
      console.log('Valid Courses:', data.validCourseCount);
      
      data.results.forEach(course => {
        if (course.success) {
          console.log(`✅ ${course.title} - ${course.price} VND`);
        } else {
          console.log(`❌ Invalid course: ${course.url}`);
        }
      });
      
      return data;
    } else {
      throw new Error('Failed to get course info');
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
```

---

### 2. Create Order

**Tạo đơn hàng mới và nhận QR code thanh toán**

#### Request

```http
POST /api/v1/payment/create-order
Content-Type: application/json
```

**Body:**

```json
{
  "email": "customer@example.com",
  "courses": [
    {
      "url": "https://samsung.udemy.com/course/course-name-1/",
      "title": "Complete Python Bootcamp",
      "courseId": "1234567",
      "price": 2000
    },
    {
      "url": "https://samsung.udemy.com/course/course-name-2/",
      "title": "Web Development Masterclass",
      "courseId": "7654321",
      "price": 2000
    }
  ]
}
```

**Field Details:**
- `email` (string, required): Email khách hàng (sẽ nhận link Google Drive)
- `courses` (array, required): Danh sách khóa học (từ API Get Course Info)
  - `url` (string, required): URL khóa học
  - `title` (string, optional): Tên khóa học
  - `courseId` (string, optional): ID khóa học
  - `price` (number, optional): Giá khóa học (mặc định 2000)

#### Response

**Success (200):**

```json
{
  "success": true,
  "orderId": 123,
  "orderCode": "DH000123",
  "totalAmount": 4000,
  "paymentStatus": "pending",
  "qrCodeUrl": "https://img.vietqr.io/image/MB-0123456789-compact.png?amount=4000&addInfo=DH000123&accountName=Your%20Business",
  "courses": [
    {
      "url": "https://samsung.udemy.com/course/course-name-1/",
      "title": "Complete Python Bootcamp",
      "courseId": "1234567",
      "price": 2000
    },
    {
      "url": "https://samsung.udemy.com/course/course-name-2/",
      "title": "Web Development Masterclass",
      "courseId": "7654321",
      "price": 2000
    }
  ]
}
```

**Response Fields:**
- `success` (boolean): Trạng thái request
- `orderId` (number): ID đơn hàng trong database
- `orderCode` (string): Mã đơn hàng (format: DH + 6 số)
- `totalAmount` (number): Tổng tiền phải trả
- `paymentStatus` (string): Trạng thái thanh toán (luôn là "pending" khi tạo mới)
- `qrCodeUrl` (string): URL QR code VietQR để thanh toán
- `courses` (array): Danh sách khóa học trong đơn hàng

**Error Responses:**

```json
// Missing required fields
{
  "success": false,
  "error": "Email và danh sách khóa học là bắt buộc"
}

// No valid courses
{
  "success": false,
  "error": "Không có khóa học hợp lệ"
}

// Server error
{
  "success": false,
  "error": "Lỗi server nội bộ khi tạo đơn hàng"
}
```

#### Frontend Usage Example

```javascript
async function createOrder(email, courses) {
  try {
    const response = await fetch('http://your-domain.com/api/v1/payment/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        courses: courses
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('Order created successfully!');
      console.log('Order Code:', data.orderCode);
      console.log('QR Code URL:', data.qrCodeUrl);
      
      // Hiển thị QR code
      displayQRCode(data.qrCodeUrl, data.orderCode, data.totalAmount);
      
      // Bắt đầu polling để check payment status
      startPollingOrderStatus(data.orderCode);
      
      return data;
    } else {
      throw new Error(data.error || 'Failed to create order');
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
```

---

### 3. Check Order Status

**Kiểm tra trạng thái thanh toán của đơn hàng (dùng cho polling)**

#### Request

```http
GET /api/v1/payment/check-status/{orderCode}
```

**URL Parameters:**
- `orderCode` (string, required): Mã đơn hàng (ví dụ: DH000123)

**Example:**
```
GET /api/v1/payment/check-status/DH000123
```

#### Response

**Success (200):**

```json
{
  "success": true,
  "status": "paid",
  "amount": 4000
}
```

**Response Fields:**
- `success` (boolean): Trạng thái request
- `status` (string): Trạng thái thanh toán
  - `"pending"`: Chưa thanh toán
  - `"paid"`: Đã thanh toán (khóa học đang được xử lý)
- `amount` (number): Tổng tiền đơn hàng

**Status Values Explained:**
- `pending`: Đơn hàng đã tạo, chờ khách hàng thanh toán
- `paid`: Đã thanh toán, hệ thống đang xử lý download
  - Job đã được push vào Redis Queue
  - Workers đang download khóa học
  - Sẽ tự động upload lên Google Drive và gửi email

**Error Responses:**

```json
// Order not found
{
  "success": false,
  "message": "Order not found",
  "orderCode": "DH000123"
}

// Invalid order code format
{
  "success": false,
  "message": "Invalid order code format. Order code must start with \"DH\" followed by digits (e.g., DH123456)",
  "received": "INVALID123"
}

// Malformed template variable (client-side issue)
{
  "success": false,
  "message": "Invalid order code format. The order code appears to be a template variable that was not replaced...",
  "received": "${orderCode}",
  "hint": "Order code should be in format: DH123456 (not {orderData.orderCode} or ${orderCode})"
}
```

#### Frontend Usage Example

```javascript
// Polling function - Check order status every 3 seconds
function startPollingOrderStatus(orderCode) {
  let pollCount = 0;
  const maxPolls = 100; // 100 * 3s = 5 minutes max
  
  const pollInterval = setInterval(async () => {
    pollCount++;
    
    try {
      const response = await fetch(`http://your-domain.com/api/v1/payment/check-status/${orderCode}`);
      const data = await response.json();
      
      if (data.success) {
        console.log(`Poll #${pollCount} - Status:`, data.status);
        
        if (data.status === 'paid') {
          // Payment confirmed!
          clearInterval(pollInterval);
          onPaymentSuccess(orderCode);
        }
      } else {
        console.error('Failed to check status:', data.message);
      }
      
      // Stop polling after max attempts
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        onPollingTimeout();
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  }, 3000); // Poll every 3 seconds
  
  return pollInterval;
}

function onPaymentSuccess(orderCode) {
  console.log('✅ Payment confirmed!');
  alert(`Thanh toán thành công! Mã đơn hàng: ${orderCode}\n\nKhóa học đang được xử lý và sẽ được gửi đến email của bạn trong vòng 15-30 phút.`);
  
  // Redirect to success page
  window.location.href = `/order-success?orderCode=${orderCode}`;
}

function onPollingTimeout() {
  console.warn('⏱️ Polling timeout');
  alert('Chưa nhận được xác nhận thanh toán. Vui lòng kiểm tra lại sau.');
}
```

---

## Complete User Flow

### Step-by-Step Implementation

```javascript
// ============================================
// COMPLETE FLOW: From URL Input to Payment
// ============================================

class CourseOrderFlow {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
    this.pollInterval = null;
  }

  // Step 1: Get course information
  async getCourseInfo(urls) {
    const response = await fetch(`${this.apiBaseUrl}/get-course-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });
    
    const data = await response.json();
    if (!data.success) throw new Error('Failed to get course info');
    
    return data;
  }

  // Step 2: Create order
  async createOrder(email, courses) {
    const response = await fetch(`${this.apiBaseUrl}/payment/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, courses })
    });
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to create order');
    
    return data;
  }

  // Step 3: Check order status
  async checkOrderStatus(orderCode) {
    const response = await fetch(`${this.apiBaseUrl}/payment/check-status/${orderCode}`);
    const data = await response.json();
    
    if (!data.success) throw new Error(data.message || 'Failed to check status');
    
    return data;
  }

  // Step 4: Start polling
  startPolling(orderCode, onPaid, onTimeout) {
    let pollCount = 0;
    const maxPolls = 100; // 5 minutes
    
    this.pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        const status = await this.checkOrderStatus(orderCode);
        
        if (status.status === 'paid') {
          this.stopPolling();
          onPaid(orderCode);
        } else if (pollCount >= maxPolls) {
          this.stopPolling();
          onTimeout();
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // Complete flow
  async processOrder(email, courseUrls) {
    try {
      // Step 1: Get course info
      console.log('Step 1: Getting course info...');
      const courseInfo = await this.getCourseInfo(courseUrls);
      console.log(`Found ${courseInfo.validCourseCount} valid courses`);
      console.log(`Total: ${courseInfo.totalAmount} VND`);
      
      // Filter only valid courses
      const validCourses = courseInfo.results.filter(c => c.success);
      
      if (validCourses.length === 0) {
        throw new Error('No valid courses found');
      }
      
      // Step 2: Create order
      console.log('Step 2: Creating order...');
      const order = await this.createOrder(email, validCourses);
      console.log(`Order created: ${order.orderCode}`);
      console.log(`QR Code: ${order.qrCodeUrl}`);
      
      // Step 3: Display QR code
      this.displayQRCode(order);
      
      // Step 4: Start polling
      console.log('Step 3: Waiting for payment...');
      this.startPolling(
        order.orderCode,
        (orderCode) => {
          console.log('✅ Payment confirmed!');
          this.onPaymentSuccess(orderCode);
        },
        () => {
          console.log('⏱️ Polling timeout');
          this.onPollingTimeout();
        }
      );
      
      return order;
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }

  displayQRCode(order) {
    // Implementation: Show QR code to user
    console.log('='.repeat(50));
    console.log('SCAN QR CODE TO PAY');
    console.log(`Order Code: ${order.orderCode}`);
    console.log(`Amount: ${order.totalAmount} VND`);
    console.log(`QR Code URL: ${order.qrCodeUrl}`);
    console.log('='.repeat(50));
  }

  onPaymentSuccess(orderCode) {
    // Implementation: Handle successful payment
    alert(`✅ Thanh toán thành công!\n\nMã đơn hàng: ${orderCode}\n\nKhóa học sẽ được gửi đến email của bạn trong 15-30 phút.`);
  }

  onPollingTimeout() {
    // Implementation: Handle timeout
    alert('⏱️ Chưa nhận được xác nhận thanh toán. Vui lòng kiểm tra lại.');
  }
}

// Usage Example
const flow = new CourseOrderFlow('http://your-domain.com/api/v1');

// Process order
flow.processOrder(
  'customer@example.com',
  [
    'https://samsung.udemy.com/course/python-bootcamp/',
    'https://samsung.udemy.com/course/web-development/'
  ]
).then(order => {
  console.log('Order processing started:', order.orderCode);
}).catch(error => {
  console.error('Failed to process order:', error);
});
```

---

## Frontend Implementation Examples

### React Example

```jsx
import React, { useState, useEffect } from 'react';

function CourseOrderPage() {
  const [email, setEmail] = useState('');
  const [courseUrls, setCourseUrls] = useState('');
  const [courseInfo, setCourseInfo] = useState(null);
  const [order, setOrder] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const API_BASE = 'http://your-domain.com/api/v1';

  // Step 1: Get course info
  const handleGetCourseInfo = async () => {
    setLoading(true);
    try {
      const urls = courseUrls.split('\n').filter(url => url.trim());
      
      const response = await fetch(`${API_BASE}/get-course-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setCourseInfo(data);
      } else {
        alert('Failed to get course info');
      }
    } catch (error) {
      console.error(error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Create order
  const handleCreateOrder = async () => {
    setLoading(true);
    try {
      const validCourses = courseInfo.results.filter(c => c.success);
      
      const response = await fetch(`${API_BASE}/payment/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          courses: validCourses
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setOrder(data);
        // Start polling
        startPolling(data.orderCode);
      } else {
        alert('Failed to create order: ' + data.error);
      }
    } catch (error) {
      console.error(error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Poll order status
  const startPolling = (orderCode) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/payment/check-status/${orderCode}`);
        const data = await response.json();
        
        if (data.success) {
          setOrderStatus(data.status);
          
          if (data.status === 'paid') {
            clearInterval(interval);
            alert('✅ Thanh toán thành công! Khóa học sẽ được gửi đến email của bạn.');
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000);
    
    // Stop after 5 minutes
    setTimeout(() => clearInterval(interval), 300000);
  };

  return (
    <div className="container">
      <h1>Đặt Khóa Học Udemy</h1>
      
      {/* Step 1: Input URLs */}
      {!courseInfo && (
        <div>
          <h2>Bước 1: Nhập URL khóa học</h2>
          <textarea
            rows="5"
            placeholder="Nhập URL khóa học (mỗi dòng 1 URL)"
            value={courseUrls}
            onChange={(e) => setCourseUrls(e.target.value)}
          />
          <button onClick={handleGetCourseInfo} disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Lấy thông tin khóa học'}
          </button>
        </div>
      )}
      
      {/* Step 2: Show course info and create order */}
      {courseInfo && !order && (
        <div>
          <h2>Bước 2: Xác nhận đơn hàng</h2>
          <p>Tổng tiền: {courseInfo.totalAmount} VND</p>
          <p>Số khóa học hợp lệ: {courseInfo.validCourseCount}</p>
          
          <ul>
            {courseInfo.results.map((course, idx) => (
              <li key={idx}>
                {course.success ? '✅' : '❌'} {course.title || course.url}
              </li>
            ))}
          </ul>
          
          <input
            type="email"
            placeholder="Email của bạn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          
          <button onClick={handleCreateOrder} disabled={loading || !email}>
            {loading ? 'Đang tạo đơn...' : 'Tạo đơn hàng'}
          </button>
        </div>
      )}
      
      {/* Step 3: Show QR code and poll status */}
      {order && (
        <div>
          <h2>Bước 3: Quét mã QR để thanh toán</h2>
          <p>Mã đơn hàng: <strong>{order.orderCode}</strong></p>
          <p>Tổng tiền: <strong>{order.totalAmount} VND</strong></p>
          
          <img src={order.qrCodeUrl} alt="QR Code" style={{ width: 300 }} />
          
          <p>
            Trạng thái: {orderStatus === 'paid' ? '✅ Đã thanh toán' : '⏳ Chờ thanh toán...'}
          </p>
        </div>
      )}
    </div>
  );
}

export default CourseOrderPage;
```

### Vue.js Example

```vue
<template>
  <div class="course-order">
    <h1>Đặt Khóa Học Udemy</h1>
    
    <!-- Step 1: Input URLs -->
    <div v-if="!courseInfo">
      <h2>Bước 1: Nhập URL khóa học</h2>
      <textarea
        v-model="courseUrls"
        rows="5"
        placeholder="Nhập URL khóa học (mỗi dòng 1 URL)"
      ></textarea>
      <button @click="getCourseInfo" :disabled="loading">
        {{ loading ? 'Đang xử lý...' : 'Lấy thông tin khóa học' }}
      </button>
    </div>
    
    <!-- Step 2: Show course info -->
    <div v-if="courseInfo && !order">
      <h2>Bước 2: Xác nhận đơn hàng</h2>
      <p>Tổng tiền: {{ courseInfo.totalAmount }} VND</p>
      <p>Số khóa học: {{ courseInfo.validCourseCount }}</p>
      
      <ul>
        <li v-for="(course, idx) in courseInfo.results" :key="idx">
          {{ course.success ? '✅' : '❌' }} {{ course.title || course.url }}
        </li>
      </ul>
      
      <input
        v-model="email"
        type="email"
        placeholder="Email của bạn"
      />
      
      <button @click="createOrder" :disabled="loading || !email">
        {{ loading ? 'Đang tạo đơn...' : 'Tạo đơn hàng' }}
      </button>
    </div>
    
    <!-- Step 3: Show QR code -->
    <div v-if="order">
      <h2>Bước 3: Quét mã QR để thanh toán</h2>
      <p>Mã đơn hàng: <strong>{{ order.orderCode }}</strong></p>
      <p>Tổng tiền: <strong>{{ order.totalAmount }} VND</strong></p>
      
      <img :src="order.qrCodeUrl" alt="QR Code" style="width: 300px" />
      
      <p>
        Trạng thái: {{ orderStatus === 'paid' ? '✅ Đã thanh toán' : '⏳ Chờ thanh toán...' }}
      </p>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      email: '',
      courseUrls: '',
      courseInfo: null,
      order: null,
      orderStatus: null,
      loading: false,
      pollInterval: null
    };
  },
  
  methods: {
    async getCourseInfo() {
      this.loading = true;
      try {
        const urls = this.courseUrls.split('\n').filter(url => url.trim());
        
        const response = await fetch('http://your-domain.com/api/v1/get-course-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls })
        });
        
        const data = await response.json();
        
        if (data.success) {
          this.courseInfo = data;
        } else {
          alert('Failed to get course info');
        }
      } catch (error) {
        console.error(error);
        alert('Error: ' + error.message);
      } finally {
        this.loading = false;
      }
    },
    
    async createOrder() {
      this.loading = true;
      try {
        const validCourses = this.courseInfo.results.filter(c => c.success);
        
        const response = await fetch('http://your-domain.com/api/v1/payment/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: this.email,
            courses: validCourses
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          this.order = data;
          this.startPolling(data.orderCode);
        } else {
          alert('Failed to create order: ' + data.error);
        }
      } catch (error) {
        console.error(error);
        alert('Error: ' + error.message);
      } finally {
        this.loading = false;
      }
    },
    
    startPolling(orderCode) {
      this.pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`http://your-domain.com/api/v1/payment/check-status/${orderCode}`);
          const data = await response.json();
          
          if (data.success) {
            this.orderStatus = data.status;
            
            if (data.status === 'paid') {
              clearInterval(this.pollInterval);
              alert('✅ Thanh toán thành công! Khóa học sẽ được gửi đến email của bạn.');
            }
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 3000);
      
      // Stop after 5 minutes
      setTimeout(() => {
        if (this.pollInterval) {
          clearInterval(this.pollInterval);
        }
      }, 300000);
    }
  },
  
  beforeUnmount() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
};
</script>
```

---

## Error Handling

### Common Error Codes

| HTTP Status | Error Type | Description | Action |
|-------------|------------|-------------|--------|
| `400` | Bad Request | Missing required fields | Check request body |
| `403` | Forbidden | Invalid authentication | Not applicable for public APIs |
| `404` | Not Found | Order not found | Check order code |
| `500` | Server Error | Internal server error | Retry or contact support |

### Error Response Format

```json
{
  "success": false,
  "error": "Error message here",
  "message": "Detailed error message"
}
```

### Frontend Error Handling Example

```javascript
async function apiCall(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    // Check HTTP status
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data.error || data.message}`);
    }
    
    // Check success field
    if (!data.success) {
      throw new Error(data.error || data.message || 'Unknown error');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    
    // Show user-friendly error message
    if (error.message.includes('Failed to fetch')) {
      alert('Lỗi kết nối. Vui lòng kiểm tra internet và thử lại.');
    } else if (error.message.includes('404')) {
      alert('Không tìm thấy đơn hàng. Vui lòng kiểm tra mã đơn hàng.');
    } else if (error.message.includes('500')) {
      alert('Lỗi server. Vui lòng thử lại sau.');
    } else {
      alert('Lỗi: ' + error.message);
    }
    
    throw error;
  }
}
```

---

## Best Practices

### 1. Polling Best Practices

```javascript
// ✅ GOOD: Exponential backoff
let pollDelay = 2000; // Start with 2 seconds
const maxDelay = 10000; // Max 10 seconds

function pollWithBackoff(orderCode) {
  setTimeout(async () => {
    const status = await checkOrderStatus(orderCode);
    
    if (status.status !== 'paid') {
      // Increase delay exponentially
      pollDelay = Math.min(pollDelay * 1.5, maxDelay);
      pollWithBackoff(orderCode);
    }
  }, pollDelay);
}

// ❌ BAD: Fixed short interval (hammering server)
setInterval(() => checkOrderStatus(orderCode), 500); // Too fast!
```

### 2. User Experience

```javascript
// ✅ GOOD: Show loading states
<button disabled={loading}>
  {loading ? (
    <>
      <Spinner /> Đang xử lý...
    </>
  ) : (
    'Tạo đơn hàng'
  )}
</button>

// ✅ GOOD: Show clear instructions
<div className="payment-instructions">
  <h3>Hướng dẫn thanh toán:</h3>
  <ol>
    <li>Mở app ngân hàng của bạn</li>
    <li>Chọn "Quét mã QR"</li>
    <li>Quét mã QR bên dưới</li>
    <li>Xác nhận thanh toán {totalAmount} VND</li>
    <li>Chờ hệ thống xác nhận (15-30 giây)</li>
  </ol>
</div>

// ✅ GOOD: Show countdown timer
<p>Đang chờ thanh toán... {remainingTime}s</p>
```

### 3. Security

```javascript
// ✅ GOOD: Validate order code format before API call
function isValidOrderCode(orderCode) {
  return /^DH\d{6}$/.test(orderCode);
}

// ✅ GOOD: Sanitize user input
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    return null;
  }
}

// ❌ BAD: Send raw user input without validation
fetch('/api/v1/get-course-info', {
  body: JSON.stringify({ urls: rawInput }) // Dangerous!
});
```

### 4. Performance

```javascript
// ✅ GOOD: Debounce user input
import { debounce } from 'lodash';

const debouncedGetCourseInfo = debounce(getCourseInfo, 500);

<input
  onChange={(e) => debouncedGetCourseInfo(e.target.value)}
/>

// ✅ GOOD: Cache course info
const courseInfoCache = new Map();

async function getCourseInfoCached(url) {
  if (courseInfoCache.has(url)) {
    return courseInfoCache.get(url);
  }
  
  const info = await getCourseInfo(url);
  courseInfoCache.set(url, info);
  return info;
}

// ✅ GOOD: Cancel polling on unmount
useEffect(() => {
  const interval = startPolling(orderCode);
  
  return () => {
    clearInterval(interval); // Cleanup
  };
}, [orderCode]);
```

### 5. Error Recovery

```javascript
// ✅ GOOD: Retry failed requests
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (i === retries - 1) throw error;
      
      // Wait before retry (exponential backoff)
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

// ✅ GOOD: Provide manual refresh option
{error && (
  <div className="error-message">
    <p>Lỗi: {error}</p>
    <button onClick={retry}>Thử lại</button>
  </div>
)}
```

---

## Testing with Postman/cURL

### Test Get Course Info

```bash
curl -X POST http://your-domain.com/api/v1/get-course-info \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://samsung.udemy.com/course/python-bootcamp/"
    ]
  }'
```

### Test Create Order

```bash
curl -X POST http://your-domain.com/api/v1/payment/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "courses": [
      {
        "url": "https://samsung.udemy.com/course/python-bootcamp/",
        "title": "Python Bootcamp",
        "price": 2000
      }
    ]
  }'
```

### Test Check Order Status

```bash
curl http://your-domain.com/api/v1/payment/check-status/DH000123
```

---

## FAQs

### Q: Tại sao phải polling thay vì webhook?

**A:** Frontend không thể nhận webhook trực tiếp từ server. Polling là cách đơn giản và hiệu quả nhất để check payment status trong real-time từ browser.

### Q: Polling bao lâu là hợp lý?

**A:** Nên poll mỗi 3-5 giây, tối đa 5 phút. Sau khi thanh toán, webhook từ SePay thường đến trong vòng 5-30 giây.

### Q: Nếu user đóng browser trước khi thanh toán?

**A:** Không sao! Khi user thanh toán, webhook sẽ tự động trigger và xử lý. User chỉ cần kiểm tra email hoặc dùng mã đơn hàng để check status sau.

### Q: Làm sao biết khóa học đã download xong?

**A:** User sẽ nhận email với link Google Drive khi hoàn tất. Status trong database cũng sẽ chuyển từ `processing` → `completed`.

### Q: Nếu download thất bại?

**A:** Hệ thống có retry logic (3 lần). Nếu vẫn fail, admin có thể manually re-queue job. User sẽ được support team liên hệ.

### Q: API có rate limit không?

**A:** Hiện tại chưa có hard rate limit, nhưng nên tránh spam requests. Polling 3-5 giây là hợp lý.

---

## Support

### Contact

- **Technical Issues:** Check logs in `/root/server/logs/`
- **Payment Issues:** Check SePay webhook logs
- **Download Issues:** Check worker logs: `tail -f /root/server/logs/rq_worker_*.log`

### Debugging Tips

1. **Check API response in browser DevTools Network tab**
2. **Validate JSON payloads with JSON validator**
3. **Test with curl/Postman first before implementing in frontend**
4. **Check CORS settings if getting CORS errors**

---

## Changelog

### Version 2.0 (Jan 12, 2026)
- ✨ Updated to reflect Phase 2 architecture (Redis Queue)
- ✨ Simplified API endpoints (removed unnecessary endpoints)
- ✨ Improved error handling and validation
- ✨ Added comprehensive frontend examples
- 📚 Complete React and Vue.js examples

### Version 1.0 (Previous)
- Initial API documentation

---

**Last Updated:** January 12, 2026  
**API Version:** 2.0  
**Status:** ✅ Production Ready
