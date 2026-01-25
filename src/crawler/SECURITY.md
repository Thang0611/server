# Security Measures

## URL Validation

### Allowed Domains
Chỉ các domain sau được phép:
- `www.udemy.com`
- `udemy.com`
- `samsungu.udemy.com`

### URL Sanitization
- Loại bỏ query parameters và fragments
- Chỉ giữ lại protocol, hostname, và pathname
- Validate format URL (phải là http/https)
- Giới hạn độ dài (max 2048 characters)

### Input Validation
- Kiểm tra URL phải chứa `/course/`
- Validate URL format trước khi crawl
- Reject các URLs không hợp lệ với error messages rõ ràng

## Network Security

### Request Timeout
- Timeout: 30 seconds cho mỗi request
- Retry: Tối đa 2 lần cho các status codes: 408, 413, 429, 500, 502, 503, 504

### Headers
- User-Agent hợp lệ
- Referer header để tránh CSRF
- Cookie support (optional, từ file)

## Error Handling

### Graceful Failures
- Tất cả errors được catch và log
- Không expose internal errors ra ngoài
- Return user-friendly error messages

### Logging
- Log tất cả validation failures
- Log network errors với context
- Không log sensitive data (cookies, tokens)

## Code Security

### No Command Injection
- Không sử dụng `exec` hoặc `execSync` với user input
- Sử dụng module imports trực tiếp thay vì external scripts
- Validate tất cả inputs trước khi sử dụng

### Path Traversal Protection
- Validate và sanitize file paths
- Sử dụng absolute paths khi cần
- Không cho phép user input trong file paths

## Best Practices

1. **Always validate URLs** trước khi crawl
2. **Use sanitized URLs** trong tất cả operations
3. **Log security events** (invalid URLs, validation failures)
4. **Rate limiting** được handle ở API level
5. **Error messages** không expose internal details
