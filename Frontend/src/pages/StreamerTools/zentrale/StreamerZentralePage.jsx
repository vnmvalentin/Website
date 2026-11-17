// StreamerZentralePage.jsx — /streamer-zentrale: der gemeinsame Startpunkt der Streamer-Werkzeuge (Ausbauplan
// „streamer-zentrale“). Zeigt je Werkzeug, ob es eingerichtet ist, ob die OBS-Quelle gerade läuft bzw. wann sie
// zuletzt da war, und was fehlt (Rechte, Verbindung, Chat-Bot). Wer noch nichts eingerichtet hat, landet im
// Assistenten (Assistent.jsx). Läuft in der Tool-Hülle (tools.js), Deutsch und Englisch.
//
// Der Stand kommt aus /api/streamer-zentrale (nur lesen, Backend/streamerZentrale) und /api/discord/guilds.
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Copy, Check, TriangleAlert, Plus, RefreshCw } from "lucide-react";
import SEO from "../../../components/SEO";
import { Button, TwitchLoginButton } from "../../../components/ui";
import { TwitchAuthContext } from "../../../components/TwitchAuthContext";
import { useLanguage } from "../../../i18n/language";
import { ZENTRALE_TEXTS } from "./zentraleTexts";
import { ZENTRALE_TOOLS, WIZARD_TOOLS, toolView } from "./zentraleView";
import { getStatus, getDiscord, copyText, fetchOverlayInfo } from "./zentraleApi";
import Assistent from "./Assistent";
import ObsPanel, { ObsButton } from "./ObsPanel";
import { useObs, loadObsPrefs } from "./useObs";
import { OBS_TOOLS } from "./obsSetup";

const SLOW_MS = 15 * 1000;
const FAST_MS = 3 * 1000;

const PILL = {
  live: "bg-green-500/15 text-green-300",
  seen: "bg-white/[0.06] text-white/60",
  ready: "bg-white/[0.06] text-white/60",
  never: "bg-white/[0.04] text-white/50",
  off: "bg-white/[0.04] text-white/40",
};

/** Ziel für den OBS-Knopf: volle Overlay-Adresse, beim Win Tracker samt Einstellungen (für die Größe). */
const obsTarget = (tool, overlayPath, userId) => async () => {
  const url = `${window.location.origin}${overlayPath}`;
  if (tool !== "winTracker") return { url };
  const info = await fetchOverlayInfo("winTracker", userId).catch(() => null);
  return { url, wtSettings: info?.settings };
};

function ToolCard({ view, meta, t, onSetUp, obs, userId }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(`${window.location.origin}${view.overlayPath}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface/80 p-4 md:p-5 min-w-0" data-tool={view.key}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-md bg-accent/10 text-accent-soft">
          <meta.icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white leading-tight">{t.tools[view.key]}</h3>
          <p className="text-xs text-white/45 mt-0.5">{t.toolHints[view.key]}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold ${PILL[view.state.kind]}`} data-state={view.state.kind}>
          {view.state.kind === "live" && <span className="w-1.5 h-1.5 rounded-full bg-green-400" aria-hidden="true" />}
          {view.state.text}
        </span>
      </div>
      {view.facts.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/60">
          {view.facts.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      {view.issues.map((code) => (
        <p key={code} className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-[12.5px] text-amber-100" data-issue={code}>
          <TriangleAlert size={14} className="shrink-0 mt-0.5 text-amber-300" aria-hidden="true" />
          <span>{t.issues[code] || code}</span>
        </p>
      ))}
      <div className="flex flex-wrap gap-2 mt-auto pt-1">
        {view.used || !meta.wizard
          ? <Button size="sm" to={meta.to}>{view.used ? t.actions.open : t.actions.setUp}</Button>
          : <Button size="sm" onClick={() => onSetUp(meta.key)}>{t.actions.setUp}</Button>}
        {view.used && view.overlayPath && (
          <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy}>{copied ? t.actions.copied : t.actions.copy}</Button>
        )}
        {view.used && view.overlayPath && OBS_TOOLS.includes(view.key) && (
          <ObsButton t={t} obs={obs} tool={view.key} getTarget={obsTarget(view.key, view.overlayPath, userId)} />
        )}
      </div>
    </article>
  );
}

export default function StreamerZentralePage() {
  const { user } = useContext(TwitchAuthContext);
  const { lang } = useLanguage({ supported: ZENTRALE_TEXTS.langs });
  const t = ZENTRALE_TEXTS.dict(lang);
  const [status, setStatus] = useState(null);
  const [failed, setFailed] = useState(false);
  const [discord, setDiscord] = useState(null);
  // null = zu; { tool: null } = Auswahl; { tool: "twitch" } = Link + OBS-Test
  const [wizard, setWizard] = useState(null);
  const autoOpened = useRef(false);
  const obs = useObs();

  // Wer das Passwort ausdrücklich gemerkt hat, wird beim Öffnen gleich wieder mit OBS verbunden
  const autoObs = useRef(false);
  const { connect: obsConnect } = obs;
  useEffect(() => {
    if (!user || autoObs.current) return;
    autoObs.current = true;
    const prefs = loadObsPrefs();
    if (prefs.remember) obsConnect(prefs);
  }, [user, obsConnect]);

  // Mit OBS verbunden: unsere Quellen dort mit den aktuellen Overlay-Links abgleichen (alter Link → „aktualisieren“)
  const expected = {};
  for (const tool of OBS_TOOLS) {
    const path = status?.tools?.[tool]?.overlayPath;
    if (path) expected[tool] = `${window.location.origin}${path}`;
  }
  const expectedKey = JSON.stringify(expected);
  const { phase: obsPhase, inspect: obsInspect } = obs;
  useEffect(() => {
    if (obsPhase === "connected") obsInspect(JSON.parse(expectedKey));
  }, [obsPhase, expectedKey, obsInspect]);

  const load = useCallback(() => {
    getStatus()
      .then((s) => { setStatus(s); setFailed(false); })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    getDiscord().then(setDiscord).catch(() => {});
  }, [user, load]);

  // Im OBS-Test alle drei Sekunden, sonst gemächlich — und nur, solange der Tab sichtbar ist
  const testing = !!wizard?.tool && wizard.tool !== "bingo";
  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(() => { if (!document.hidden) load(); }, testing ? FAST_MS : SLOW_MS);
    return () => clearInterval(id);
  }, [user, testing, load]);

  // Wer noch nichts eingerichtet hat, bekommt gleich den Assistenten
  useEffect(() => {
    if (!status || autoOpened.current) return;
    autoOpened.current = true;
    if (!Object.values(status.tools || {}).some((x) => x.used)) setWizard({ tool: null });
  }, [status]);

  const seo = <SEO title={t.title} description={t.seoDescription} path="/streamer-zentrale" lang={lang} noindex />;

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-6 md:py-12">
        {seo}
        <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight">{t.loggedOutTitle}</h1>
        <p className="text-white/60 mt-3 leading-relaxed">{t.loggedOutText}</p>
        <div className="mt-6"><TwitchLoginButton>{t.login}</TwitchLoginButton></div>
      </div>
    );
  }

  const views = ZENTRALE_TOOLS.map((meta) => ({ meta, view: toolView(meta.key, status, discord, t, lang) }));
  const used = views.filter((x) => x.view.used);
  const unused = views.filter((x) => !x.view.used);
  const liveCount = used.filter((x) => x.view.state.kind === "live").length;
  const issueCount = views.reduce((n, x) => n + x.view.issues.length, 0);

  return (
    <div className="max-w-6xl mx-auto" data-zentrale>
      {seo}
      <header className="flex flex-col sm:flex-row sm:items-end gap-4 mb-8">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-soft/80 mb-2">{t.title}</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight">{t.hello(user.displayName || user.login || "")}</h1>
          <p className="text-white/55 mt-2 max-w-2xl">{t.lead}</p>
          {status && (
            <p className="text-sm text-white/45 mt-3" data-summary>
              {liveCount ? t.summaryLive(liveCount) : t.summaryNone}
              {issueCount > 0 && <> · <span className="text-amber-200">{t.summaryIssues(issueCount)}</span></>}
            </p>
          )}
        </div>
        {!wizard && <Button icon={Plus} onClick={() => setWizard({ tool: null })}>{t.newOverlay}</Button>}
      </header>

      {wizard && (
        <Assistent t={t} user={user} status={status} tools={WIZARD_TOOLS} tool={wizard.tool} obs={obs}
          onPick={(tool) => setWizard({ tool })} onClose={() => { setWizard(null); load(); }} />
      )}

      {/* OBS-Verbindung: Quellen per Knopfdruck anlegen und aktuell halten (im Assistenten steckt dasselbe kompakt) */}
      {status && !(wizard?.tool && wizard.tool !== "bingo") && (
        <section aria-label={t.obs.heading} className="mb-10"><ObsPanel t={t} obs={obs} /></section>
      )}

      {failed && !status && (
        <div className="rounded-lg border border-line bg-surface p-5 flex items-center gap-4 flex-wrap">
          <p className="text-white/60">{t.loadError}</p>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>{t.retry}</Button>
        </div>
      )}
      {!status && !failed && <p className="text-white/45">{t.loading}</p>}

      {status && used.length > 0 && (
        <section aria-labelledby="sz-tools" className="mb-10">
          <h2 id="sz-tools" className="font-display text-lg md:text-xl font-bold text-white tracking-tight mb-4">{t.toolsHeading}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {used.map(({ meta, view }) => (
              <ToolCard key={meta.key} meta={meta} view={view} t={t} obs={obs} userId={user.id} onSetUp={(tool) => setWizard({ tool })} />
            ))}
          </div>
        </section>
      )}

      {status && unused.length > 0 && (
        <section aria-labelledby="sz-unused">
          <h2 id="sz-unused" className="font-display text-lg md:text-xl font-bold text-white tracking-tight mb-4">{t.unusedHeading}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unused.map(({ meta, view }) => (
              <ToolCard key={meta.key} meta={meta} view={view} t={t} obs={obs} userId={user.id} onSetUp={(tool) => setWizard({ tool })} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
