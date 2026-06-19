import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext.jsx'
import { GamificationProvider } from './context/GamificationContext.jsx'
import { ProgressProvider } from './context/ProgressContext.jsx'
import './index.css'
import 'katex/dist/katex.min.css'
import './services/firebase.js'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <GamificationProvider>
        <ProgressProvider>
          <App />
        </ProgressProvider>
      </GamificationProvider>
    </AuthProvider>
  </StrictMode>,
)
