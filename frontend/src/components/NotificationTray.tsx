import { Bell, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useTasks, type Task } from '../lib/useTasks'
import { motion, AnimatePresence } from 'framer-motion'

export function NotificationTray() {
  const { activeTasks, completedTasks } = useTasks()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
      >
        <Bell className="w-5 h-5 text-zinc-300" />
        {activeTasks.length > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 max-h-[80vh] overflow-y-auto custom-scrollbar bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col"
          >
            <div className="p-4 border-b border-white/5 sticky top-0 bg-zinc-900/95 backdrop-blur-md z-10 flex items-center justify-between">
              <h3 className="font-semibold text-white">Notifications</h3>
              {activeTasks.length > 0 && (
                <span className="text-xs font-medium text-blue-400">{activeTasks.length} running</span>
              )}
            </div>
            
            <div className="p-2 flex flex-col gap-1">
              {activeTasks.length === 0 && completedTasks.length === 0 && (
                <div className="p-8 text-center text-zinc-500 flex flex-col items-center">
                  <Bell className="w-8 h-8 mb-3 opacity-20" />
                  <p className="text-sm">No recent activity</p>
                </div>
              )}

              {activeTasks.map(task => (
                <TaskItem key={task.id} task={task} />
              ))}
              
              {completedTasks.map(task => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TaskItem({ task }: { task: Task }) {
  const isRunning = task.status === 'RUNNING'
  const isSuccess = task.status === 'SUCCESS'
  const isFailed = task.status === 'FAILED'

  const timeAgo = (ts: number) => {
    const diff = Math.floor(Date.now() / 1000) - ts
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`
    return `${Math.floor(diff/3600)}h ago`
  }

  return (
    <div className={`p-3 rounded-lg border flex gap-3 ${isRunning ? 'bg-blue-500/5 border-blue-500/20' : 'bg-transparent border-transparent hover:bg-white/5'}`}>
      <div className="mt-0.5 shrink-0">
        {isRunning && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
        {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {isFailed && <XCircle className="w-4 h-4 text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-zinc-200 truncate pr-2">{task.title}</p>
          {!isRunning && <span className="text-[10px] text-zinc-500 whitespace-nowrap">{timeAgo(task.completed_at || task.started_at)}</span>}
        </div>
        
        <p className={`text-xs truncate ${isFailed ? 'text-red-400' : 'text-zinc-400'}`}>
          {task.description}
        </p>
        
        {isRunning && task.progress > 0 && (
          <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300 ease-out rounded-full"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
