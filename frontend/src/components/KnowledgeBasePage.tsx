import { useState, useEffect } from "react"
import { api } from "../lib/api"
import { Database, Plus, Trash2, Loader2, Info } from "lucide-react"

interface ContextItem {
  id: string;
  text: string;
}

export function KnowledgeBasePage() {
  const [items, setItems] = useState<ContextItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState("")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchKnowledge()
  }, [])

  const fetchKnowledge = async () => {
    try {
      setLoading(true)
      const res = await api.get("/api/knowledge")
      setItems(res.data)
      setError("")
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load knowledge base")
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newText.trim()) return

    try {
      setAdding(true)
      setError("")
      await api.post("/api/knowledge", { text: newText })
      setNewText("")
      await fetchKnowledge()
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to add context")
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/knowledge/${id}`)
      await fetchKnowledge()
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to delete context")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-center gap-3">
          <Info className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-6">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-400" />
          Add Career Experience
        </h2>
        <p className="text-sm text-gray-400 mb-6">
          Paste paragraphs from your master resume, LinkedIn profile, or project descriptions here. 
          The AI will automatically search through these entries to construct tailored resumes and cover letters.
        </p>
        
        <form onSubmit={handleAdd} className="space-y-4">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="E.g., Led the migration of a legacy monolithic application to a microservices architecture using Docker and Kubernetes, reducing deployment time by 40%..."
            className="w-full h-32 bg-black/50 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={adding || !newText.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {adding ? "Embedding..." : "Add to Knowledge Base"}
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white px-2">Current Knowledge Base ({items.length})</h3>
        
        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-12 text-center">
            <Database className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">Your knowledge base is empty.</p>
            <p className="text-sm text-gray-500 mt-2">Add some career experiences above to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <div key={item.id} className="bg-[#1C1C1E] border border-white/10 rounded-2xl p-5 group flex gap-4 transition-all hover:border-indigo-500/30 items-start">
                <p className="text-gray-300 text-sm leading-relaxed flex-1 whitespace-pre-wrap">{item.text}</p>
                {deletingId === item.id ? (
                  <div className="flex items-center gap-2 pt-1 shrink-0">
                    <span className="text-xs text-red-400 font-medium mr-1">Delete?</span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-medium transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="px-3 py-1.5 bg-white/5 text-gray-300 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg shrink-0"
                    title="Delete experience"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
