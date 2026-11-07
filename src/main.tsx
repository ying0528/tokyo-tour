import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { registerServiceWorker } from './app/pwa.ts';
import './styles.css';
import { applyFontSize } from './lib/fontSize.ts';

applyFontSize();
registerServiceWorker();
createRoot(document.getElementById('root')!).render(<App />);
