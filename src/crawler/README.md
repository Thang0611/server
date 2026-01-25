# Course Crawler Module

Module này chứa các công cụ để crawl thông tin khóa học từ Udemy.

## Cấu trúc

- `getCourseInfo.js` - Crawl thông tin đầy đủ của khóa học (title, instructor, rating, description, curriculum, etc.)
- `scanCurriculum.js` - Crawl curriculum (sections và lectures) từ khóa học
- `urlValidator.js` - Validate và sanitize URLs để đảm bảo an toàn

## Security Features

### URL Validation
- Chỉ cho phép các domain được phép: `www.udemy.com`, `udemy.com`, `samsungu.udemy.com`
- Validate format URL (phải là http/https)
- Sanitize URL (loại bỏ query params và fragments)
- Giới hạn độ dài URL (max 2048 characters)
- Kiểm tra URL phải chứa `/course/`

### Input Sanitization
- Tự động sanitize URLs trước khi crawl
- Loại bỏ các ký tự nguy hiểm
- Validate input types

### Error Handling
- Retry logic cho network requests
- Timeout protection (30s cho requests)
- Graceful error handling với logging

## Usage

### Direct Module Usage

```javascript
const { getFullCourseInfo } = require('./src/crawler/getCourseInfo');
const { validateCourseUrl } = require('./src/crawler/urlValidator');

// Validate URL first
const validation = validateCourseUrl(url);
if (!validation.valid) {
  throw new Error(validation.error);
}

// Crawl course info
const courseData = await getFullCourseInfo(validation.sanitized, {
  silent: true, // Suppress console logs
  cookiesPath: './cookies.txt' // Optional
});
```

### Via API

```bash
POST /api/courses/import
Content-Type: application/json

{
  "urls": [
    "https://www.udemy.com/course/your-course-url/"
  ],
  "shouldDownload": false
}
```

API sẽ tự động:
1. Validate và sanitize tất cả URLs
2. Reject các URLs không hợp lệ
3. Crawl và import courses vào database

## API Reference

### `validateCourseUrl(url)`
Validate và sanitize một URL.

**Parameters:**
- `url` (string): Course URL to validate

**Returns:**
```javascript
{
  valid: boolean,
  sanitized: string | null,
  error: string | null
}
```

### `validateCourseUrls(urls)`
Validate nhiều URLs.

**Parameters:**
- `urls` (Array<string>): Array of URLs

**Returns:**
```javascript
{
  valid: Array<string>, // Sanitized valid URLs
  invalid: Array<{url: string, error: string}> // Invalid URLs with errors
}
```

### `getFullCourseInfo(url, options)`
Crawl thông tin đầy đủ của khóa học.

**Parameters:**
- `url` (string): Course URL (must be validated)
- `options` (Object, optional):
  - `silent` (boolean): Suppress console logs (default: false)
  - `cookiesPath` (string): Path to cookies file (default: null)

**Returns:**
```javascript
{
  url: string,
  title: string,
  thumbnail: string,
  instructor: {...},
  rating: {...},
  curriculum: {
    total_sections: number,
    total_lectures: number,
    sections: [...]
  },
  ...
}
```

### `getCurriculumFromUrl(urlOrOptions, options)`
Crawl curriculum từ URL.

**Parameters:**
- `urlOrOptions` (string | Object): Course URL or options object
- `options` (Object, optional): Options if first param is string

**Returns:**
```javascript
{
  course_id: string,
  title: string,
  curriculum: {
    total_sections: number,
    total_lectures: number,
    total_duration_seconds: number,
    sections: [...]
  }
}
```

## Migration Notes

Crawler đã được di chuyển từ `/root/project/craw/` vào `/root/project/server/src/crawler/` để:
- Tăng tính bảo mật (không cần exec external scripts)
- Dễ dàng maintain và test
- Tích hợp tốt hơn với server codebase
- Có validation và sanitization

## Dependencies

- `cheerio` - HTML parsing
- `got-scraping` - HTTP client với anti-bot features
- `fs` - File system operations
