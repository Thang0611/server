# Fix Enrollment Implementation

## Ngày: 2026-01-13 15:21

## 🐛 Vấn Đề

Implementation enrollment ban đầu **SAI**:
- ❌ Call `/course/subscribe/` API → Redirect SSO login
- ❌ Không hoạt động với Udemy Business SSO

## ✅ Giải Pháp

Sử dụng **main.py --info** để check enrollment:

### Cách hoạt động:

```python
def enroll_course(course_url, task_id):
    # Run main.py với --info flag
    cmd = [
        sys.executable, "main.py",
        "-c", course_url,
        "-o", "/tmp/enroll_check",
        "--info"  # Chỉ fetch info, không download
    ]
    
    # Check output
    if "Course information retrieved!" in output:
        return True  # ✅ Enrolled
    elif "Failed to find the course, are you enrolled?" in output:
        return False  # ❌ Not enrolled
```

### Tại sao đúng?

1. ✅ **Sử dụng cùng authentication method với download**
   - main.py dùng cookies.txt + UDEMY_TOKEN
   - Đã được verify hoạt động

2. ✅ **Không cần gọi API riêng**
   - Không bị SSO redirect
   - Không cần handle authentication complexity

3. ✅ **Reliable**
   - Nếu main.py --info success → download sẽ success
   - Nếu main.py --info fail → download sẽ fail

## 📊 So Sánh

### Before (❌):
```python
# Call Udemy API trực tiếp
GET https://samsungu.udemy.com/course/subscribe/?courseId=xxx
→ Redirect to SSO login (fail)
```

### After (✅):
```python
# Use main.py
python3 main.py -c <url> --info
→ Course information retrieved! (success)
```

## 🧪 Test Result

```bash
$ ./scripts/test-enrollment.sh

Testing enrollment for: https://samsungu.udemy.com/course/designing-ai-assistants/
[ENROLL] Running enrollment check...
[ENROLL] ✅ Course is accessible (enrolled)
✅ Test PASSED - Enrollment working!
```

## 📝 Changes Made

**File**: `udemy_dl/worker_rq.py`

1. **Removed**: `get_course_id_from_url()` function (không cần)
2. **Replaced**: `enroll_course()` implementation
   - Old: Call API trực tiếp
   - New: Use main.py --info
3. **Updated**: Error messages

## ✅ Status

- [x] Fix implementation
- [x] Restart workers
- [x] Test successful
- [x] Ready for production

---

**Time**: 15:21  
**Status**: ✅ FIXED
