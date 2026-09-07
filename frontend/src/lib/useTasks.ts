import { useState, useEffect } from 'react'

const wsBase = window.location.protocol === 'https:' ? `wss://${window.location.host}` : `ws://${window.location.host}`
const wsUrl = `${wsBase}/api/ws/logs`


export interface Task {
  id: string
  title: string
  description: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED'
  progress: number
  started_at: number
  completed_at: number | null
  error: string | null
}

let globalTasks: Task[] = []
let listeners: Array<(tasks: Task[]) => void> = []

let ws: WebSocket | null = null

function connectWebSocket() {
  if (ws) return
  
  // We can just use the existing /ws/logs endpoint since we added our TASK_SYNC and TASK_UPDATE messages there!
  ws = new WebSocket(wsUrl)
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'TASK_SYNC') {
        globalTasks = data.tasks
        notifyListeners()
      } else if (data.type === 'TASK_UPDATE') {
        const updatedTask = data.task
        const idx = globalTasks.findIndex(t => t.id === updatedTask.id)
        if (idx !== -1) {
          globalTasks[idx] = updatedTask
        } else {
          globalTasks = [updatedTask, ...globalTasks]
        }
        notifyListeners()
      }
    } catch (e) {
      // Not a JSON message (probably a raw log string), ignore it for the task store.
    }
  }
  
  ws.onclose = () => {
    ws = null
    setTimeout(connectWebSocket, 5000)
  }
}

function notifyListeners() {
  listeners.forEach(l => l([...globalTasks]))
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(globalTasks)
  
  useEffect(() => {
    listeners.push(setTasks)
    connectWebSocket()
    return () => {
      listeners = listeners.filter(l => l !== setTasks)
    }
  }, [])
  
  return {
    tasks,
    activeTasks: tasks.filter(t => t.status === 'RUNNING'),
    completedTasks: tasks.filter(t => t.status !== 'RUNNING').slice(0, 10)
  }
}
