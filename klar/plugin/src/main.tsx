import "@framer/plugin/framer.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { framer } from "@framer/plugin";
import { App } from "./App";
import "./app.css";

framer.showUI({
  position: "top right",
  width: 640,
  height: 560,
  resizable: true,
  minWidth: 480,
  minHeight: 420,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
