import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initErrorReporter } from '@web/lib/error-reporter';
import { LangProvider } from '@web/i18n/useT';
import 'leaflet/dist/leaflet.css';
import './index.css';

// 전역 에러 핸들러 등록 (window.onerror + unhandledrejection)
initErrorReporter();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
);

// PWA 서비스 워커 등록
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW 등록 실패 — 무시 (오프라인 기능 없이 계속)
    });
  });
}
