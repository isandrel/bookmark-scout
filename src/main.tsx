import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SidebarProvider } from './components/ui/sidebar'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SidebarProvider>
      <App />
    </SidebarProvider>
  </StrictMode>,
)
