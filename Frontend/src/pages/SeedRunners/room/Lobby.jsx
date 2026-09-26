// Lobby.jsx — vor der Runde: Spielerliste und Einladung, der Rundenplan (Host) mit Start, daneben die Level-Auswahl (Favoriten,
// Community-Level, beste Zufallslevel). Ein gewähltes Level landet in der nächsten freien Runde; sind alle belegt, kommt eine
// Runde dazu (bis 5).
import React, { useEffect, useRef, useState } from "react";
import { Crown, WifiOff, Play, Copy, Check } from "lucide-react";
import SettingsForm from "./SettingsForm.jsx";
import SeriesForm from "./SeriesForm.jsx";
import { entryKey } from "../ui/levelRef.js";
import LevelPicker from "./LevelPicker.jsx";
import { Panel, Spinner } from "../ui/kit.jsx";
import { verdeckt } from "./raumCode.js";
import { useCodeSichtbar } from "./useCodeSichtbar.js";

const MAX_ROUNDS = 5;

/** Wohin kommt das nächste gewählte Level? Index in der Playlist; `grow`: dafür kommt eine Runde dazu; -1: alles belegt */
function nextSlot(settings) {
  const free = settings.playlist.findIndex((e) => e.kind === "random");
  if (free >= 0) return { index: free, grow: false };
  if (settings.rounds < MAX_ROUNDS) return { index: settings.rounds, grow: true };
  return { index: -1, grow: false };
}

export default function Lobby({ state, meId, isHost, actions, code }) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [pickNote, setPickNote] = useState("");
  const [labels, setLabels] = useState({});
  const settings = state.settings;

  // Eingaben im Textfeld (Seed) nicht bei jedem Zeichen an den Server schicken: kurz sammeln.
  const pending = useRef(null);
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);

  const change = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => actions.setSettings(next), "seed" in patch ? 350 : 0);
  };
  useEffect(() => () => clearTimeout(pending.current), []);

  const slot = nextSlot(draft);
  const pickLevel = (entry, label) => {
    const key = entryKey(entry);
    setLabels((m) => ({ ...m, [key]: label }));
    const already = draft.playlist.findIndex((e) => entryKey(e) === key);
    if (already >= 0) {
      setPickNote(`„${label.title}“ ist schon Runde ${already + 1}.`);
      return;
    }
    if (slot.index < 0) {
      setPickNote(`Alle ${MAX_ROUNDS} Runden sind belegt — setze zuerst eine Runde auf „Zufällig“.`);
      return;
    }
    const playlist = slot.grow ? [...draft.playlist, entry] : draft.playlist.map((e, i) => (i === slot.index ? entry : e));
    change(slot.grow ? { rounds: draft.rounds + 1, playlist } : { playlist });
    setPickNote(`„${label.title}“ ist jetzt Runde ${slot.index + 1}.`);
  };
  useEffect(() => {
    if (!pickNote) return undefined;
    const t = setTimeout(() => setPickNote(""), 3500);
    return () => clearTimeout(t);
  }, [pickNote]);

  const link = `${window.location.origin}/seed-runners/${code}`;
  // Streamer-Schutz: angezeigt wird der Link verdeckt (wie der Code oben), kopiert wird der echte
  const [codeOffen] = useCodeSichtbar();
  const linkAnzeige = `${window.location.host}/seed-runners/${verdeckt(code, codeOffen)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* Zwischenablage gesperrt */ }
  };

  const start = async () => {
    setStarting(true);
    setError("");
    // Erst die noch ausstehende Eingabe (Seed) übernehmen, dann starten
    clearTimeout(pending.current);
    await actions.setSettings(draft);
    const res = await actions.start("settings");
    setStarting(false);
    if (!res.ok) setError(res.error || "Start nicht möglich.");
  };

  const single = draft.rounds === 1 && draft.playlist[0]?.kind === "random";

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
      <Panel title="Spieler" actions={<span className="sr-num sr-faint text-sm">{state.players.length} / 8</span>} bodyClassName="">
        <ul className="sr-rows">
          {state.players.map((p) => (
            <li key={p.id} className="px-4 py-2.5 flex items-center gap-3">
              <span className="w-3 h-3 rounded-[2px] shrink-0" style={{ background: p.color }} />
              <p className="truncate flex-1 sr-ink">
                {p.name}
                {p.id === meId && <span className="sr-faint"> (du)</span>}
              </p>
              {p.isHost && <Crown size={14} className="sr-accent-text shrink-0" aria-label="Host" />}
              {!p.connected && <WifiOff size={14} className="sr-warn shrink-0" aria-label="Verbindung getrennt" />}
            </li>
          ))}
        </ul>
        <div className="px-4 py-3 sr-divider">
          <p className="sr-label mb-1.5">Einladungslink</p>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 sr-sunk px-2.5 py-1.5 text-xs sr-dim truncate">{linkAnzeige}</code>
            <button type="button" onClick={copy} className="sr-btn sr-btn-sm sr-btn-ghost shrink-0">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2 items-start min-w-0">
        <Panel title="Rundenplan" bodyClassName="">
          <div className="p-4 space-y-5">
            <SeriesForm settings={draft} onChange={change} labels={labels} disabled={!isHost} />
            {single && (
              <div className="sr-divider pt-4">
                <SettingsForm settings={draft} onChange={change} disabled={!isHost} />
              </div>
            )}
          </div>
          <div className="px-4 py-3 sr-divider flex flex-wrap items-center justify-between gap-3">
            {isHost ? (
              <>
                <p className="text-xs sr-faint max-w-[300px]">Alle bauen das Level selbst aus dem Seed; danach folgt ein gemeinsamer Countdown.</p>
                <button type="button" onClick={start} disabled={starting} className="sr-btn sr-btn-lg">
                  {starting ? <Spinner size={16} className="!text-current" /> : <Play size={17} fill="currentColor" />}
                  {draft.rounds > 1 ? "Serie starten" : "Runde starten"}
                </button>
              </>
            ) : (
              <p className="text-sm sr-dim flex items-center gap-2">
                <Spinner size={14} />
                Warte darauf, dass der Host startet …
              </p>
            )}
          </div>
          {error && <p className="px-4 pb-3 text-sm sr-bad">{error}</p>}
        </Panel>

        {isHost && (
          <Panel title="Level-Auswahl" bodyClassName="px-4 pb-3" actions={pickNote ? <span className="text-xs sr-accent-text truncate max-w-[220px]">{pickNote}</span> : null}>
            <LevelPicker onPick={pickLevel} pickText={slot.index < 0 ? "Voll" : `Runde ${slot.index + 1}`} disabled={slot.index < 0} />
          </Panel>
        )}
      </div>
    </div>
  );
}
