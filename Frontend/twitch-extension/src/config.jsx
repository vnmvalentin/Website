// config.jsx — Einstellungsseite der Erweiterung (config.html), sieht nur der Streamer im Twitch-Dashboard.
// Zeigt, ob für seinen Kanal ein Win Tracker eingerichtet ist (GET /api/twitch-ext/status), wie er ihn einrichtet, und
// eine Vorschau des Panels. Gespeichert wird hier nichts: Das Panel folgt den Einstellungen im Win Tracker.
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./ext.css";
import PanelView from "./PanelView.jsx";
import { EXT_TEXTS } from "./texts.js";
import { initTwitch, onContext, viewerLang } from "./twitch.js";
import { getChannelStatus } from "./extApi.js";

initTwitch();
const lang = viewerLang();
document.documentElement.lang = lang;
const t = EXT_TEXTS.dict(lang);
const RECHECK_MS = 10 * 1000;

function Config() {
  const [theme, setTheme] = useState("dark");
  const [state, setState] = useState({ phase: "checking" });
  useEffect(() => onContext((ctx) => setTheme(ctx.theme === "light" ? "light" : "dark")), []);
  useEffect(() => { document.body.classList.toggle("tx-light", theme === "light"); }, [theme]);

  const check = useCallback(() => {
    getChannelStatus()
      .then((s) => setState({ phase: s.tracker && s.hasAccount ? "ok" : s.tracker ? "no_account" : "missing", ...s }))
      .catch((e) => setState({ phase: e.code === "not_configured" ? "not_configured" : "error" }));
  }, []);

  // Solange nichts eingerichtet ist, von selbst nachsehen — der Streamer richtet es meist in einem zweiten Tab ein
  useEffect(() => {
    check();
    const id = setInterval(() => { if (!document.hidden) check(); }, RECHECK_MS);
    return () => clearInterval(id);
  }, [check]);

  const c = t.config;
  const trackerLink = state.setupUrl ? `${state.setupUrl}${lang === "en" ? "?lang=en" : ""}` : null;

  return (
    <main className={`tx-root tx-config${theme === "light" ? " tx-light" : ""}`}>
      <h1>{c.title}</h1>
      <p>{c.intro}</p>

      {state.phase === "checking" && <div className="tx-box" role="status"><p>{c.checking}</p></div>}

      {state.phase === "ok" && (
        <div className="tx-box is-ok" role="status" data-tx-config="ok">
          <span className="tx-state"><span className="tx-dot" />{c.found}</span>
          <p>{c.foundText(state.playerName, state.playerTag)}</p>
        </div>
      )}

      {(state.phase === "missing" || state.phase === "no_account") && (
        <div className="tx-box is-warn" role="status" data-tx-config={state.phase}>
          <span className="tx-state"><span className="tx-dot" />{state.phase === "missing" ? c.missingTitle : c.noAccountTitle}</span>
          {state.phase === "missing"
            ? <ol className="tx-steps">{c.missingSteps.map((s) => <li key={s}>{s}</li>)}</ol>
            : <p>{c.noAccountText}</p>}
          <div className="tx-actions">
            {trackerLink && <a className="tx-btn" href={trackerLink} target="_blank" rel="noopener noreferrer">{c.openTracker}</a>}
            <button type="button" className="tx-btn is-ghost" onClick={check}>{c.recheck}</button>
          </div>
        </div>
      )}

      {(state.phase === "error" || state.phase === "not_configured") && (
        <div className="tx-box is-warn" role="status" data-tx-config={state.phase}>
          <p>{state.phase === "not_configured" ? c.notConfigured : c.error}</p>
          <div className="tx-actions"><button type="button" className="tx-btn is-ghost" onClick={check}>{c.recheck}</button></div>
        </div>
      )}

      <p className="tx-note">{c.lookHint}</p>

      {state.phase === "ok" && (
        <section className="tx-preview" aria-label={c.previewTitle}>
          <h2>{c.previewTitle}</h2>
          <div className="tx-preview-frame"><PanelView t={t} footer={false} /></div>
        </section>
      )}

      <p className="tx-note">{c.privacy}</p>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Config />);
