import uuid
import time
from typing import Dict, Any, Optional
from collections import deque
import asyncio

class TaskManager:
    def __init__(self, max_history=50):
        self.active_tasks: Dict[str, Dict[str, Any]] = {}
        self.completed_tasks = deque(maxlen=max_history)
        self.broadcast_callback = None

    def set_broadcast_callback(self, callback, loop):
        self.broadcast_callback = callback
        self.loop = loop
        
    def _broadcast(self, task: dict):
        if self.broadcast_callback and hasattr(self, 'loop') and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast_callback(task), self.loop)

    def start_task(self, title: str, description: str = "") -> str:
        task_id = str(uuid.uuid4())
        task = {
            "id": task_id,
            "title": title,
            "description": description,
            "status": "RUNNING",
            "progress": 0,
            "started_at": time.time(),
            "completed_at": None,
            "error": None
        }
        self.active_tasks[task_id] = task
        self._broadcast(task)
        return task_id

    def update_task(self, task_id: str, progress: int = None, description: str = None):
        if task_id in self.active_tasks:
            task = self.active_tasks[task_id]
            if progress is not None:
                task["progress"] = progress
            if description is not None:
                task["description"] = description
            self._broadcast(task)

    def complete_task(self, task_id: str, success: bool = True, error: str = None):
        if task_id in self.active_tasks:
            task = self.active_tasks.pop(task_id)
            task["status"] = "SUCCESS" if success else "FAILED"
            task["completed_at"] = time.time()
            if error:
                task["error"] = error
                task["description"] = error
            self.completed_tasks.appendleft(task)
            self._broadcast(task)

    def get_all_tasks(self):
        return list(self.active_tasks.values()) + list(self.completed_tasks)

task_manager = TaskManager()
