#!/usr/bin/env python3
"""
Debug script to test visit request với bearer token và browser headers
"""
import requests
import sys
import os

# Add parent to path
sys.path.insert(0, os.path.dirname(__file__))

from constants import HEADERS, URLS
from cookie_utils import get_udemy_token

UDEMY_TOKEN = get_udemy_token()

print(f"Bearer Token: {UDEMY_TOKEN[:30]}...")
print(f"\nHeaders being used:")
for key, value in HEADERS.items():
    print(f"  {key}: {value[:50] if len(str(value)) > 50 else value}")

portal_name = "samsungu"
visit_url = URLS.VISIT.format(portal_name=portal_name)

print(f"\nVisit URL: {visit_url}")
print("\n" + "="*60)
print("TEST 1: Visit without bearer token (current HEADERS only)")
print("="*60)

session = requests.Session()
session.headers.update(HEADERS)

try:
    response = session.get(visit_url, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Reason: {response.reason}")
    if response.status_code != 200:
        print(f"Response: {response.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

print("\n" + "="*60)
print("TEST 2: Visit WITH bearer token in headers")
print("="*60)

session2 = requests.Session()
session2.headers.update(HEADERS)
session2.headers.update({
    "authorization": f"Bearer {UDEMY_TOKEN}",
    "x-udemy-authorization": f"Bearer {UDEMY_TOKEN}",
})

print(f"Authorization header added: Bearer {UDEMY_TOKEN[:30]}...")

try:
    response = session2.get(visit_url, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Reason: {response.reason}")
    if response.status_code == 200:
        print("✅ SUCCESS with bearer token!")
        import json
        try:
            data = response.json()
            print(f"Response data keys: {list(data.keys())}")
        except:
            print(f"Response (first 300 chars): {response.text[:300]}")
    else:
        print(f"Response: {response.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

print("\n" + "="*60)
print("TEST 3: Check if visit is even necessary")
print("="*60)
print("Trying to get course info directly...")

course_url = "https://samsungu.udemy.com/api-2.0/courses/6220948/"
session3 = requests.Session()
session3.headers.update(HEADERS)
session3.headers.update({
    "authorization": f"Bearer {UDEMY_TOKEN}",
    "x-udemy-authorization": f"Bearer {UDEMY_TOKEN}",
})

try:
    response = session3.get(course_url, params={"fields[course]": "title"}, timeout=10)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print("✅ Can access course API directly without visit!")
        data = response.json()
        print(f"Course title: {data.get('title', 'N/A')}")
    else:
        print(f"❌ Cannot access course API: {response.status_code} {response.reason}")
except Exception as e:
    print(f"Error: {e}")
