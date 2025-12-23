import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import BookmarksPage from '@/components/page/BookmarksPage';
import '@/globals.css';
import { ErrorBoundary } from '@/components/error-boundary';
import { ThemeProvider } from '@/components/theme-provider';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Failed to find the root element');
}

createRoot(rootElement).render(
    <StrictMode>
        <ErrorBoundary>
            <ThemeProvider defaultTheme="system" storageKey="bookmark-scout-theme">
                <BookmarksPage />
            </ThemeProvider>
        </ErrorBoundary>
    </StrictMode>,
);
