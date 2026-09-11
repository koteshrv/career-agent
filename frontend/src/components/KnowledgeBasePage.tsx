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
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-md flex items-center gap-3">
          <Info className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Add Career Experience
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Paste paragraphs from your master resume, LinkedIn profile, or project descriptions here.
          The AI will automatically search through these entries to construct tailored resumes and cover letters.
        </p>

        <form onSubmit={handleAdd} className="space-y-4">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="E.g., Led the migration of a legacy monolithic application to a microservices architecture using Docker and Kubernetes, reducing deployment time by 40%..."
            className="w-full h-32 bg-secondary border border-border rounded-md p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors resize-none custom-scrollbar"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={adding || !newText.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground font-medium rounded-md transition-opacity"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {adding ? "Embedding..." : "Add to Knowledge Base"}
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground px-1">Current Knowledge Base ({items.length})</h3>

        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-10 text-center">
            <Database className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Your knowledge base is empty.</p>
            <p className="text-sm text-muted-foreground/70 mt-2">Add some career experiences above to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="bg-card border border-border rounded-lg p-5 group flex gap-4 transition-colors hover:border-ring/40 items-start">
                <p className="text-foreground text-sm leading-relaxed flex-1 whitespace-pre-wrap">{item.text}</p>
                {deletingId === item.id ? (
                  <div className="flex items-center gap-2 pt-1 shrink-0">
                    <span className="text-xs text-destructive font-medium mr-1">Delete?</span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="px-3 py-1.5 bg-destructive/15 text-destructive hover:bg-destructive/25 rounded-md text-xs font-medium transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="px-3 py-1.5 bg-secondary text-foreground hover:bg-accent rounded-md text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0"
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
