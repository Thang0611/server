"""
Task Logger Module
Sends structured logs to Node.js API for database storage
Compatible with UnifiedLogger service
"""

import os
import json
import requests
from datetime import datetime
from dotenv import load_dotenv

# Load .env
env_paths = [
    os.path.join(os.path.dirname(__file__), '../.env'),
    os.path.join(os.path.dirname(__file__), './.env')
]
env_path = next((p for p in env_paths if os.path.exists(p)), None)
if env_path:
    load_dotenv(dotenv_path=env_path)

# Get API URL from environment
NODE_API_URL = os.getenv('NODE_API_URL', 'http://localhost:3000')


def log_to_node_api(task_id, order_id, level, message, details=None, progress=None, current_file=None, category='download'):
    """
    Send structured log to Node.js API for database storage
    
    Args:
        task_id (int): Task ID
        order_id (int): Order ID
        level (str): Log level: 'debug', 'info', 'warn', 'error', 'critical'
        message (str): Log message
        details (dict, optional): Additional context
        progress (float, optional): Progress percentage (0-100)
        current_file (str, optional): Current file being processed
        category (str, optional): Category: 'download', 'upload', 'enrollment', 'system'
    
    Returns:
        dict or None: API response or None if failed
    """
    if not task_id or not order_id or not message:
        return None
    
    payload = {
        'orderId': order_id,
        'level': level,
        'category': category,
        'message': message,
        'details': details or {},
        'progress': progress,
        'currentFile': current_file,
        'source': 'python_worker'
    }
    
    # Remove None values
    payload = {k: v for k, v in payload.items() if v is not None}
    
    api_endpoint = f'{NODE_API_URL}/api/v1/internal/tasks/{task_id}/logs'
    
    try:
        response = requests.post(
            api_endpoint,
            json=payload,
            timeout=2,  # Short timeout to avoid blocking
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            # Don't print in production to avoid spam
            if os.getenv('DEBUG_LOGGING', 'false').lower() == 'true':
                print(f"[TaskLogger] API returned {response.status_code}: {response.text}")
            return None
    except requests.exceptions.Timeout:
        # Timeout is expected - don't break download flow
        return None
    except requests.exceptions.RequestException as e:
        # Network errors are expected - don't break download flow
        if os.getenv('DEBUG_LOGGING', 'false').lower() == 'true':
            print(f"[TaskLogger] Request failed: {e}")
        return None
    except Exception as e:
        # Any other error - don't break download flow
        if os.getenv('DEBUG_LOGGING', 'false').lower() == 'true':
            print(f"[TaskLogger] Unexpected error: {e}")
        return None


def log_info(task_id, order_id, message, details=None, progress=None, current_file=None, category='download'):
    """Log info message"""
    return log_to_node_api(task_id, order_id, 'info', message, details, progress, current_file, category)


def log_error(task_id, order_id, message, error_details=None, category='download'):
    """Log error message"""
    details = error_details or {}
    if isinstance(error_details, Exception):
        details = {
            'error': str(error_details),
            'type': type(error_details).__name__
        }
    return log_to_node_api(task_id, order_id, 'error', message, details, None, None, category)


def log_warn(task_id, order_id, message, details=None, category='download'):
    """Log warning message"""
    return log_to_node_api(task_id, order_id, 'warn', message, details, None, None, category)


def log_progress(task_id, order_id, progress, current_file=None, details=None):
    """Log download progress"""
    message = f"Download progress: {progress}%"
    if current_file:
        message += f" ({current_file})"
    return log_to_node_api(task_id, order_id, 'info', message, details, progress, current_file, 'download')


def log_debug(task_id, order_id, message, details=None, category='download'):
    """Log debug message (only if DEBUG_LOGGING is enabled)"""
    if os.getenv('DEBUG_LOGGING', 'false').lower() == 'true':
        return log_to_node_api(task_id, order_id, 'debug', message, details, None, None, category)
    return None
