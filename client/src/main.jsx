import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: 'oklch(0.185 0.015 260)',
            border: '1px solid oklch(0.28 0.015 260)',
            color: 'oklch(0.925 0.01 260)',
          },
        }}
      />
    </ErrorBoundary>
  </StrictMode>,
)
