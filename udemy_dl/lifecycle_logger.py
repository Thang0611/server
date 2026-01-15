"""
Lifecycle Logger for Python Worker
Sends lifecycle events to Node.js backend via HTTP API
@module lifecycle_logger
"""

import os
import requests
import json
import time
from datetime import datetime

# Backend API endpoint for lifecycle logging
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:3000')
LIFECYCLE_LOG_ENDPOINT = f"{BACKEND_URL}/api/v1/internal/lifecycle-log"

def log_event(event_type, message, meta=None):
    """
    Send lifecycle log event to Node.js backend
    
    Args:
        event_type (str): Event type (e.g., 'DOWNLOAD_SUCCESS', 'UPLOAD_ERROR')
        message (str): Log message
        meta (dict): Additional metadata
    """
    if meta is None:
        meta = {}
    
    try:
        payload = {
            'eventType': event_type,
            'message': message,
            'meta': meta,
            'timestamp': datetime.now().isoformat(),
            'source': 'python_worker'
        }
        
        response = requests.post(
            LIFECYCLE_LOG_ENDPOINT,
            json=payload,
            timeout=5,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code != 200:
            print(f"[LIFECYCLE_LOG] Failed to send log: {response.status_code} - {response.text}")
    except Exception as e:
        # Don't fail the main process if logging fails
        print(f"[LIFECYCLE_LOG] Error sending log: {e}")


def log_download_success(task_id, duration, details=None):
    """Log download success"""
    log_event(
        'DOWNLOAD_SUCCESS',
        f'[DOWNLOAD_SUCCESS] [TaskId: {task_id}] [Duration: {duration}s]',
        {
            'taskId': task_id,
            'duration': duration,
            **(details or {})
        }
    )


def log_download_error(task_id, reason, details=None):
    """Log download error"""
    log_event(
        'DOWNLOAD_ERROR',
        f'[DOWNLOAD_ERROR] [TaskId: {task_id}] [Reason: {reason}]',
        {
            'taskId': task_id,
            'reason': reason,
            **(details or {})
        }
    )


def log_upload_success(task_id, drive_link, details=None):
    """Log upload success"""
    log_event(
        'UPLOAD_SUCCESS',
        f'[UPLOAD_SUCCESS] [TaskId: {task_id}] [DriveLink: {drive_link}]',
        {
            'taskId': task_id,
            'driveLink': drive_link,
            **(details or {})
        }
    )


def log_upload_error(task_id, reason, details=None):
    """Log upload error"""
    log_event(
        'UPLOAD_ERROR',
        f'[UPLOAD_ERROR] [TaskId: {task_id}] [Reason: {reason}]',
        {
            'taskId': task_id,
            'reason': reason,
            **(details or {})
        }
    )
