import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PopupPage from '@/components/page/PopupPage';
import { SidebarProvider } from '@/components/ui/sidebar';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <SidebarProvider>
            <PopupPage />
        </SidebarProvider>
    </StrictMode>,
);
