import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OptionsPage from './components/page/OptionsPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptionsPage />
  </StrictMode>,
);
