# Course Import API

API endpoint để import khóa học từ danh sách URL vào database.

## Endpoint

```
POST /api/courses/import
```

## Request Body

```json
{
  "urls": [
    "https://www.udemy.com/course/example-course-1/",
    "https://www.udemy.com/course/example-course-2/"
  ],
  "shouldDownload": false
}
```

### Parameters

- `urls` (required): Array of course URLs (strings)
- `shouldDownload` (optional): Boolean - `true` để đánh dấu download permanent, `false` để chỉ import thông tin (default: `false`)

## Response

### Success Response

```json
{
  "success": true,
  "message": "Đã xử lý 2 khóa học: 1 mới, 1 cập nhật, 0 lỗi",
  "total": 2,
  "imported": 1,
  "updated": 1,
  "failed": 0,
  "results": [
    {
      "success": true,
      "url": "https://www.udemy.com/course/example-course-1/",
      "courseId": 10,
      "title": "Example Course 1",
      "created": true,
      "hasCurriculum": true
    },
    {
      "success": true,
      "url": "https://www.udemy.com/course/example-course-2/",
      "courseId": 11,
      "title": "Example Course 2",
      "created": false,
      "hasCurriculum": true
    }
  ],
  "errors": []
}
```

### Error Response

```json
{
  "success": false,
  "error": "Vui lòng cung cấp danh sách URL hợp lệ"
}
```

## Example Usage

### cURL

```bash
curl -X POST http://localhost:3001/api/courses/import \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.udemy.com/course/learn-and-understand-apis-and-restful-apis/",
      "https://www.udemy.com/course/css-crash-course-for-beginners-g/"
    ],
    "shouldDownload": false
  }'
```

### JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:3001/api/courses/import', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    urls: [
      'https://www.udemy.com/course/example-course-1/',
      'https://www.udemy.com/course/example-course-2/'
    ],
    shouldDownload: false
  })
});

const result = await response.json();
console.log(result);
```

## Notes

- API sẽ tự động craw thông tin khóa học từ URL
- Import cả curriculum (sections và lectures) nếu có
- Nếu course đã tồn tại (theo URL), sẽ cập nhật thông tin
- Có delay 2 giây giữa các request để tránh rate limiting
- `shouldDownload` hiện tại chỉ là flag, chưa tự động trigger download
