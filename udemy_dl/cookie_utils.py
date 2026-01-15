"""
Utility functions for reading access_token from cookies.txt
"""
import os
import re
from dotenv import load_dotenv

# Load .env if available
env_paths = [
    os.path.join(os.path.dirname(__file__), '../.env'),
    os.path.join(os.path.dirname(__file__), '../../.env'),
    os.path.join(os.path.dirname(__file__), './.env')
]
for env_path in env_paths:
    if os.path.exists(env_path):
        load_dotenv(dotenv_path=env_path)
        break


def get_access_token_from_cookies(cookie_file_path=None):
    """
    Extract access_token from cookies.txt file
    
    Args:
        cookie_file_path: Path to cookies.txt file. If None, reads from COOKIES_FILE env or tries default locations.
    
    Returns:
        str: access_token value or None if not found
    """
    # Get cookie file path from environment variable first
    if cookie_file_path is None:
        cookie_file_path = os.getenv('COOKIES_FILE')
    
    # If still None, try default locations
    if cookie_file_path is None:
        possible_paths = [
            os.path.join(os.path.dirname(__file__), '../cookies.txt'),
            os.path.join(os.path.dirname(__file__), '../../cookies.txt'),
            os.path.join(os.path.dirname(__file__), 'cookies.txt'),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                cookie_file_path = path
                break
    
    if not cookie_file_path or not os.path.exists(cookie_file_path):
        return None
    
    try:
        with open(cookie_file_path, 'r', encoding='utf-8') as f:
            cookie_content = f.read().strip()
        
        # Parse access_token from cookie string
        # Format: ...;access_token=TOKEN_VALUE;...
        match = re.search(r'access_token=([^;]+)', cookie_content)
        if match:
            return match.group(1)
        
        # Alternative: if cookie is in key=value format on separate lines
        for line in cookie_content.split('\n'):
            if 'access_token' in line:
                parts = line.split('=')
                if len(parts) >= 2:
                    return parts[1].strip()
        
        return None
    except Exception as e:
        print(f"[WARN] Failed to read access_token from {cookie_file_path}: {e}")
        return None


def get_udemy_token():
    """
    Get Udemy token with fallback priority:
    1. access_token from cookies.txt
    2. UDEMY_TOKEN from environment variable
    
    Returns:
        str: Token to use for Udemy API
    """
    # Try to get from cookies.txt first
    access_token = get_access_token_from_cookies()
    if access_token:
        return access_token
    
    # Fallback to environment variable
    return os.getenv('UDEMY_TOKEN')


if __name__ == '__main__':
    # Test function
    token = get_udemy_token()
    if token:
        print(f"✅ Found token: {token[:20]}...")
    else:
        print("❌ No token found")
