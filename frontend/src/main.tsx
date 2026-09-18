import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './store/uiStore' // applies persisted theme class before first paint
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
