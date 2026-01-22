#!/usr/bin/env python3
"""
Script xuất tất cả khóa học với cấu trúc phân cấp và Google Drive ID
- Mỗi khóa học chứa các chương và bài học/subtitle/tài liệu
- Có phân cấp rõ ràng
- Có ID Google Drive cho từng file và khóa học
"""

import subprocess
import json
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
from collections import defaultdict

# Load environment variables
env_paths = [
    os.path.join(os.path.dirname(__file__), '../.env'),
    os.path.join(os.path.dirname(__file__), '../../.env'),
]
env_path = next((p for p in env_paths if os.path.exists(p)), None)
if env_path:
    load_dotenv(dotenv_path=env_path)

# Configuration
RCLONE_REMOTE = "gdrive"
RCLONE_DEST_PATH = "UdemyCourses/download_khoahoc"
OUTPUT_FILE = "courses_export.json"

def log(msg):
    """Log với timestamp"""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

def check_rclone():
    """Kiểm tra rclone có sẵn không"""
    try:
        subprocess.run(['rclone', 'version'], check=True, capture_output=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def get_file_type(file_name, mime_type):
    """Xác định loại file"""
    file_ext = os.path.splitext(file_name)[1].lower()
    
    # Video files
    if file_ext in ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']:
        return 'video'
    # Subtitle files
    elif file_ext in ['.srt', '.vtt']:
        return 'subtitle'
    # Document files
    elif file_ext in ['.pdf', '.doc', '.docx', '.txt', '.html']:
        return 'document'
    # JSON files
    elif file_ext == '.json':
        return 'json'
    # Other files
    else:
        return 'other'

def scan_course_with_structure(course_path, course_name):
    """Scan một khóa học với cấu trúc phân cấp đầy đủ"""
    log(f"  📁 Đang scan: {course_name}")
    
    course_data = {
        'course_name': course_name,
        'course_path': course_path,
        'course_id': None,
        'chapters': []
    }
    
    try:
        # Lấy thông tin folder khóa học (để lấy ID)
        cmd = ['rclone', 'lsjson', '--dirs-only', course_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            try:
                folders = json.loads(result.stdout)
                # Tìm folder chính (có thể là chính nó hoặc folder con)
                for folder in folders:
                    if folder.get('IsDir') and folder.get('Path') == '.' or not folder.get('Path'):
                        course_data['course_id'] = folder.get('ID')
                        break
            except json.JSONDecodeError:
                pass
        
        # Lấy tất cả files và folders với metadata
        cmd = ['rclone', 'lsjson', '--recursive', course_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            log(f"     ⚠️  Không thể lấy metadata từ rclone")
            return course_data
        
        try:
            items = json.loads(result.stdout)
        except json.JSONDecodeError as e:
            log(f"     ❌ Lỗi parse JSON: {e}")
            return course_data
        
        # Tổ chức dữ liệu theo cấu trúc phân cấp
        chapters_dict = defaultdict(lambda: {
            'chapter_name': '',
            'chapter_id': None,
            'chapter_path': '',
            'lessons': [],
            'subtitles': [],
            'documents': [],
            'other_files': []
        })
        
        for item in items:
            path = item.get('Path', '')
            name = item.get('Name', '')
            item_id = item.get('ID', '')
            is_dir = item.get('IsDir', False)
            size = item.get('Size', 0)
            mime_type = item.get('MimeType', '')
            
            # Bỏ qua folder gốc
            if path == '.' or not path:
                if is_dir and not course_data['course_id']:
                    course_data['course_id'] = item_id
                continue
            
            # Xác định chapter (folder đầu tiên trong path)
            if '/' in path:
                chapter_name = path.split('/')[0]
                file_path = '/'.join(path.split('/')[1:]) if len(path.split('/')) > 1 else ''
            else:
                # File ở root level
                chapter_name = '_root'
                file_path = path
            
            # Khởi tạo chapter nếu chưa có
            if chapter_name not in chapters_dict:
                # Tìm chapter ID từ danh sách folders
                chapter_id = None
                for folder_item in items:
                    if folder_item.get('IsDir') and folder_item.get('Path') == chapter_name:
                        chapter_id = folder_item.get('ID')
                        break
                
                chapters_dict[chapter_name] = {
                    'chapter_name': chapter_name,
                    'chapter_id': chapter_id,
                    'chapter_path': chapter_name,
                    'lessons': [],
                    'subtitles': [],
                    'documents': [],
                    'other_files': []
                }
            
            # Nếu là file (không phải folder)
            if not is_dir:
                file_type = get_file_type(name, mime_type)
                file_info = {
                    'file_name': name,
                    'file_id': item_id,
                    'file_type': file_type,
                    'file_size': size,
                    'file_path': path,
                    'mime_type': mime_type
                }
                
                if file_type == 'video':
                    chapters_dict[chapter_name]['lessons'].append(file_info)
                elif file_type == 'subtitle':
                    chapters_dict[chapter_name]['subtitles'].append(file_info)
                elif file_type == 'document':
                    chapters_dict[chapter_name]['documents'].append(file_info)
                else:
                    chapters_dict[chapter_name]['other_files'].append(file_info)
        
        # Chuyển từ dict sang list và sắp xếp
        chapters_list = []
        for chapter_name in sorted(chapters_dict.keys()):
            chapter = chapters_dict[chapter_name]
            # Sắp xếp các files trong chapter
            chapter['lessons'].sort(key=lambda x: x['file_name'])
            chapter['subtitles'].sort(key=lambda x: x['file_name'])
            chapter['documents'].sort(key=lambda x: x['file_name'])
            chapter['other_files'].sort(key=lambda x: x['file_name'])
            chapters_list.append(chapter)
        
        course_data['chapters'] = chapters_list
        
        # Thống kê
        total_lessons = sum(len(ch['lessons']) for ch in chapters_list)
        total_subtitles = sum(len(ch['subtitles']) for ch in chapters_list)
        total_documents = sum(len(ch['documents']) for ch in chapters_list)
        
        log(f"     ✓ {len(chapters_list)} chapter(s), {total_lessons} lesson(s), {total_subtitles} subtitle(s), {total_documents} document(s)")
        
    except subprocess.TimeoutExpired:
        log(f"     ⚠️  Timeout khi scan")
    except Exception as e:
        log(f"     ❌ Lỗi: {str(e)[:150]}")
    
    return course_data

def scan_all_courses():
    """Scan tất cả khóa học"""
    log("=" * 80)
    log("SCANNING TẤT CẢ KHÓA HỌC VỚI CẤU TRÚC PHÂN CẤP")
    log("=" * 80)
    
    if not check_rclone():
        log("❌ rclone không được cài đặt hoặc không có trong PATH")
        return []
    
    remote_path = f"{RCLONE_REMOTE}:{RCLONE_DEST_PATH}"
    log(f"📂 Remote path: {remote_path}")
    
    courses = []
    
    try:
        # Lấy danh sách folders (khóa học)
        cmd = ['rclone', 'lsf', '--dirs-only', remote_path]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        if not result.stdout.strip():
            log("⚠️  Không tìm thấy folder nào trong Google Drive")
            return []
        
        folder_lines = [l.strip() for l in result.stdout.strip().split('\n') if l.strip() and l.strip().endswith('/')]
        total_folders = len(folder_lines)
        log(f"\n📚 Tìm thấy {total_folders} khóa học:")
        
        for idx, folder_line in enumerate(folder_lines, 1):
            folder_name = folder_line.rstrip('/')
            course_path = f"{remote_path}/{folder_name}"
            
            log(f"\n[{idx}/{total_folders}] {folder_name}")
            
            course_data = scan_course_with_structure(course_path, folder_name)
            courses.append(course_data)
        
    except subprocess.CalledProcessError as e:
        log(f"❌ Lỗi khi list folders từ rclone: {e}")
        log(f"   Output: {e.stderr}")
        return []
    except Exception as e:
        log(f"❌ Lỗi không mong đợi: {e}")
        return []
    
    return courses

def export_to_json(courses, output_file):
    """Xuất dữ liệu ra file JSON"""
    log("\n" + "=" * 80)
    log("XUẤT DỮ LIỆU RA FILE JSON")
    log("=" * 80)
    
    export_data = {
        'export_date': datetime.now().isoformat(),
        'total_courses': len(courses),
        'courses': courses
    }
    
    # Tính tổng số
    total_chapters = sum(len(course['chapters']) for course in courses)
    total_lessons = sum(sum(len(ch['lessons']) for ch in course['chapters']) for course in courses)
    total_subtitles = sum(sum(len(ch['subtitles']) for ch in course['chapters']) for course in courses)
    total_documents = sum(sum(len(ch['documents']) for ch in course['chapters']) for course in courses)
    
    export_data['statistics'] = {
        'total_courses': len(courses),
        'total_chapters': total_chapters,
        'total_lessons': total_lessons,
        'total_subtitles': total_subtitles,
        'total_documents': total_documents
    }
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)
        
        file_size = os.path.getsize(output_file)
        log(f"\n✅ Đã xuất thành công!")
        log(f"   📄 File: {output_file}")
        log(f"   📊 Kích thước: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
        log(f"   📚 Tổng số khóa học: {len(courses)}")
        log(f"   📖 Tổng số chương: {total_chapters}")
        log(f"   🎥 Tổng số bài học: {total_lessons}")
        log(f"   📝 Tổng số subtitle: {total_subtitles}")
        log(f"   📄 Tổng số tài liệu: {total_documents}")
        
        return True
    except Exception as e:
        log(f"❌ Lỗi khi xuất file: {e}")
        return False

def main():
    """Hàm chính"""
    log("🚀 Bắt đầu scan và xuất tất cả khóa học với Google Drive ID...")
    log("")
    
    # Scan tất cả khóa học
    courses = scan_all_courses()
    
    if not courses:
        log("\n⚠️  Không tìm thấy khóa học nào")
        return
    
    # Xuất ra file JSON
    output_path = os.path.join(os.path.dirname(__file__), OUTPUT_FILE)
    success = export_to_json(courses, output_path)
    
    if success:
        log("\n" + "=" * 80)
        log("✅ Hoàn thành!")
        log("=" * 80)
        log(f"\n📄 File đã được lưu tại: {output_path}")
        log(f"   Bạn có thể mở file này để xem chi tiết tất cả khóa học với cấu trúc phân cấp và Google Drive ID")
    else:
        log("\n❌ Có lỗi xảy ra khi xuất file")

if __name__ == "__main__":
    main()
