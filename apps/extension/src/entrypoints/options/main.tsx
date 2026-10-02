import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider storageKey="bookmark-scout-theme">
        <LanguageRoot>
          <OptionsPage />
        </LanguageRoot>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
