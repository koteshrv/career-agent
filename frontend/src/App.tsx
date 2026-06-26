import { KanbanBoard } from "./components/KanbanBoard"
import { Button } from "@/components/ui/button"
import { Play, Sparkles, LayoutDashboard } from "lucide-react"
import axios from "axios"
import { useState } from "react"
import { motion } from "framer-motion"

function App() {
  const [loading, setLoading] = useState(false)

  const handleRunScraper = async () => {
    setLoading(true)
    try {
      await axios.post("http://localhost:8000/api/run-scraper")
    } catch (e) {
      console.error(e)
    } finally {
      setTimeout(() => setLoading(false), 2000)
    }
  }

  return (
    <div className="min-h-screen text-zinc-100 selection:bg-blue-500/30 font-sans flex overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl hidden md:flex flex-col z-40">
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)]">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400 tracking-tight">
                Job Tracker Pro
              </h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">AutoApply Engine</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-8 space-y-2">
          <div className="px-3 py-2.5 rounded-lg bg-blue-500/10 text-blue-400 flex items-center gap-3 font-medium border border-blue-500/20 cursor-pointer">
            <LayoutDashboard className="w-4 h-4" />
            Job Pipeline
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen relative">
        {/* Top Header */}
        <header className="h-20 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between px-8 z-30 sticky top-0">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Pipeline Dashboard</h2>
            <p className="text-sm text-zinc-400 mt-1">Track and manage your automated job matches.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                onClick={handleRunScraper} 
                disabled={loading}
                className={`h-11 px-6 rounded-full font-medium transition-all duration-300 shadow-lg ${
                  loading 
                  ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed border border-white/5' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 hover:shadow-blue-500/40 border border-blue-400/20'
                }`}
              >
                <Play className={`w-4 h-4 mr-2 ${loading ? 'animate-pulse' : ''}`} />
                {loading ? "Engines Running..." : "Trigger Scraper"}
              </Button>
            </motion.div>
          </div>
        </header>

        {/* Kanban Board Container */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-8 custom-scrollbar">
          <KanbanBoard />
        </div>
      </main>
    </div>
  )
}

export default App
