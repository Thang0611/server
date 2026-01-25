"""
Progress Emitter - Ephemeral Real-time Progress Tracking
Emits download progress to Redis Pub/Sub for WebSocket broadcast
Author: Senior System Architect
Date: 2026-01-14
"""

import redis
import json
import time
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment
load_dotenv()

class ProgressEmitter:
    """
    Emits real-time progress updates to Redis Pub/Sub
    This is EPHEMERAL - not saved to database
    """
    
    def __init__(self):
        """Initialize Redis connection for publishing"""
        self.redis_host = os.getenv('REDIS_HOST', 'localhost')
        self.redis_port = int(os.getenv('REDIS_PORT', 6379))
        self.redis_password = os.getenv('REDIS_PASSWORD', None)
        # ✅ Support database separation: REDIS_DB=0 (production), REDIS_DB=1 (development)
        self.redis_db = int(os.getenv('REDIS_DB', 0))
        
        try:
            self.redis_client = redis.Redis(
                host=self.redis_host,
                port=self.redis_port,
                password=self.redis_password if self.redis_password else None,
                db=self.redis_db,  # Database selection for dev/prod separation
                decode_responses=True,
                socket_connect_timeout=5
            )
            # Test connection
            self.redis_client.ping()
            self.connected = True
            print(f"[Progress Emitter] Connected to Redis at {self.redis_host}:{self.redis_port}")
        except Exception as e:
            print(f"[Progress Emitter] Failed to connect to Redis: {e}")
            self.connected = False
            self.redis_client = None
    
    def emit_task_progress(self, task_id, order_id=None, **progress_data):
        """
        Emit progress update for a task
        
        Args:
            task_id (int): Task ID
            order_id (int, optional): Order ID for order-level aggregation
            **progress_data: Progress data
                - percent (float): Progress percentage (0-100)
                - current_file (str): Current file being downloaded
                - speed (float): Download speed in bytes/sec
                - eta (str): Estimated time remaining
                - bytes_downloaded (int): Bytes downloaded
                - total_bytes (int): Total bytes
        """
        if not self.connected or not self.redis_client:
            return
        
        try:
            # Prepare message
            message = {
                'taskId': task_id,
                'orderId': order_id,
                'percent': round(progress_data.get('percent', 0), 2),
                'currentFile': progress_data.get('current_file', None),
                'speed': progress_data.get('speed', None),
                'eta': progress_data.get('eta', None),
                'bytesDownloaded': progress_data.get('bytes_downloaded', None),
                'totalBytes': progress_data.get('total_bytes', None),
                'timestamp': int(time.time() * 1000)
            }
            
            # Publish to task-specific channel
            task_channel = f"task:{task_id}:progress"
            self.redis_client.publish(task_channel, json.dumps(message))
            
            # Also publish to order-level channel if order_id provided
            if order_id:
                order_channel = f"order:{order_id}:progress"
                self.redis_client.publish(order_channel, json.dumps(message))
            
            # Cache latest progress (with 1 hour TTL)
            cache_key = f"progress:task:{task_id}"
            self.redis_client.setex(cache_key, 3600, json.dumps(message))
            
            # Log only at significant milestones to avoid spam
            if progress_data.get('percent', 0) % 10 == 0:
                print(f"[Progress] Task {task_id}: {progress_data.get('percent', 0):.0f}%")
        
        except Exception as e:
            # Don't throw - progress updates should never break the main flow
            print(f"[Progress Emitter] Failed to emit progress: {e}")
    
    def emit_status_change(self, task_id, order_id, new_status, previous_status=None, message=None):
        """
        Emit status change event
        
        Args:
            task_id (int): Task ID
            order_id (int): Order ID
            new_status (str): New status
            previous_status (str, optional): Previous status
            message (str, optional): Optional message
        """
        if not self.connected or not self.redis_client:
            return
        
        try:
            payload = {
                'taskId': task_id,
                'orderId': order_id,
                'newStatus': new_status,
                'previousStatus': previous_status,
                'message': message,
                'timestamp': int(time.time() * 1000)
            }
            
            # Publish to both task and order channels
            task_channel = f"task:{task_id}:status"
            order_channel = f"order:{order_id}:status"
            
            message_json = json.dumps(payload)
            self.redis_client.publish(task_channel, message_json)
            self.redis_client.publish(order_channel, message_json)
            
            print(f"[Status Change] Task {task_id}: {previous_status} → {new_status}")
        
        except Exception as e:
            print(f"[Progress Emitter] Failed to emit status change: {e}")
    
    def emit_order_complete(self, order_id, total_tasks, completed_tasks, failed_tasks):
        """
        Emit order completion event
        
        Args:
            order_id (int): Order ID
            total_tasks (int): Total tasks
            completed_tasks (int): Completed tasks
            failed_tasks (int): Failed tasks
        """
        if not self.connected or not self.redis_client:
            return
        
        try:
            payload = {
                'orderId': order_id,
                'totalTasks': total_tasks,
                'completedTasks': completed_tasks,
                'failedTasks': failed_tasks,
                'timestamp': int(time.time() * 1000)
            }
            
            channel = f"order:{order_id}:complete"
            self.redis_client.publish(channel, json.dumps(payload))
            
            print(f"[Order Complete] Order {order_id}: {completed_tasks}/{total_tasks} tasks completed")
        
        except Exception as e:
            print(f"[Progress Emitter] Failed to emit order completion: {e}")
    
    def close(self):
        """Close Redis connection"""
        if self.redis_client:
            try:
                self.redis_client.close()
                print("[Progress Emitter] Redis connection closed")
            except:
                pass

# Global instance
_progress_emitter = None

def get_progress_emitter():
    """Get or create global progress emitter instance"""
    global _progress_emitter
    if _progress_emitter is None:
        _progress_emitter = ProgressEmitter()
    return _progress_emitter

def emit_progress(task_id, order_id=None, **progress_data):
    """Convenience function to emit progress"""
    emitter = get_progress_emitter()
    emitter.emit_task_progress(task_id, order_id, **progress_data)

def emit_status_change(task_id, order_id, new_status, previous_status=None, message=None):
    """Convenience function to emit status change"""
    emitter = get_progress_emitter()
    emitter.emit_status_change(task_id, order_id, new_status, previous_status, message)

def emit_order_complete(order_id, total_tasks, completed_tasks, failed_tasks):
    """Convenience function to emit order completion"""
    emitter = get_progress_emitter()
    emitter.emit_order_complete(order_id, total_tasks, completed_tasks, failed_tasks)

# Example usage:
if __name__ == "__main__":
    # Test the emitter
    emitter = ProgressEmitter()
    
    # Simulate progress updates
    for i in range(0, 101, 10):
        emitter.emit_task_progress(
            task_id=123,
            order_id=456,
            percent=i,
            current_file="example-course.mp4",
            speed=1024000,  # 1 MB/s
            eta="5 minutes"
        )
        time.sleep(1)
    
    # Emit status change
    emitter.emit_status_change(
        task_id=123,
        order_id=456,
        new_status="completed",
        previous_status="downloading"
    )
    
    emitter.close()
