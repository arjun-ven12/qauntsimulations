import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app.js';
import './styles/index.css';
const root = document.getElementById('root');
if (!root) throw new Error('Application root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
