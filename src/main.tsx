import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Global styles load before any component stylesheet so components can refine them.
import './styles/tokens.css'
import './styles/base.css'
import './styles/utilities.css'
import App from './App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
