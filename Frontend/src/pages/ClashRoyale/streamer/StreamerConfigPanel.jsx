// StreamerConfigPanel.jsx — Streamer-Konfiguration für die Clash Royale Minigames:
// OBS-Automatiken (Szenen/Quellen bei Minigame-Start & Draft-Ende) + globales Deck-Overlay.
import React, { useContext, useEffect, useRef, useState } from "react";
import { TwitchAuthContext } from "../../../components/TwitchAuthContext";
import { connectObs, fetchScenes, fetchSceneSourcesDeep, runObsEventActions } from "./obsClient";
import {
  X, Plug, Check, Copy, Eye, EyeOff, RefreshCw, Play, Monitor,
  Layers, AlertTriangle, Loader2,
} from "lucide-react";

const EVENT_DEFS_I18N = {
  de: [
    { key: "gameStart", title: "Minigame startet", desc: "Wird ausgelöst, sobald der Host ein Minigame startet — z. B. auf die Browser-Szene mit dem Minigame wechseln." },
    { key: "draftEnd", title: "Draft abgeschlossen", desc: "Wird ausgelöst, wenn alle Decks fertig sind — z. B. zurück auf die Clash-Royale-Szene wechseln." },
  ],
  en: [
    { key: "gameStart", title: "Minigame starts", desc: "Triggered as soon as the host starts a minigame — e.g. switch to the browser scene with the minigame." },
    { key: "draftEnd", title: "Draft finished", desc: "Triggered once all decks are complete — e.g. switch back to the Clash Royale scene." },
  ],
};

const STREAMER_I18N = {
  de: {
    title: 'Streamer Setup',
    subtitle: 'OBS-Automatiken & globales Deck-Overlay',
    loginPrompt: 'Melde dich mit Twitch an, um deine Streamer-Konfiguration zu speichern.',
    loginBtn: 'Mit Twitch anmelden',
    loadingConfig: 'Lade Konfiguration…',
    loadError: 'Konfiguration konnte nicht geladen werden.',
    step1Title: 'Browserquelle einfügen',
    step1Body: 'Ohne diese Quelle in OBS funktioniert nichts weiter unten — sie ist gleichzeitig das Deck-Overlay und die einzige Brücke zum WebSocket-Server. Nach jedem abgeschlossenen Draft — egal in welcher Lobby du mitspielst — zeigt sie automatisch die finalen Decks, und sie führt die Szenen-/Quellen-Automatiken aus Schritt 3 aus (auch wenn sie selbst ausgeblendet ist).',
    step1HowToPre: 'In OBS: „+“ unter Quellen →',
    step1HowToBrowser: 'Browser',
    step1HowToPost: '→ neue Quelle anlegen → diesen Link einfügen:',
    copied: 'Kopiert',
    copy: 'Kopieren',
    step1Bullet1: 'Breite/Höhe in den Quelleneigenschaften auf 1920×1080 setzen, Hintergrund ist transparent.',
    step1Bullet2: 'In den Quelleneigenschaften „Quelle herunterfahren, wenn nicht sichtbar“ NICHT aktivieren — sonst pausieren die Automatiken.',
    regenerateLink: 'Link neu generieren (alter Link wird ungültig)',
    regenerateConfirm: 'Overlay-Link neu generieren? Der alte Link (auch in OBS) wird ungültig.',
    step2Title: 'Mit OBS verbinden',
    step2Body: 'In OBS unter „Werkzeuge → WebSocket-Servereinstellungen“ den Server aktivieren und das Passwort hier eintragen. Die Verbindung läuft direkt von diesem Browser bzw. der Overlay-Quelle zu OBS auf demselben PC. Sobald die Verbindung klappt, wird das Passwort automatisch gespeichert.',
    host: 'Host',
    port: 'Port',
    password: 'Passwort',
    passwordPlaceholder: 'OBS-WebSocket-Passwort',
    reconnect: 'Neu verbinden',
    connectAndLoad: 'Verbinden & Szenen laden',
    connected: (n) => `Verbunden — ${n} Szenen geladen`,
    step3Title: 'Automatiken',
    testNow: 'Jetzt testen',
    actionExecuted: 'Aktion in OBS ausgeführt.',
    switchSceneTo: 'Szene wechseln zu',
    noSceneChange: '— Szene nicht wechseln —',
    source: 'Quelle',
    noSourceAction: '— keine Quellen-Aktion —',
    showSource: 'Quelle einblenden',
    hideSource: 'Quelle ausblenden',
    sourceWithGroups: 'Quelle (auch aus Gruppen/Ordnern)',
    chooseSource: '— Quelle wählen —',
    saved: 'Gespeichert',
    saving: 'Speichern…',
    saveConfig: 'Konfiguration speichern',
    genericError: 'Fehler',
  },
  en: {
    title: 'Streamer Setup',
    subtitle: 'OBS automations & global deck overlay',
    loginPrompt: 'Sign in with Twitch to save your streamer configuration.',
    loginBtn: 'Sign in with Twitch',
    loadingConfig: 'Loading configuration…',
    loadError: 'Configuration could not be loaded.',
    step1Title: 'Add browser source',
    step1Body: "Nothing below works without this source in OBS — it's both the deck overlay and the only bridge to the WebSocket server. After every completed draft — in any lobby you play in — it automatically shows the final decks, and it runs the scene/source automations from step 3 (even while hidden itself).",
    step1HowToPre: 'In OBS: "+" under Sources →',
    step1HowToBrowser: 'Browser',
    step1HowToPost: '→ create new source → paste this link:',
    copied: 'Copied',
    copy: 'Copy',
    step1Bullet1: 'Set width/height to 1920×1080 in the source properties — the background is transparent.',
    step1Bullet2: 'Do NOT enable "Shutdown source when not visible" in the source properties — otherwise the automations pause.',
    regenerateLink: 'Regenerate link (old link becomes invalid)',
    regenerateConfirm: 'Regenerate the overlay link? The old link (including in OBS) will become invalid.',
    step2Title: 'Connect to OBS',
    step2Body: 'In OBS, under "Tools → WebSocket Server Settings", enable the server and enter the password here. The connection runs directly from this browser (or the overlay source) to OBS on the same PC. As soon as the connection works, the password is saved automatically.',
    host: 'Host',
    port: 'Port',
    password: 'Password',
    passwordPlaceholder: 'OBS WebSocket password',
    reconnect: 'Reconnect',
    connectAndLoad: 'Connect & load scenes',
    connected: (n) => `Connected — ${n} scenes loaded`,
    step3Title: 'Automations',
    testNow: 'Test now',
    actionExecuted: 'Action executed in OBS.',
    switchSceneTo: 'Switch scene to',
    noSceneChange: "— don't switch scene —",
    source: 'Source',
    noSourceAction: '— no source action —',
    showSource: 'Show source',
    hideSource: 'Hide source',
    sourceWithGroups: 'Source (including groups/folders)',
    chooseSource: '— choose source —',
    saved: 'Saved',
    saving: 'Saving…',
    saveConfig: 'Save configuration',
    genericError: 'Error',
  },
};

const EMPTY_FORM_ACTION = { sceneName: "", srcAction: "none", srcScene: "", srcSource: "" };

// Modul-Singleton: Die OBS-Verbindung überlebt das Schließen des Panels und
// wird beim erneuten Öffnen übernommen statt neu aufgebaut.
let sharedObsClient = null;

// Encoding für den "Quelle"-Dropdown: eine Option kodiert Container (Szene ODER
// verschachtelte Gruppe) + Quellenname in einem String, damit ein einzelner
// <select> auch Quellen innerhalb von Gruppen ("Ordnern") direkt adressieren kann.
const SRC_SEP = String.fromCharCode(31);
const encodeSrc = (containerName, sourceName) => `${containerName || ""}${SRC_SEP}${sourceName || ""}`;
const decodeSrc = (value) => {
  const idx = value.indexOf(SRC_SEP);
  return idx === -1 ? ["", ""] : [value.slice(0, idx), value.slice(idx + 1)];
};

/** Server-Format → Formular-Format */
function actionToForm(a) {
  return {
    sceneName: a?.sceneName || "",
    srcAction: a?.source?.action || "none",
    srcScene: a?.source?.sceneName || "",
    srcSource: a?.source?.sourceName || "",
  };
}

/** Formular-Format → Server-Format */
function formToAction(f) {
  return {
    sceneName: f.sceneName || null,
    source:
      f.srcAction !== "none" && f.srcScene && f.srcSource
        ? { sceneName: f.srcScene, sourceName: f.srcSource, action: f.srcAction }
        : null,
  };
}

export default function StreamerConfigPanel({ onClose, lang = "de" }) {
  const { user, login } = useContext(TwitchAuthContext);
  const s = STREAMER_I18N[lang] || STREAMER_I18N.de;
  const EVENT_DEFS = EVENT_DEFS_I18N[lang] || EVENT_DEFS_I18N.de;

  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [obsForm, setObsForm] = useState({ host: "127.0.0.1", port: 4455, password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [actions, setActions] = useState({
    gameStart: { ...EMPTY_FORM_ACTION },
    draftEnd: { ...EMPTY_FORM_ACTION },
  });

  const obsClientRef = useRef(null);
  const [obsStatus, setObsStatus] = useState("idle"); // idle | connecting | connected | error
  const [obsError, setObsError] = useState("");
  const [scenes, setScenes] = useState([]);
  // sceneName -> [{ containerName, sourceName, label }] (containerName = Szene ODER Gruppe)
  const [sourcesByScene, setSourcesByScene] = useState({});

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState({}); // { [eventKey]: 'ok' | 'fail:<msg>' | 'running' }

  const [urlVisible, setUrlVisible] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // Konfiguration laden
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch("/api/clash/streamer/config", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCfg(data);
        setObsForm({
          host: data.obs?.host || "127.0.0.1",
          port: data.obs?.port || 4455,
          password: data.obs?.password || "",
        });
        setActions({
          gameStart: actionToForm(data.actions?.gameStart),
          draftEnd: actionToForm(data.actions?.draftEnd),
        });
      } catch (e) {
        setLoadError(s.loadError);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const loadScenesFromClient = async (client) => {
    const sceneNames = await fetchScenes(client);
    setScenes(sceneNames);
    const map = {};
    for (const s of sceneNames) {
      try { map[s] = await fetchSceneSourcesDeep(client, s); } catch { map[s] = []; }
    }
    setSourcesByScene(map);
  };

  // Bestehende Verbindung aus einer früheren Panel-Sitzung übernehmen —
  // beim Schließen des Panels wird bewusst NICHT getrennt.
  useEffect(() => {
    if (sharedObsClient?.connected) {
      obsClientRef.current = sharedObsClient;
      setObsStatus("connected");
      loadScenesFromClient(sharedObsClient).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/clash/streamer/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obs: { ...obsForm, port: parseInt(obsForm.port, 10) || 4455 },
          actions: {
            gameStart: formToAction(actions.gameStart),
            draftEnd: formToAction(actions.draftEnd),
          },
        }),
      });
      if (res.ok) {
        setCfg(await res.json());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) { /* */ } finally {
      setSaving(false);
    }
  };

  const connectToObs = async () => {
    sharedObsClient?.close();
    sharedObsClient = null;
    obsClientRef.current = null;
    setObsStatus("connecting");
    setObsError("");
    try {
      const client = await connectObs({
        host: obsForm.host,
        port: obsForm.port,
        password: obsForm.password,
      });
      client.onClose(() => {
        if (sharedObsClient === client) sharedObsClient = null;
        if (obsClientRef.current === client) {
          obsClientRef.current = null;
          setObsStatus("idle");
        }
      });
      obsClientRef.current = client;
      sharedObsClient = client;

      await loadScenesFromClient(client);
      setObsStatus("connected");
      // Sobald das Passwort erfolgreich geprüft wurde, sofort persistieren —
      // sonst geht es verloren, falls man vergisst danach noch "Speichern" zu klicken.
      await saveConfig();
    } catch (e) {
      setObsStatus("error");
      setObsError(e.message || String(e));
    }
  };

  const testEvent = async (eventKey) => {
    setTestStatus((prev) => ({ ...prev, [eventKey]: "running" }));
    try {
      let client = obsClientRef.current;
      if (!client?.connected) {
        await connectToObs();
        client = obsClientRef.current;
      }
      if (!client?.connected) throw new Error(lang === "en" ? "OBS not connected" : "OBS nicht verbunden");
      await runObsEventActions(client, formToAction(actions[eventKey]));
      setTestStatus((prev) => ({ ...prev, [eventKey]: "ok" }));
    } catch (e) {
      setTestStatus((prev) => ({ ...prev, [eventKey]: "fail:" + (e.message || s.genericError) }));
    }
    setTimeout(() => setTestStatus((prev) => ({ ...prev, [eventKey]: undefined })), 4000);
  };

  const regenerateOverlay = async () => {
    if (!window.confirm(s.regenerateConfirm)) return;
    try {
      const res = await fetch("/api/clash/streamer/config/regenerate-overlay", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) setCfg(await res.json());
    } catch (e) { /* */ }
  };

  const overlayUrl = cfg?.overlayKey
    ? `${window.location.origin}/clash-royale/overlay/decks/${cfg.overlayKey}`
    : "";

  const copyOverlayUrl = () => {
    if (!overlayUrl) return;
    navigator.clipboard.writeText(overlayUrl).catch(() => {});
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 1200);
  };

  const updateAction = (eventKey, patch) =>
    setActions((prev) => ({ ...prev, [eventKey]: { ...prev[eventKey], ...patch } }));

  // "Szene wechseln zu" — nur echte Top-Level-Szenen (OBS kann nicht auf eine Gruppe wechseln)
  const sceneOptions = (extra) => {
    const set = new Set(scenes);
    if (extra) set.add(extra);
    return [...set];
  };

  // "Quelle" — alle Quellen über alle Szenen hinweg, inkl. Inhalte von Gruppen ("Ordnern"),
  // als eine flache Liste mit Breadcrumb-Label (z. B. "Hauptszene / Grafics / Screenaufnahme").
  const sourceOptionsFor = (f) => {
    const opts = [];
    const seen = new Set();
    for (const sceneName of scenes) {
      for (const s of sourcesByScene[sceneName] || []) {
        const value = encodeSrc(s.containerName, s.sourceName);
        if (seen.has(value)) continue;
        seen.add(value);
        opts.push({ value, label: `${sceneName} / ${s.label}` });
      }
    }
    // Gespeicherten Wert immer anzeigen, auch wenn OBS gerade nicht verbunden ist
    // oder die Quelle inzwischen umbenannt/entfernt wurde.
    if (f.srcScene && f.srcSource) {
      const currentValue = encodeSrc(f.srcScene, f.srcSource);
      if (!seen.has(currentValue)) {
        opts.push({ value: currentValue, label: `${f.srcScene} / ${f.srcSource}` });
      }
    }
    return opts;
  };

  const selectCls =
    "w-full bg-[#1a1a20] border border-white/10 rounded-sm px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none";
  const labelCls = "block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start md:items-center justify-center p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl bg-[#0f0f13] border border-white/10 rounded-sm my-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <Monitor size={18} className="text-cyan-400" />
            <div>
              <h2 className="text-base font-black text-white leading-none">{s.title}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">{s.subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-sm transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {!user ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-sm mb-5">
                {s.loginPrompt}
              </p>
              <button onClick={login} className="bg-[#9146FF] hover:bg-[#7c2ff2] text-white font-bold px-6 py-3 rounded-sm transition-colors text-sm">
                {s.loginBtn}
              </button>
            </div>
          ) : loading ? (
            <div className="text-center py-10 text-gray-500 animate-pulse text-sm">{s.loadingConfig}</div>
          ) : loadError ? (
            <div className="text-center py-10 text-red-400 text-sm">{loadError}</div>
          ) : (
            <>
              {/* Schritt 1: Globales Deck-Overlay — Voraussetzung für alles Weitere */}
              <div className="bg-black/20 border border-cyan-500/20 rounded-sm p-5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-1 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">1</span>
                  <Monitor size={15} className="text-cyan-400" /> {s.step1Title}
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  {s.step1Body}
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  {s.step1HowToPre} <strong className="text-white">{s.step1HowToBrowser}</strong> {s.step1HowToPost}
                </p>
                <div className="flex gap-2 mb-3">
                  <input readOnly type={urlVisible ? "text" : "password"} value={overlayUrl}
                    className="flex-1 bg-[#1a1a20] border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-gray-400 outline-none" />
                  <button onClick={() => setUrlVisible(!urlVisible)} className="px-3 bg-white/5 hover:bg-white/10 rounded-sm text-gray-400 transition-colors">
                    {urlVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button onClick={copyOverlayUrl}
                    className="px-4 bg-cyan-500 hover:bg-cyan-400 rounded-sm text-black font-bold text-xs transition-colors flex items-center gap-1.5">
                    {urlCopied ? <Check size={14} /> : <Copy size={14} />}
                    {urlCopied ? s.copied : s.copy}
                  </button>
                </div>
                <ul className="text-xs text-gray-500 space-y-1 list-disc pl-4 mb-3">
                  <li>{s.step1Bullet1}</li>
                  <li>{s.step1Bullet2}</li>
                </ul>
                <button onClick={regenerateOverlay} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5">
                  <RefreshCw size={12} /> {s.regenerateLink}
                </button>
              </div>

              {/* Schritt 2: OBS-Verbindung (für dieses Panel — Szenen/Quellen laden & testen) */}
              <div className="bg-black/20 border border-white/5 rounded-sm p-5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-1 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">2</span>
                  <Plug size={15} className="text-cyan-400" /> {s.step2Title}
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  {s.step2Body}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_1fr] gap-3 mb-3">
                  <div>
                    <label className={labelCls}>{s.host}</label>
                    <input className={selectCls} value={obsForm.host}
                      onChange={(e) => setObsForm({ ...obsForm, host: e.target.value })} placeholder="127.0.0.1" />
                  </div>
                  <div>
                    <label className={labelCls}>{s.port}</label>
                    <input className={selectCls} value={obsForm.port} inputMode="numeric"
                      onChange={(e) => setObsForm({ ...obsForm, port: e.target.value.replace(/[^0-9]/g, "") })} placeholder="4455" />
                  </div>
                  <div>
                    <label className={labelCls}>{s.password}</label>
                    <div className="flex gap-1.5">
                      <input className={selectCls} type={showPassword ? "text" : "password"} value={obsForm.password}
                        onChange={(e) => setObsForm({ ...obsForm, password: e.target.value })} placeholder={s.passwordPlaceholder} />
                      <button onClick={() => setShowPassword(!showPassword)} className="px-3 bg-white/5 hover:bg-white/10 rounded-sm text-gray-400 transition-colors shrink-0">
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={connectToObs} disabled={obsStatus === "connecting"}
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-sm text-sm transition-colors flex items-center gap-2">
                    {obsStatus === "connecting" ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
                    {obsStatus === "connected" ? s.reconnect : s.connectAndLoad}
                  </button>
                  {obsStatus === "connected" && (
                    <span className="text-xs font-bold text-green-400 flex items-center gap-1.5">
                      <Check size={14} /> {s.connected(scenes.length)}
                    </span>
                  )}
                  {obsStatus === "error" && (
                    <span className="text-xs text-red-400 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="shrink-0" /> {obsError}
                    </span>
                  )}
                </div>
              </div>

              {/* Schritt 3: Automatiken */}
              {EVENT_DEFS.map(({ key, title, desc }, idx) => {
                const f = actions[key];
                const ts = testStatus[key];
                return (
                  <div key={key} className="bg-black/20 border border-white/5 rounded-sm p-5">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
                        {idx === 0 && (
                          <span className="w-5 h-5 rounded-full bg-cyan-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">3</span>
                        )}
                        <Layers size={15} className="text-cyan-400" /> {title}
                      </h3>
                      <button onClick={() => testEvent(key)}
                        className="text-xs font-bold px-3 py-1.5 rounded-sm bg-white/5 hover:bg-white/10 text-gray-300 transition-colors flex items-center gap-1.5 shrink-0">
                        {ts === "running" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                        {s.testNow}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">{desc}</p>
                    {ts === "ok" && <p className="text-xs text-green-400 mb-3 flex items-center gap-1.5"><Check size={13} /> {s.actionExecuted}</p>}
                    {typeof ts === "string" && ts.startsWith("fail:") && (
                      <p className="text-xs text-red-400 mb-3 flex items-center gap-1.5"><AlertTriangle size={13} className="shrink-0" /> {ts.slice(5)}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Szenen-Aktion */}
                      <div>
                        <label className={labelCls}>{s.switchSceneTo}</label>
                        <select className={selectCls} value={f.sceneName}
                          onChange={(e) => updateAction(key, { sceneName: e.target.value })}>
                          <option value="">{s.noSceneChange}</option>
                          {sceneOptions(f.sceneName).map((sc) => (
                            <option key={sc} value={sc}>{sc}</option>
                          ))}
                        </select>
                      </div>

                      {/* Quellen-Aktion */}
                      <div>
                        <label className={labelCls}>{s.source}</label>
                        <select className={selectCls} value={f.srcAction}
                          onChange={(e) => updateAction(key, { srcAction: e.target.value })}>
                          <option value="none">{s.noSourceAction}</option>
                          <option value="show">{s.showSource}</option>
                          <option value="hide">{s.hideSource}</option>
                        </select>
                      </div>

                      {f.srcAction !== "none" && (
                        <div className="md:col-span-2">
                          <label className={labelCls}>{s.sourceWithGroups}</label>
                          <select className={selectCls} value={encodeSrc(f.srcScene, f.srcSource)}
                            onChange={(e) => {
                              const [containerName, sourceName] = decodeSrc(e.target.value);
                              updateAction(key, { srcScene: containerName, srcSource: sourceName });
                            }}>
                            <option value={encodeSrc("", "")}>{s.chooseSource}</option>
                            {sourceOptionsFor(f).map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Speichern */}
              <div className="flex items-center justify-end gap-3 pt-1">
                {saved && <span className="text-xs font-bold text-green-400 flex items-center gap-1.5"><Check size={14} /> {s.saved}</span>}
                <button onClick={saveConfig} disabled={saving}
                  className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-black px-6 py-2.5 rounded-sm text-sm transition-colors">
                  {saving ? s.saving : s.saveConfig}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
