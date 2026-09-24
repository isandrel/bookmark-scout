import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.scss';

// Sidepanel reuses the same PopupPage component
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider storageKey="bookmark-scout-theme">
      <SidebarProvider>
        <PopupPage />
      </SidebarProvider>
    </ThemeProvider>
  </StrictMode>,
);
