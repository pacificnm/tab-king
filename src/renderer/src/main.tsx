import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initPrefs } from './prefs/store'
import { initTheme } from './theme'
import './styles/index.css'

initTheme()
initPrefs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
