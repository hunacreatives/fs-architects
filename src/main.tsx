import { StrictMode } from 'react'
import './i18n'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Deep-link handoff from the service worker: when a push notification is
// clicked and the SW can't navigate the window itself (uncontrolled client),
// it posts the target URL here instead.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'push-navigate' && typeof e.data.url === 'string') {
      try {
        const url = new URL(e.data.url, window.location.origin);
        if (url.origin === window.location.origin && url.pathname.startsWith('/hub')) {
          window.location.assign(url.pathname + url.search + url.hash);
        }
      } catch { /* malformed URL — ignore */ }
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
