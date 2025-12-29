import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OptionsPage from '@/components/page/OptionsPage';
import { ThemeProvider } from '@/components/theme-provider';
import '@/globals.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider storageKey="bookmark-scout-theme">
      <OptionsPage />
    </ThemeProvider>
  </StrictMode>,
);
