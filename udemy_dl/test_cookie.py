#!/usr/bin/env python3
"""
Test script để kiểm tra cookie authentication methods
"""
import os
import sys
import requests
from http.cookiejar import MozillaCookieJar

# Test 1: Kiểm tra bearer token đơn thuần
def test_bearer_token():
    print("\n" + "="*60)
    print("TEST 1: Bearer Token Only (Current Method)")
    print("="*60)
    
    from cookie_utils import get_udemy_token
    token = get_udemy_token()
    
    if not token:
        print("❌ No token found!")
        return False
    
    print(f"✅ Token found: {token[:30]}...")
    
    # Test API call với chỉ bearer token
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Udemy-Authorization': f'Bearer {token}',
        'User-Agent': 'Mozilla/5.0'
    }
    
    test_url = "https://samsungu.udemy.com/api-2.0/users/me"
    
    try:
        response = requests.get(test_url, headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ Bearer token works!")
            return True
        else:
            print(f"❌ Failed: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

# Test 2: Kiểm tra full cookies
def test_full_cookies():
    print("\n" + "="*60)
    print("TEST 2: Full Cookies String")
    print("="*60)
    
    cookie_file = '../cookies.txt'
    if not os.path.exists(cookie_file):
        print(f"❌ Cookie file not found: {cookie_file}")
        return False
    
    with open(cookie_file, 'r') as f:
        cookie_string = f.read().strip()
    
    print(f"✅ Cookies loaded: {len(cookie_string)} chars")
    print(f"Preview: {cookie_string[:100]}...")
    
    # Parse cookies thành dict
    cookies = {}
    for item in cookie_string.split(';'):
        item = item.strip()
        if '=' in item:
            key, value = item.split('=', 1)
            cookies[key.strip()] = value.strip()
    
    print(f"✅ Parsed {len(cookies)} cookies")
    
    # Test API call với full cookies
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://samsungu.udemy.com/'
    }
    
    test_url = "https://samsungu.udemy.com/api-2.0/users/me"
    
    try:
        response = requests.get(test_url, headers=headers, cookies=cookies, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ Full cookies work!")
            data = response.json()
            print(f"User: {data.get('email', 'N/A')}")
            return True
        else:
            print(f"❌ Failed: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

# Test 3: Kiểm tra course access
def test_course_access(course_url="https://samsungu.udemy.com/course/excel-ai-trong-phan-tich-du-lieu-doanh-nghiep/"):
    print("\n" + "="*60)
    print("TEST 3: Course Access Check")
    print("="*60)
    
    cookie_file = '../cookies.txt'
    with open(cookie_file, 'r') as f:
        cookie_string = f.read().strip()
    
    cookies = {}
    for item in cookie_string.split(';'):
        item = item.strip()
        if '=' in item:
            key, value = item.split('=', 1)
            cookies[key.strip()] = value.strip()
    
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://samsungu.udemy.com/'
    }
    
    print(f"Testing: {course_url}")
    
    try:
        response = requests.get(course_url, headers=headers, cookies=cookies, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            # Check if redirected to login
            if 'login' in response.url.lower():
                print("❌ Redirected to login page - cookies invalid!")
                return False
            else:
                print("✅ Course page accessible!")
                print(f"Final URL: {response.url}")
                return True
        else:
            print(f"❌ Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

# Test 4: Check cookies có key nào
def test_cookie_keys():
    print("\n" + "="*60)
    print("TEST 4: Cookie Keys Analysis")
    print("="*60)
    
    cookie_file = '../cookies.txt'
    with open(cookie_file, 'r') as f:
        cookie_string = f.read().strip()
    
    cookies = {}
    for item in cookie_string.split(';'):
        item = item.strip()
        if '=' in item:
            key, value = item.split('=', 1)
            cookies[key.strip()] = value.strip()
    
    required_cookies = [
        'access_token',
        'dj_session_id',
        'ud_cache_user',
        'ud_user_jwt',
        'csrftoken',
        'ud_cache_brand',
        '__cfruid'
    ]
    
    print("\nRequired cookies check:")
    for key in required_cookies:
        if key in cookies:
            value_preview = cookies[key][:30] + '...' if len(cookies[key]) > 30 else cookies[key]
            print(f"  ✅ {key}: {value_preview}")
        else:
            print(f"  ❌ {key}: MISSING")
    
    print(f"\nAll cookies ({len(cookies)}):")
    for key in sorted(cookies.keys()):
        print(f"  - {key}")

if __name__ == '__main__':
    print("🧪 TESTING COOKIE AUTHENTICATION METHODS")
    print("="*60)
    
    # Run all tests
    test_cookie_keys()
    
    result1 = test_bearer_token()
    result2 = test_full_cookies()
    result3 = test_course_access()
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Bearer Token Only: {'✅ PASS' if result1 else '❌ FAIL'}")
    print(f"Full Cookies:      {'✅ PASS' if result2 else '❌ FAIL'}")
    print(f"Course Access:     {'✅ PASS' if result3 else '❌ FAIL'}")
    print("="*60)
    
    if result2 and result3:
        print("\n✅ RECOMMENDED: Use full cookies (--browser file method)")
    elif result1:
        print("\n⚠️  Bearer token works for API but may not work for downloads")
    else:
        print("\n❌ No authentication method works - need to refresh cookies!")
