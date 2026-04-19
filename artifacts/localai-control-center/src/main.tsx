import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./index.css";

// Suppress unhandled promise rejections and uncaught errors — prevents Windows
// audio chimes when Ollama is briefly unreachable or a fetch is cancelled.
window.addEventListener("unhandledrejection", (e) => {
  console.warn("[unhandledrejection suppressed]", e.reason);
  e.preventDefault();
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
