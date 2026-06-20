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

// Register the service worker for PWA installability. This only enables
// "Add to Home Screen" + app-shell caching — it intentionally does not
// cache API responses (see service-worker.js comments for why).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Non-fatal — the app works fine without a service worker, it just
      // won't be installable. Never let this break the actual app.
    });
  });
}
