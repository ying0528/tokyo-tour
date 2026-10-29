import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { registerServiceWorker } from './app/pwa.ts';
import './styles.css';

registerServiceWorker();
createRoot(document.getElementById('root')!).render(<App />);
