import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/reset.css";
import "./styles/variables.css";
import "./styles/themes/light.css";
import "./styles/themes/dark.css";
import "./styles/app.css";
import "./styles/vditor-overrides.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
