#!/usr/bin/env python3

"""
Test Enrollment Check - Kiểm tra trạng thái enrollment của course
"""

import sys
import os
import json
from pathlib import Path

# Colors
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    RESET = '\033[0m'

def log_info(msg):
    print(f"{Colors.BLUE}ℹ {msg}{Colors.RESET}")

def log_success(msg):
    print(f"{Colors.GREEN}✓ {msg}{Colors.RESET}")

def log_error(msg):
    print(f"{Colors.RED}✗ {msg}{Colors.RESET}")

def log_warning(msg):
    print(f"{Colors.YELLOW}⚠ {msg}{Colors.RESET}")

def log_result(msg):
    print(f"{Colors.CYAN}→ {msg}{Colors.RESET}")

def check_session_files():
    """Check if session/cookie files exist"""
    print("\n" + "="*60)
    print("TEST: Session Files Check")
    print("="*60 + "\n")
    
    udemy_dir = Path("/root/server/udemy_dl")
    saved_dir = udemy_dir / "saved"
    
    if not saved_dir.exists():
        log_error("saved/ directory does not exist")
        log_result("Creating saved/ directory...")
        saved_dir.mkdir(exist_ok=True)
        return False
    
    session_files = list(saved_dir.glob("*"))
    
    if not session_files:
        log_error("No session files found")
        log_result("Account needs to login")
        return False
    
    log_success(f"Found {len(session_files)} session file(s)")
    for f in session_files:
        log_result(f"  - {f.name}")
    
    return True

def check_env_file():
    """Check .env configuration"""
    print("\n" + "="*60)
    print("TEST: Environment Configuration")
    print("="*60 + "\n")
    
    env_file = Path("/root/server/udemy_dl/.env")
    
    if not env_file.exists():
        log_warning(".env file does not exist")
        return False
    
    content = env_file.read_text().strip()
    
    if not content:
        log_warning(".env file is empty")
        return False
    
    log_success(".env file exists and has content")
    return True

def test_course_access(course_url, test_name=""):
    """Test if course is accessible"""
    print("\n" + "="*60)
    print(f"TEST: Course Access - {test_name}")
    print("="*60 + "\n")
    
    log_info(f"Testing URL: {course_url}")
    
    # Import udemy downloader modules
    sys.path.insert(0, "/root/server/udemy_dl")
    
    try:
        # Try to import and check
        import main
        log_info("Attempting to fetch course info...")
        
        # This is a simplified test - actual implementation would need proper auth
        log_warning("Skipping actual API test to avoid rate limiting")
        log_result("Use: cd /root/server/udemy_dl && python3 main.py --info -c URL")
        
    except Exception as e:
        log_error(f"Import error: {str(e)}")
        return False

def main():
    print("\n" + "="*60)
    print("🔍 ENROLLMENT & SESSION CHECK TEST")
    print("="*60)
    
    # Test 1: Session files
    has_session = check_session_files()
    
    # Test 2: Environment
    has_env = check_env_file()
    
    # Test 3: Course URLs to test
    test_courses = [
        {
            "name": "Task 28 - Failed Course",
            "url": "https://samsungu.udemy.com/course/tu-ong-hoa-cong-viec-bang-ai-agent-va-n8n/",
            "expected": "NOT ENROLLED"
        },
    ]
    
    for course in test_courses:
        test_course_access(course["url"], course["name"])
    
    # Summary
    print("\n" + "="*60)
    print("📊 SUMMARY")
    print("="*60 + "\n")
    
    if not has_session:
        log_error("CRITICAL: No session files found")
        log_result("FIX: Run the following command:")
        print("\n  cd /root/server/udemy_dl")
        print("  python3 main.py --login")
        print("\n  Then authenticate using browser method\n")
    
    if not has_env:
        log_warning("WARNING: .env configuration missing")
    
    print("\nNEXT STEPS:")
    print("  1. Login to Udemy account: python3 main.py --login")
    print("  2. Enroll in course or use enrolled account")
    print("  3. Test download: python3 main.py -c URL -o Test --info")
    print("  4. Check logs for detailed errors\n")

if __name__ == "__main__":
    main()
