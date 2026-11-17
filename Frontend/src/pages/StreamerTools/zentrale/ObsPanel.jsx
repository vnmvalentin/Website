// ObsPanel.jsx — OBS-Verbindung der Streamer-Zentrale (Ausbauplan „obs-knopf“): Formular zum Verbinden, danach
// Version, Leinwand, Zielszene und welche unserer Quellen es in OBS schon gibt. ObsButton legt eine Quelle an oder
// bringt sie auf den aktuellen Link. Zustand und Befehle kommen aus useObs.js.
import React, { useState } from "react";
import { Check, CircleCheck, MonitorPlay, Unplug } from "lucide-react";
import { Button } from "../../../components/ui";
import { loadObsPrefs } from "./useObs";
import { OBS_TOOLS } from "./obsSetup";

const field = "bg-[#0b0b11] border border-line rounded-md px-3 h-10 text-sm text-white outline-none focus:border-accent";

/**
 * @param {object} props
 * @param {object} props.t        Texte (ZENTRALE_TEXTS)
 * @param {object} props.obs      aus useObs()
 * @param {boolean} [props.compact] im Assistenten: ohne Einleitung und Quellen-Liste
 */
export default function ObsPanel({ t, obs, compact = false }) {
  const o = t.obs;
  const [prefs, setPrefs] = useState(loadObsPrefs);
  const busy = obs.phase === "connecting";

  if (obs.phase === "connected" && obs.info) {
    const found = OBS_TOOLS.filter((tool) => obs.sources[tool]?.exists);
    return (
      <div className={compact ? "" : "rounded-lg border border-line bg-surface/80 p-4 md:p-5"} data-obs="connected">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="flex items-center gap-2 text-green-300 font-semibold text-sm">
            <CircleCheck size={16} aria-hidden="true" />{o.connected(obs.info.obsVersion)}
          </p>
          <span className="text-xs text-white/40">{o.canvas(obs.info.canvas.width, obs.info.canvas.height)}</span>
          <label className="flex items-center gap-2 text-sm text-white/60">
            {o.scene}
            <select value={obs.scene} onChange={(e) => obs.setScene(e.target.value)} className={`${field} h-8 py-0`} data-obs-scene>
              {obs.info.scenes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <Button size="sm" variant="ghost" icon={Unplug} onClick={obs.disconnect} className="ml-auto">{o.disconnect}</Button>
        </div>
        {!compact && found.length > 0 && (
          <p className="text-[13px] text-white/50 mt-3" data-obs-found>
            {o.found}:{" "}
            {found.map((tool, i) => (
              <React.Fragment key={tool}>
                {i > 0 && " · "}
                <span className="text-white/75">{t.tools[tool]}</span>{" "}
                <span className={obs.sources[tool].upToDate === false ? "text-amber-200" : "text-white/40"}>
                  ({obs.sources[tool].upToDate === false ? o.outdated : o.upToDate})
                </span>
              </React.Fragment>
            ))}
          </p>
        )}
      </div>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    obs.connect(prefs);
  };

  return (
    <form onSubmit={submit} className={compact ? "space-y-3" : "rounded-lg border border-line bg-surface/80 p-4 md:p-5 space-y-3"} data-obs="form">
      {!compact && (
        <>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white tracking-tight">
            <MonitorPlay size={18} className="text-accent-soft" aria-hidden="true" />{o.heading}
          </h2>
          <p className="text-sm text-white/55 max-w-3xl">{o.lead}</p>
        </>
      )}
      <ol className="list-decimal pl-5 space-y-1 text-[13px] text-white/55">
        {o.howto.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-white/50">
          {o.port}
          <input type="number" min={1} max={65535} value={prefs.port} className={`${field} w-24`} data-obs-port
            onChange={(e) => setPrefs((p) => ({ ...p, port: Number(e.target.value) || "" }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-white/50 min-w-0 flex-1 basis-48">
          {o.password}
          <input type="password" autoComplete="off" value={prefs.password} className={field} data-obs-password
            onChange={(e) => setPrefs((p) => ({ ...p, password: e.target.value }))} />
        </label>
        <Button type="submit" loading={busy} loadingText={o.connecting} icon={MonitorPlay}>{o.connect}</Button>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-white/55 cursor-pointer w-fit">
        <input type="checkbox" checked={prefs.remember} onChange={(e) => setPrefs((p) => ({ ...p, remember: e.target.checked }))}
          className="w-3.5 h-3.5 accent-violet-500" />
        {o.remember}
      </label>
      {obs.phase === "error" && (
        <p className="rounded-md bg-red-500/10 border border-red-500/25 px-3 py-2 text-[13px] text-red-200" role="alert" data-obs-error={obs.error}>
          {o.errors[obs.error] || o.errors.failed}
        </p>
      )}
    </form>
  );
}

/**
 * Knopf „In OBS anlegen / aktualisieren“ für ein Werkzeug. Nur sichtbar, wenn OBS verbunden ist.
 * @param {() => Promise<{ url: string, wtSettings?: object }>} props.getTarget  Link (und beim Win Tracker die Einstellungen)
 */
export function ObsButton({ t, obs, tool, getTarget, size = "sm", variant = "secondary" }) {
  const o = t.obs;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  if (obs.phase !== "connected") return null;
  const src = obs.sources[tool];
  const current = src?.exists && src.upToDate === true;
  const label = !src?.exists ? o.create : src.upToDate === false ? o.update : o.inObs;

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const target = await getTarget();
      const r = await obs.ensure({ tool, url: target.url, wtSettings: target.wtSettings });
      setNote(r.ok
        ? { ok: true, text: r.action === "created" ? o.result.created(obs.scene) : r.action === "added" ? o.result.added(obs.scene) : o.result.updated }
        : { ok: false, text: o.errors[r.error] || o.errors.failed });
    } catch {
      setNote({ ok: false, text: o.errors.failed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <Button size={size} variant={variant} icon={current ? Check : MonitorPlay} loading={busy} loadingText={o.working}
        onClick={run} data-obs-button={tool}>
        {label}
      </Button>
      {note && <span className={`text-[12px] ${note.ok ? "text-green-300" : "text-red-200"}`} role="status">{note.text}</span>}
    </span>
  );
}
