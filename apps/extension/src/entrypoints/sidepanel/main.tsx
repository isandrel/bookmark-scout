import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PopupPage from '@/components/page/PopupPage';
import { ThemeProvider } from '@/components/theme-provider';
import { SidebarProvider } from '@/components/ui/sidebar';
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
