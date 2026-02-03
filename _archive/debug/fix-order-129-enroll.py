#!/usr/bin/env python3
"""Fix Order 129 - Direct enrollment using cookies"""

import requests
import json
import re

COOKIE = "ud_cache_language=en;__cf_bm=Sni8fvCeqqrU_TGwqrn4WZfGfHceUzT2xShQFe3tAkw-1769750312-1.0.1.1-P1JQeIJMR_7odeO8V6Vz3M3vtfXvlhWc4yon88EAeMARlvZTBhUP4iEhT1ej3XoFBMbk.2e_ZEgA8yo.64sX5lrn8A852SlacbYzXHx7llk;dj_session_id=lt3dhychav0lr84oqw887v5c0l2gr58o;ud_cache_device=None;IR_PI=a2cb236b-e533-11f0-961a-8f79c001fb53%7C1767166688157;csrftoken=74XMydAVNyuyycNghvZE0wrRdGRu4NEo;ud_cache_brand=13528VNen_US;ud_country_code=VN;client_id=bd2565cb7b0c313f5e9bae44961e8db2;brwsr=a2cb236b-e533-11f0-961a-8f79c001fb53;ud_cache_user=270619238;__cfruid=cf5f3217eb3ace9e7b75d41b9f8bab216dc4684a-1769750312;__stripe_mid=0d7caae1-5eb0-4e66-a45e-9ca8f703d71f604af3;__udmy_2_v57r=682d171d521a4448918d82f8e1ebc421;access_token=BXkdOY7L4dK19hrNj1GnplHFHoMbkXpiLlSn9dcU;eventing_session_id=MmRiZWEyZjctYmE4Zi00Nj-1769752119140;ud_cache_campaign_code=KEEPLEARNING;ud_cache_logged_in=1;ud_cache_marketplace_country=VN;ud_cache_price_country=VN;ud_cache_release=f8e815eb93cb0b4c29ea;ud_cache_version=1;ud_user_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjcwNjE5MjM4LCJlbWFpbCI6Imh1dS50aGFuZ0BzYW1zdW5nLmNvbSIsImlzX3N1cGVydXNlciI6ZmFsc2UsImdyb3VwX2lkcyI6W119.3LkAKF-5ZoVp_MQyDlGBSwXzqpq4PGY6f59Y546NDBE;__stripe_sid=33d609c5-be01-4579-8734-3bcbe8a5c6c56875ff"

COURSES = [
    "https://samsungu.udemy.com/course/excel-ai-trong-phan-tich-du-lieu-doanh-nghiep/",
    "https://samsungu.udemy.com/course/alan-sharpe-copywriting-masterclass/"
]

def get_course_id(url, cookie):
    """Get course ID from URL"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookie,
        'Referer': url
    }
    
    print(f"[*] Fetching course page: {url}")
    resp = requests.get(url, headers=headers, timeout=15)
    
    if resp.status_code == 403:
        print(f"[ERROR] 403 Forbidden - Course may require enrollment or login")
        return None
    
    if resp.status_code != 200:
        print(f"[ERROR] HTTP {resp.status_code}")
        return None
    
    # Try to find course ID in page
    patterns = [
        r'"id":\s*(\d+)',
        r'data-course-id="(\d+)"',
        r'courseId["\']?\s*:\s*(\d+)',
        r'/course-dashboard-redirect/\?course_id=(\d+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, resp.text)
        if match:
            course_id = match.group(1)
            print(f"[✓] Found course ID: {course_id}")
            return course_id
    
    print(f"[ERROR] Could not find course ID in page")
    return None

def enroll_course(course_id, cookie, referer_url):
    """Enroll in course"""
    enroll_url = f"https://samsungu.udemy.com/api-2.0/course-landing-components/{course_id}/me/?components=purchase"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookie,
        'Referer': referer_url,
        'X-Requested-With': 'XMLHttpRequest'
    }
    
    print(f"[*] Enrolling course {course_id}...")
    resp = requests.get(enroll_url, headers=headers, timeout=15)
    
    if resp.status_code == 200:
        data = resp.json()
        if 'purchase' in data and data['purchase'].get('data', {}).get('is_user_subscribed'):
            print(f"[✓] Already enrolled or subscription active")
            return True
        print(f"[✓] Enrollment successful")
        return True
    else:
        print(f"[ERROR] Enrollment failed - HTTP {resp.status_code}")
        print(f"[ERROR] Response: {resp.text[:200]}")
        return False

def main():
    print("="*60)
    print("Fix Order 129 - Direct Enrollment")
    print("="*60)
    
    success_count = 0
    
    for url in COURSES:
        print(f"\n[*] Processing: {url}")
        
        # Get course ID
        course_id = get_course_id(url, COOKIE)
        if not course_id:
            print(f"[SKIP] Cannot get course ID")
            continue
        
        # Enroll
        if enroll_course(course_id, COOKIE, url):
            success_count += 1
        else:
            print(f"[FAIL] Enrollment failed")
    
    print(f"\n{'='*60}")
    print(f"[RESULT] Enrolled {success_count}/{len(COURSES)} courses")
    print(f"{'='*60}")
    
    if success_count == len(COURSES):
        print("\n[✓] All courses enrolled! Now update tasks and retry download:")
        print("   mysql -u root -p123456 udemy_bot -e \"UPDATE download_tasks SET status='enrolled', error_log=NULL WHERE order_id=129;\"")
        return 0
    else:
        print("\n[!] Some enrollments failed. Check errors above.")
        return 1

if __name__ == '__main__':
    exit(main())
