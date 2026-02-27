// FILE: src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./pwa";

import { logReactBoundary, logUnhandledRejectionEvent, logWindowErrorEvent } from "./utils/clientLog";

// Non-React crash protection (async, promise rejections, script errors)
window.addEventListener("error", (e) => {
  console.error("Global error:", e?.error || e);
  logWindowErrorEvent(e);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled rejection:", e?.reason || e);
  logUnhandledRejectionEvent(e);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary onError={logReactBoundary}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
