import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/reset.css";
import "./styles/variables.css";
import "./styles/themes/light.css";
import "./styles/themes/dark.css";
import "./styles/themes/tokyo-night.css";
import "./styles/themes/tokyo-night-light.css";
import "./styles/themes/everforest-dark.css";
import "./styles/themes/everforest-light.css";
import "./styles/themes/catppuccin-mocha.css";
import "./styles/themes/catppuccin-latte.css";
import "./styles/themes/nord.css";
import "./styles/themes/nord-light.css";
import "./styles/themes/gruvbox-dark.css";
import "./styles/themes/gruvbox-light.css";
import "./styles/themes/rose-pine.css";
import "./styles/themes/one-dark.css";
import "./styles/fonts.css";
import "./styles/app.css";
import "./styles/vditor-overrides.css";
import "./styles/vim-editor.css";

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
