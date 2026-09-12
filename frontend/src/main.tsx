import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { ToastProvider } from './components/Toast'
import { loadRuntimeConfig } from './lib/runtime-config'

await loadRuntimeConfig()
const { default: App } = await import('./App.tsx')

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <ToastProvider>
      <App />
    </ToastProvider>
  </BrowserRouter>
)
