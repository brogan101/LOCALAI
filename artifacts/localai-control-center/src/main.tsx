import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./index.css";

// Suppress unhandled promise rejections and uncaught errors — prevents Windows
// audio chimes when Ollama is briefly unreachable or a fetch is cancelled.
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  // Suppress only intentional AbortErrors from cancelled fetch/streams (e.g. Ollama stream cancellation)
  if (
    reason instanceof Error &&
    (reason.name === "AbortError" || (reason as any).code === 20)
  ) {
    e.preventDefault();
    return;
  }
  // All other unhandled rejections surface normally for debugging
});
window.addEventListener("error", (e) => {
  console.warn("[error suppressed]", e.message);
  e.preventDefault();
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
