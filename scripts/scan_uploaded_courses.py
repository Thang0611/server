#!/usr/bin/env python3
"""
Script tạm để scan các khóa học, bài học, subtitle đã upload
- Scan Google Drive qua rclone
- Kiểm tra database (worker_rq.py đã upload)
- Tìm các file JSON
"""

import subprocess
import json
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
import mysql.connector
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

# Database config
DB_CONFIG = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
}

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

def scan_rclone_uploads():
    """Scan các khóa học đã upload qua rclone"""
    log("=" * 80)
    log("SCANNING GOOGLE DRIVE VIA RCLONE")
    log("=" * 80)
    
    if not check_rclone():
        log("❌ rclone không được cài đặt hoặc không có trong PATH")
        return {}
    
    remote_path = f"{RCLONE_REMOTE}:{RCLONE_DEST_PATH}"
    log(f"📂 Remote path: {remote_path}")
    
    courses_info = {}
    
    try:
        # Use rclone lsf to get folder names directly (more reliable)
        # lsf returns just the folder names with trailing slash
        cmd = ['rclone', 'lsf', '--dirs-only', remote_path]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        if not result.stdout.strip():
            log("⚠️  Không tìm thấy folder nào trong Google Drive")
            return {}
        
        folder_lines = [l.strip() for l in result.stdout.strip().split('\n') if l.strip() and l.strip().endswith('/')]
        total_folders = len(folder_lines)
        log(f"\n📚 Tìm thấy {total_folders} folder(s):")
        
        for idx, folder_line in enumerate(folder_lines, 1):
            # Remove trailing slash to get folder name
            folder_name = folder_line.rstrip('/')
            log(f"  📁 [{idx}/{total_folders}] {folder_name}")
            
            # Scan files in this course folder
            course_path = f"{remote_path}/{folder_name}"
            courses_info[folder_name] = {
                'path': course_path,
                'chapters': [],
                'lessons': [],
                'subtitles': [],
                'json_files': []
            }
            
            # List all files recursively - rclone ls automatically lists recursively
            try:
                # rclone ls automatically lists recursively, no need for --recursive flag
                # Use --fast-list for better performance with Google Drive
                # Reduced timeout to 30s per folder to speed up overall scan
                cmd = ['rclone', 'ls', '--fast-list', course_path]
                files_result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                
                if files_result.returncode == 0:
                    if files_result.stdout.strip():
                        # Parse rclone ls output: "12345 file/path/name.ext"
                        file_count = 0
                        for line in files_result.stdout.strip().split('\n'):
                            if not line.strip():
                                continue
                            
                            # Extract file path (everything after the first space)
                            parts = line.strip().split(None, 1)
                            if len(parts) >= 2:
                                file_path = parts[1]
                                file_name = os.path.basename(file_path)
                                file_ext = os.path.splitext(file_name)[1].lower()
                                
                                file_count += 1
                                
                                # Check for subtitles
                                if file_ext in ['.srt', '.vtt']:
                                    courses_info[folder_name]['subtitles'].append(file_path)
                                
                                # Check for JSON files
                                elif file_ext == '.json':
                                    courses_info[folder_name]['json_files'].append(file_path)
                                
                                # Check for video files (lessons)
                                elif file_ext in ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']:
                                    courses_info[folder_name]['lessons'].append(file_path)
                                
                                # Check for chapter folders (sections)
                                if '/' in file_path:
                                    chapter_name = file_path.split('/')[0]
                                    if chapter_name not in courses_info[folder_name]['chapters']:
                                        courses_info[folder_name]['chapters'].append(chapter_name)
                        
                        if file_count > 0:
                            log(f"     ✓ Tìm thấy {file_count} file(s), {len(courses_info[folder_name]['chapters'])} chapter(s), {len(courses_info[folder_name]['lessons'])} lesson(s), {len(courses_info[folder_name]['subtitles'])} subtitle(s)")
                        else:
                            log(f"     ⚠️  Folder trống")
                    else:
                        log(f"     ⚠️  Folder trống hoặc không có file")
                else:
                    # Try without --fast-list as fallback (some rclone versions may not support it)
                    log(f"     ⚠️  Lỗi với --fast-list, thử lại không dùng flag này...")
                    cmd = ['rclone', 'ls', course_path]
                    files_result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                    
                    if files_result.returncode == 0 and files_result.stdout.strip():
                        file_count = 0
                        for line in files_result.stdout.strip().split('\n'):
                            if not line.strip():
                                continue
                            
                            parts = line.strip().split(None, 1)
                            if len(parts) >= 2:
                                file_path = parts[1]
                                file_name = os.path.basename(file_path)
                                file_ext = os.path.splitext(file_name)[1].lower()
                                
                                file_count += 1
                                
                                if file_ext in ['.srt', '.vtt']:
                                    courses_info[folder_name]['subtitles'].append(file_path)
                                elif file_ext == '.json':
                                    courses_info[folder_name]['json_files'].append(file_path)
                                elif file_ext in ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']:
                                    courses_info[folder_name]['lessons'].append(file_path)
                                
                                if '/' in file_path:
                                    chapter_name = file_path.split('/')[0]
                                    if chapter_name not in courses_info[folder_name]['chapters']:
                                        courses_info[folder_name]['chapters'].append(chapter_name)
                        
                        if file_count > 0:
                            log(f"     ✓ Tìm thấy {file_count} file(s), {len(courses_info[folder_name]['chapters'])} chapter(s), {len(courses_info[folder_name]['lessons'])} lesson(s), {len(courses_info[folder_name]['subtitles'])} subtitle(s)")
                    else:
                        error_msg = files_result.stderr.strip() if files_result.stderr else "Unknown error"
                        log(f"     ❌ Lỗi: {error_msg[:100]}")
            
            except subprocess.TimeoutExpired:
                log(f"     ⚠️  Timeout khi scan folder (quá 30s) - bỏ qua")
            except subprocess.CalledProcessError as e:
                error_detail = e.stderr.strip() if e.stderr else str(e)
                log(f"     ❌ Lỗi rclone: {error_detail[:150]}")
            except Exception as e:
                log(f"     ❌ Lỗi không mong đợi: {str(e)[:150]}")
    
    except subprocess.CalledProcessError as e:
        log(f"❌ Lỗi khi list folders từ rclone: {e}")
        log(f"   Output: {e.stderr}")
        return {}
    except Exception as e:
        log(f"❌ Lỗi không mong đợi: {e}")
        return {}
    
    return courses_info

def scan_database_uploads():
    """Scan các task đã upload qua worker_rq.py từ database"""
    log("\n" + "=" * 80)
    log("SCANNING DATABASE (worker_rq.py uploads)")
    log("=" * 80)
    
    tasks_info = []
    
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        
        # Get all completed tasks with drive_link
        query = """
            SELECT 
                id, 
                order_id, 
                email, 
                course_url, 
                title, 
                status, 
                drive_link, 
                created_at, 
                updated_at
            FROM download_tasks
            WHERE status IN ('completed', 'enrolled')
            AND drive_link IS NOT NULL
            AND drive_link != ''
            ORDER BY updated_at DESC
        """
        
        cursor.execute(query)
        tasks = cursor.fetchall()
        
        log(f"\n📊 Tìm thấy {len(tasks)} task(s) đã hoàn thành với drive_link:")
        
        for task in tasks:
            log(f"  ✅ Task #{task['id']}: {task['title'] or 'N/A'}")
            log(f"     Email: {task['email']}")
            log(f"     Drive Link: {task['drive_link']}")
            log(f"     Updated: {task['updated_at']}")
            
            tasks_info.append({
                'task_id': task['id'],
                'order_id': task['order_id'],
                'email': task['email'],
                'title': task['title'],
                'course_url': task['course_url'],
                'drive_link': task['drive_link'],
                'status': task['status'],
                'created_at': str(task['created_at']),
                'updated_at': str(task['updated_at'])
            })
        
        cursor.close()
        conn.close()
        
    except mysql.connector.Error as e:
        log(f"❌ Lỗi database: {e}")
        return []
    except Exception as e:
        log(f"❌ Lỗi không mong đợi: {e}")
        return []
    
    return tasks_info

def scan_json_files():
    """Scan các file JSON trong thư mục saved"""
    log("\n" + "=" * 80)
    log("SCANNING JSON FILES")
    log("=" * 80)
    
    json_files = []
    
    # Check saved directory in udemy_dl
    saved_dir = os.path.join(os.path.dirname(__file__), '../udemy_dl/saved')
    
    if os.path.exists(saved_dir):
        log(f"📂 Scanning: {saved_dir}")
        
        for root, dirs, files in os.walk(saved_dir):
            for file in files:
                if file.endswith('.json'):
                    file_path = os.path.join(root, file)
                    json_files.append(file_path)
                    log(f"  📄 {file_path}")
    
    # Check for course_content.json and _udemy.json in udemy_dl root
    udemy_dl_dir = os.path.join(os.path.dirname(__file__), '../udemy_dl')
    for json_file in ['course_content.json', '_udemy.json']:
        json_path = os.path.join(udemy_dl_dir, json_file)
        if os.path.exists(json_path):
            json_files.append(json_path)
            log(f"  📄 {json_path}")
    
    if not json_files:
        log("⚠️  Không tìm thấy file JSON nào")
    
    return json_files

def generate_summary(rclone_data, db_tasks, json_files):
    """Tạo báo cáo tổng hợp"""
    log("\n" + "=" * 80)
    log("📊 TỔNG HỢP BÁO CÁO")
    log("=" * 80)
    
    # Rclone summary
    total_courses_rclone = len(rclone_data)
    total_lessons_rclone = sum(len(course['lessons']) for course in rclone_data.values())
    total_subtitles_rclone = sum(len(course['subtitles']) for course in rclone_data.values())
    total_chapters_rclone = sum(len(course['chapters']) for course in rclone_data.values())
    total_json_rclone = sum(len(course['json_files']) for course in rclone_data.values())
    
    log(f"\n📚 GOOGLE DRIVE (RCLONE):")
    log(f"   • Tổng số khóa học: {total_courses_rclone}")
    log(f"   • Tổng số chapter: {total_chapters_rclone}")
    log(f"   • Tổng số bài học (video): {total_lessons_rclone}")
    log(f"   • Tổng số subtitle: {total_subtitles_rclone}")
    log(f"   • Tổng số file JSON: {total_json_rclone}")
    
    # Database summary
    log(f"\n💾 DATABASE (worker_rq.py):")
    log(f"   • Tổng số task đã hoàn thành: {len(db_tasks)}")
    
    # Group by status
    status_count = defaultdict(int)
    for task in db_tasks:
        status_count[task['status']] += 1
    
    for status, count in status_count.items():
        log(f"   • Status '{status}': {count} task(s)")
    
    # JSON files summary
    log(f"\n📄 JSON FILES:")
    log(f"   • Tổng số file JSON: {len(json_files)}")
    
    # Detailed course breakdown
    if rclone_data:
        log(f"\n📋 CHI TIẾT TỪNG KHÓA HỌC:")
        for course_name, course_info in rclone_data.items():
            log(f"\n   📚 {course_name}:")
            log(f"      • Chapters: {len(course_info['chapters'])}")
            log(f"      • Lessons: {len(course_info['lessons'])}")
            log(f"      • Subtitles: {len(course_info['subtitles'])}")
            log(f"      • JSON files: {len(course_info['json_files'])}")
            
            # Show subtitle languages if available
            if course_info['subtitles']:
                subtitle_langs = set()
                for sub_path in course_info['subtitles']:
                    # Try to extract language from filename (format: LectureName_lang.srt)
                    parts = os.path.basename(sub_path).split('_')
                    if len(parts) >= 2:
                        lang = parts[-1].replace('.srt', '').replace('.vtt', '')
                        subtitle_langs.add(lang)
                
                if subtitle_langs:
                    log(f"      • Ngôn ngữ subtitle: {', '.join(sorted(subtitle_langs))}")

def main():
    """Hàm chính"""
    log("🚀 Bắt đầu scan các khóa học, bài học, subtitle đã upload...")
    log("")
    
    # 1. Scan rclone uploads
    rclone_data = scan_rclone_uploads()
    
    # 2. Scan database uploads
    db_tasks = scan_database_uploads()
    
    # 3. Scan JSON files
    json_files = scan_json_files()
    
    # 4. Generate summary
    generate_summary(rclone_data, db_tasks, json_files)
    
    log("\n" + "=" * 80)
    log("✅ Hoàn thành scan!")
    log("=" * 80)

if __name__ == "__main__":
    main()
