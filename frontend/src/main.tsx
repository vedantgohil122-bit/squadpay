import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker for full PWA + offline + push
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
        console.log('✅ SquadPay SW registered', reg.scope);
        // Listen for sync messages from SW
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SYNC_QUEUE') {
            window.dispatchEvent(new Event('online'));
          }
        });
      })
      .catch((err) => console.warn('SW registration failed', err));
  });
}

// Global offline -> cache flush listener
window.addEventListener('online', () => {
  document.documentElement.classList.remove('is-offline');
});
window.addEventListener('offline', () => {
  document.documentElement.classList.add('is-offline');
});
