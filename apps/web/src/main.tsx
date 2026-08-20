import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/reset.css";
import "./styles/variables.css";
import "./styles/themes/light.css";
import "./styles/themes/dark.css";
import "./styles/fonts.css";
import "./styles/app.css";
import "./styles/vditor-overrides.css";

// Append custom.css last to ensure user overrides have the highest priority
const customLink = document.createElement("link");
customLink.rel = "stylesheet";
customLink.href = "/custom.css";
document.head.appendChild(customLink);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
