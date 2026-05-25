import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("ManaMap: Entry point executing...");

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error("Root element not found");
  
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log("ManaMap: Rendered successfully");
} catch (error) {
  console.error("ManaMap: Critical boot error:", error);
  document.body.innerHTML = `<div style="padding: 20px; color: red;">Critical Error: ${error}</div>`;
}
