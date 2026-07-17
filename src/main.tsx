import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import App from "./App";
import { restoreApiKeys } from "./lib/apiKeyStorage";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("RecallFlow could not start because the root element is missing.");
}

const renderApp = () =>
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

const startApp = async () => {
  if (isTauri()) {
    try {
      await restoreApiKeys();
    } catch {
      // Keep local features available when the encrypted vault cannot open.
    }
  }
  renderApp();
};

void startApp();
