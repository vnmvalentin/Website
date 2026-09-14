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
  es: [
    { key: "gameStart", title: "Empieza el minijuego", desc: "Se activa en cuanto el host inicia un minijuego — por ejemplo, cambiar a la escena del navegador con el minijuego." },
    { key: "draftEnd", title: "Draft terminado", desc: "Se activa cuando todos los mazos están completos — por ejemplo, volver a la escena de Clash Royale." },
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
    step1Body: 'Diese Quelle ist Voraussetzung für alles Weitere.',
    step1Why: 'Sie ist gleichzeitig das Deck-Overlay und die Brücke zu OBS: Nach jedem abgeschlossenen Draft zeigt sie automatisch die finalen Decks — egal in welcher Lobby du mitspielst — und führt die Automatiken aus Schritt 3 aus, auch wenn sie selbst ausgeblendet ist.',
    whyLabel: 'Wozu ist das gut?',
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
    step2Body: 'In OBS: Werkzeuge → WebSocket-Servereinstellungen → aktivieren, Passwort hier eintragen.',
    step2Why: 'Die Verbindung läuft direkt von diesem Browser bzw. der Overlay-Quelle zu OBS auf demselben PC — nichts davon geht über unseren Server. Sobald die Verbindung steht, wird das Passwort automatisch gespeichert.',
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
    obsNotConnected: 'OBS nicht verbunden',
  },
  en: {
    title: 'Streamer Setup',
    subtitle: 'OBS automations & global deck overlay',
    loginPrompt: 'Sign in with Twitch to save your streamer configuration.',
    loginBtn: 'Sign in with Twitch',
    loadingConfig: 'Loading configuration…',
    loadError: 'Configuration could not be loaded.',
    step1Title: 'Add browser source',
    step1Body: 'This source is required for everything below.',
    step1Why: "It's both the deck overlay and the bridge to OBS: after every completed draft it automatically shows the final decks — in any lobby you play in — and it runs the automations from step 3, even while hidden itself.",
    whyLabel: 'What is this for?',
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
    step2Body: 'In OBS: Tools → WebSocket Server Settings → enable it, then enter the password here.',
    step2Why: 'The connection runs directly from this browser (or the overlay source) to OBS on the same PC — none of it goes through our server. Once connected, the password is saved automatically.',
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
    obsNotConnected: 'OBS not connected',
  },
  es: {
    title: 'Configuración de streamer',
    subtitle: 'Automatizaciones de OBS y overlay de mazos global',
    loginPrompt: 'Inicia sesión con Twitch para guardar tu configuración de streamer.',
    loginBtn: 'Iniciar sesión con Twitch',
    loadingConfig: 'Cargando configuración…',
    loadError: 'No se pudo cargar la configuración.',
    step1Title: 'Añadir fuente de navegador',
    step1Body: 'Esta fuente es necesaria para todo lo demás.',
    step1Why: 'Es a la vez el overlay de mazos y el puente hacia OBS: después de cada draft completado muestra automáticamente los mazos finales — en cualquier sala en la que juegues — y ejecuta las automatizaciones del paso 3, incluso mientras está oculta.',
    whyLabel: '¿Para qué sirve esto?',
    step1HowToPre: 'En OBS: "+" bajo Fuentes →',
    step1HowToBrowser: 'Navegador',
    step1HowToPost: '→ crear nueva fuente → pega este enlace:',
    copied: 'Copiado',
    copy: 'Copiar',
    step1Bullet1: 'Ajusta el ancho/alto a 1920×1080 en las propiedades de la fuente — el fondo es transparente.',
    step1Bullet2: 'NO actives "Apagar fuente cuando no esté visible" en las propiedades de la fuente — si no, las automatizaciones se pausan.',
    regenerateLink: 'Regenerar enlace (el enlace anterior dejará de funcionar)',
    regenerateConfirm: '¿Regenerar el enlace del overlay? El enlace anterior (también en OBS) dejará de funcionar.',
    step2Title: 'Conectar con OBS',
    step2Body: 'En OBS: Herramientas → Ajustes del servidor WebSocket → actívalo, luego introduce aquí la contraseña.',
    step2Why: 'La conexión va directamente de este navegador (o de la fuente del overlay) a OBS en el mismo PC — nada de esto pasa por nuestro servidor. En cuanto se conecta, la contraseña se guarda automáticamente.',
    host: 'Host',
    port: 'Puerto',
    password: 'Contraseña',
    passwordPlaceholder: 'Contraseña del WebSocket de OBS',
    reconnect: 'Reconectar',
    connectAndLoad: 'Conectar y cargar escenas',
    connected: (n) => `Conectado — ${n} escenas cargadas`,
    step3Title: 'Automatizaciones',
    testNow: 'Probar ahora',
    actionExecuted: 'Acción ejecutada en OBS.',
    switchSceneTo: 'Cambiar a la escena',
    noSceneChange: '— no cambiar de escena —',
    source: 'Fuente',
    noSourceAction: '— sin acción de fuente —',
    showSource: 'Mostrar fuente',
    hideSource: 'Ocultar fuente',
    sourceWithGroups: 'Fuente (incluidas dentro de grupos/carpetas)',
    chooseSource: '— elegir fuente —',
    saved: 'Guardado',
    saving: 'Guardando…',
    saveConfig: 'Guardar configuración',
    genericError: 'Error',
    obsNotConnected: 'OBS no conectado',
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

/**
 * Aufklappbare Hintergrund-Erklärung. Die Schritte selbst bleiben so kurz, dass
 * man sie überfliegen kann — das "warum" steht darunter, wenn man es braucht.
 */
function Why({ label, children }) {
  return (
    <details className="mb-4 group">
      <summary className="text-[11px] text-gray-500 hover:text-cyan-400 cursor-pointer select-none list-none flex items-center gap-1 transition-colors">
        <span className="inline-block transition-transform group-open:rotate-90">›</span>
        {label}
      </summary>
      <p className="text-xs text-gray-500 leading-relaxed mt-2 pl-3 border-l border-white/10">{children}</p>
    </details>
  );
}

export default function StreamerConfigPanel({ onClose, lang = "de", bare = false }) {
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
      } catch {
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
    } catch { /* ignore */ } finally {
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
      if (!client?.connected) throw new Error(s.obsNotConnected);
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
    } catch { /* ignore */ }
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

  // `bare`: nur den Inhalt liefern, ohne eigenes Overlay/Header/Scroll-Rahmen — genutzt,
  // wenn ein anderer Dialog (das Profil-Modal) die Hülle stellt. Standalone (bare=false)
  // bleibt exakt wie zuvor, für den Fall, dass der Panel-Trigger woanders wiederverwendet wird.
  const body = (
    <>
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
                <p className="text-xs text-gray-500 mb-2">
                  {s.step1Body}
                </p>
                <Why label={s.whyLabel}>{s.step1Why}</Why>
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
                <p className="text-xs text-gray-500 mb-2">
                  {s.step2Body}
                </p>
                <Why label={s.whyLabel}>{s.step2Why}</Why>
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
    </>
  );

  if (bare) return <div className="space-y-6">{body}</div>;

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
          {body}
        </div>
      </div>
    </div>
  );
}
