import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import { ToastProvider } from './components/Toast'
import { loadRuntimeConfig } from './lib/runtime-config'

// Awaited before importing App (and everything it pulls in, including api.ts) so every
// module that reads `runtimeConfig` at load time sees it already populated.
const config = await loadRuntimeConfig()
const { default: App } = await import('./App.tsx')

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <GoogleOAuthProvider clientId={config.googleClientId}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </GoogleOAuthProvider>
  </BrowserRouter>
)
