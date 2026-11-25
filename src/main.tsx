import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </ErrorBoundary>,
);
