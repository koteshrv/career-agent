import { Bell, CheckCircle2, XCircle, Loader2, X } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useTasks, clearCompletedTasks, clearTask, type Task } from '../lib/useTasks'
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
        className="relative p-2 rounded-full hover:bg-accent transition-colors group"
      >
        <Bell className="w-5 h-5 text-foreground opacity-80 group-hover:opacity-100 transition-opacity" />
        {activeTasks.length > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-primary" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 max-h-[80vh] overflow-y-auto custom-scrollbar bg-card border border-border rounded-xl shadow-2xl z-50 flex flex-col"
          >
            <div className="p-4 border-b border-border sticky top-0 bg-card/95 backdrop-blur-md z-10 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Notifications</h3>
              <div className="flex items-center gap-3">
                {activeTasks.length > 0 && (
                  <span className="text-xs font-medium text-primary">{activeTasks.length} running</span>
                )}
                {completedTasks.length > 0 && (
                  <button onClick={clearCompletedTasks} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Clear
                  </button>
                )}
              </div>
            </div>
            
            <div className="p-3 flex flex-col gap-2.5">
              {activeTasks.length === 0 && completedTasks.length === 0 && (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
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
    <div className={`group p-3 rounded-xl border transition-all flex gap-3.5 shadow-sm ${isRunning ? 'bg-primary/5 border-primary/20 shadow-primary/5' : 'bg-secondary/40 border-border/60 hover:bg-secondary hover:border-border'}`}>
      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isRunning ? 'bg-primary/20 text-primary' : isSuccess ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
        {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
        {isSuccess && <CheckCircle2 className="w-4 h-4" />}
        {isFailed && <XCircle className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center justify-between mb-0.5 group/header">
          <p className="text-sm font-semibold text-foreground truncate pr-2">{task.title}</p>
          {!isRunning && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{timeAgo(task.completed_at || task.started_at)}</span>
              <button onClick={(e) => { e.stopPropagation(); clearTask(task.id); }} className="opacity-0 group-hover:opacity-100 p-1 -mr-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        
        <p className={`text-xs truncate ${isFailed ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          {task.description}
        </p>
        
        {isRunning && task.progress > 0 && (
          <div className="w-full h-1.5 bg-secondary rounded-full mt-2.5 overflow-hidden border border-border/50">
            <div 
              className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
