// panel.jsx — Einstieg des Panels unter dem Stream (panel.html). Farbschema folgt Twitch (hell/dunkel),
// Sprache dem Zuschauer.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./ext.css";
import PanelView from "./PanelView.jsx";
import { EXT_TEXTS } from "./texts.js";
import { initTwitch, onContext, viewerLang } from "./twitch.js";

initTwitch();
const lang = viewerLang();
document.documentElement.lang = lang;

function Panel() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => onContext((ctx) => setTheme(ctx.theme === "light" ? "light" : "dark")), []);
  useEffect(() => { document.body.classList.toggle("tx-light", theme === "light"); }, [theme]);
  return (
    <div className={`tx-root${theme === "light" ? " tx-light" : ""}`}>
      <PanelView t={EXT_TEXTS.dict(lang)} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Panel />);
