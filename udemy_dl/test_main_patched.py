#!/usr/bin/env python3
"""
Test main.py với cookies được inject trực tiếp vào session
Đây là workaround tạm thời để test trước khi sửa main.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from http.cookiejar import MozillaCookieJar
import main

# Override Udemy.__init__ để inject cookies
original_udemy_init = main.Udemy.__init__

def patched_udemy_init(self, bearer_token):
    # Call original __init__
    original_udemy_init(self, bearer_token)
    
    # Force load cookies from file
    print("[PATCH] Loading cookies from cookies.txt...")
    try:
        cj = MozillaCookieJar("cookies.txt")
        cj.load()
        
        # Inject cookies into session
        for cookie in cj:
            self.session._session.cookies.set_cookie(cookie)
        
        # Also set global cj for _get() method
        main.cj = cj
        
        print(f"[PATCH] ✅ Loaded {len(cj)} cookies into session")
    except Exception as e:
        print(f"[PATCH] ❌ Failed to load cookies: {e}")

# Monkey patch
main.Udemy.__init__ = patched_udemy_init

# Now run main
if __name__ == '__main__':
    main.main()
