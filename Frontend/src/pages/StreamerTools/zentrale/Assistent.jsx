// Assistent.jsx — Einrichtungs-Assistent der Streamer-Zentrale: angemeldet → Overlay wählen → in OBS testen.
//
// Im letzten Schritt holt er den Overlay-Link des gewählten Werkzeugs (das legt den Eintrag beim ersten Mal an) und
// erkennt, sobald die OBS-Quelle abfragt: die Zentrale fragt dafür alle drei Sekunden ihren Stand ab
// (StreamerZentralePage.jsx), hier wird nur ausgewertet.
import React, { useEffect, useState } from "react";
import { Check, CircleCheck, Copy, LoaderCircle, X } from "lucide-react";
import { Button } from "../../../components/ui";
import { fetchOverlayInfo, copyText } from "./zentraleApi";
import { isConnected } from "./zentraleView";
import ObsPanel, { ObsButton } from "./ObsPanel";
import { OBS_TOOLS } from "./obsSetup";

/**
 * @param {object} props
 * @param {object} props.t          Texte (ZENTRALE_TEXTS)
 * @param {object} props.user       angemeldeter Nutzer
 * @param {object} props.status     Stand der Zentrale
 * @param {Array}  props.tools      Werkzeuge (ZENTRALE_TOOLS), nur die mit wizard: true
 * @param {string|null} props.tool  gewähltes Werkzeug oder null
 * @param {(tool: string|null) => void} props.onPick
 * @param {() => void} props.onClose
 * @param {object} props.obs        OBS-Verbindung (useObs) — verbunden: Quelle per Knopfdruck anlegen
 */
export default function Assistent({ t, user, status, tools, tool, onPick, onClose, obs }) {
  const w = t.wizard;
  const meta = tools.find((x) => x.key === tool) || null;
  const [link, setLink] = useState({ tool: null, url: "", settings: null, error: false });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!meta || !meta.overlay) return undefined;
    let alive = true;
    setLink({ tool: meta.key, url: "", settings: null, error: false });
    fetchOverlayInfo(meta.key, user.id)
      .then((info) => { if (alive) setLink({ tool: meta.key, url: `${window.location.origin}${info.path}`, settings: info.settings || null, error: false }); })
      .catch(() => { if (alive) setLink({ tool: meta.key, url: "", settings: null, error: true }); });
    return () => { alive = false; };
  }, [meta?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = meta ? 3 : 2;
  const connected = meta && meta.overlay && link.url ? isConnected(meta.key, status) : false;
  const copy = async () => {
    if (await copyText(link.url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section aria-labelledby="sz-wizard" className="rounded-lg border border-accent/30 bg-surface p-5 md:p-6 mb-8" data-zentrale-wizard>
      <div className="flex items-start justify-between gap-4 mb-5">
        <h2 id="sz-wizard" className="font-display text-lg md:text-xl font-bold text-white tracking-tight">{w.title}</h2>
        <button type="button" onClick={onClose} title={w.close} aria-label={w.close}
          className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md text-white/45 hover:text-white hover:bg-white/5 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Schritte */}
      <ol className="flex flex-wrap gap-x-6 gap-y-2 mb-6 text-sm">
        {w.steps.map((label, i) => {
          const n = i + 1;
          const done = n < step || (n === 3 && connected);
          return (
            <li key={label} className={`flex items-center gap-2 ${n === step ? "text-white font-semibold" : done ? "text-white/60" : "text-white/35"}`}
              aria-current={n === step ? "step" : undefined}>
              <span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold ${
                done ? "bg-green-500/20 text-green-300" : n === step ? "bg-accent/25 text-white" : "bg-white/5 text-white/40"}`}>
                {done ? <Check size={13} /> : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {!meta && (
        <>
          <p className="text-sm text-white/55 mb-4">{w.signedIn(user.displayName || user.login || "")}</p>
          <h3 className="text-white font-semibold mb-3">{w.pickHeading}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tools.map((x) => (
              <button key={x.key} type="button" onClick={() => onPick(x.key)} data-pick={x.key}
                className="text-left flex items-start gap-3 rounded-lg border border-line bg-[#0b0b11] hover:border-accent/45 transition-colors p-4">
                <x.icon size={18} className="text-accent-soft shrink-0 mt-0.5" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{t.tools[x.key]}</span>
                    {x.cr && <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/40">{w.crTag}</span>}
                  </span>
                  <span className="block text-sm text-white/50 mt-0.5">{t.toolHints[x.key]}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {meta && !meta.overlay && (
        <div className="space-y-4">
          <p className="text-sm text-white/60 max-w-2xl">{w.bingoText}</p>
          <div className="flex flex-wrap gap-2">
            <Button to={meta.to}>{w.openTool(t.tools[meta.key])}</Button>
            <Button variant="ghost" onClick={() => onPick(null)}>{w.back}</Button>
          </div>
        </div>
      )}

      {meta && meta.overlay && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/45 mb-2">{w.linkLabel}</p>
              {link.error ? (
                <p className="text-sm text-red-300">{w.linkError}</p>
              ) : !link.url ? (
                <p className="text-sm text-white/50 inline-flex items-center gap-2"><LoaderCircle size={14} className="animate-spin" />{w.linkLoading}</p>
              ) : (
                <div className="flex gap-2">
                  <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label={w.linkLabel} data-overlay-link
                    className="min-w-0 flex-1 bg-[#0b0b11] border border-line rounded-md px-3 h-10 text-sm text-white/80 font-mono" />
                  <Button icon={copied ? Check : Copy} onClick={copy}>{copied ? t.actions.copied : t.actions.copy}</Button>
                </div>
              )}
              <p className="text-xs text-white/40 mt-2">{w.linkSecret}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/45 mb-2">{w.obsHeading}</p>
              <ol className="space-y-1.5 text-sm text-white/65 list-decimal pl-5">
                {w.obsSteps(meta.size).map((s) => <li key={s}>{s}</li>)}
              </ol>
            </div>
            {/* Statt von Hand: per OBS-Verbindung (obs-knopf) */}
            {obs && OBS_TOOLS.includes(meta.key) && link.url && (
              <div className="border-t border-line pt-4 space-y-3" data-wizard-obs>
                <p className="text-sm text-white/60">{w.autoHint}</p>
                {obs.phase === "connected" ? (
                  <>
                    <ObsPanel t={t} obs={obs} compact />
                    <ObsButton t={t} obs={obs} tool={meta.key} size="md" variant="primary"
                      getTarget={async () => ({ url: link.url, wtSettings: link.settings || undefined })} />
                  </>
                ) : (
                  <ObsPanel t={t} obs={obs} compact />
                )}
              </div>
            )}
          </div>

          <div className="min-w-0 rounded-lg border border-line bg-[#0b0b11] p-4 flex flex-col gap-3" data-obs-check={connected ? "ok" : "waiting"}>
            {connected ? (
              <p className="flex items-center gap-2 text-green-300 font-semibold" role="status">
                <CircleCheck size={18} />{meta.key === "winTracker" ? w.connectedData : w.connected}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-white/60" role="status">
                <LoaderCircle size={16} className="animate-spin text-white/40" />{meta.key === "winTracker" ? w.waitingData : w.waiting}
              </p>
            )}
            <p className="text-sm text-white/50">{w.next[meta.key]}</p>
            <div className="flex flex-wrap gap-2 mt-auto pt-1">
              <Button to={meta.to} size="sm">{w.openTool(t.tools[meta.key])}</Button>
              <Button variant="secondary" size="sm" onClick={onClose}>{w.done}</Button>
              <Button variant="ghost" size="sm" onClick={() => onPick(null)}>{w.back}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
