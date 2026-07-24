// WinChallengeControl.jsx — Moderator-Ansicht für ein WinChallenge-Overlay
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import SEO from "../../components/SEO";
import { CHAT_COMMAND_DOCS } from "./chatCommands";
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  EyeOff,
  Pin,
  Trash2,
  Plus,
  Check,
  MessageSquare,
  ShieldAlert,
  Hash,
  Trophy,
} from "lucide-react";

function msToClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** "HH:MM:SS" oder "MM:SS" → Millisekunden (null bei ungültigem Format) */
function parseClockInput(str) {
  const m = String(str || "")
    .trim()
    .match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const hasHours = m[3] != null;
  const h = hasHours ? parseInt(m[1], 10) : 0;
  const min = hasHours ? parseInt(m[2], 10) : parseInt(m[1], 10);
  const s = hasHours ? parseInt(m[3], 10) : parseInt(m[2], 10);
  if (hasHours && min > 59) return null;
  if (s > 59) return null;
  return (h * 3600 + min * 60 + s) * 1000;
}

export default function WinChallengeControl() {
  const { controlKey } = useParams();
  const [doc, setDoc] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [localTitle, setLocalTitle] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualTimeError, setManualTimeError] = useState(false);

  // Initial laden + Polling für externe Änderungen
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/winchallenge/control/${controlKey}`);
        if (!alive) return;
        const data = await res.json();
        setDoc(data);
        if (data?.title !== undefined) {
          setLocalTitle(data.title || "");
        }
      } catch (e) {
        console.error(e);
      }
    };

    load();
    const iv = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [controlKey]);

  // Lokale Uhr für Timer-Anzeige
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, []);

  if (!doc) {
    return (
      <div className="min-h-full text-white flex items-center justify-center">
        <div className="text-white/40 animate-pulse">Lade Moderator-Ansicht…</div>
      </div>
    );
  }

  const perms = doc.controlPermissions || {};
  const timer = doc.timer || {};
  const running = !!timer.running;
  const timerVisible = timer.visible !== false;
  const elapsed = running ? now - (timer.startedAt || 0) : timer.elapsedMs || 0;

  const chatCommands = doc.chatCommands || {};
  const chatChannels =
    Array.isArray(chatCommands.channels) && chatCommands.channels.length
      ? chatCommands.channels
      : chatCommands.channel
        ? [chatCommands.channel]
        : [];

  // Hilfsfunktion: Patch an Backend schicken und Doc aus Response setzen
  const sendPatch = async (patch) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/winchallenge/control/${controlKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        console.error("Control PUT failed:", res.status, data);
        return;
      }

      if (data) {
        setDoc(data);
        if (data.title !== undefined) {
          setLocalTitle(data.title || "");
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  /* ───────────── Timer Actions ───────────── */

  const startTimer = () => perms.allowModsTimer && sendPatch({ action: "timerStart" });
  const pauseTimer = () => perms.allowModsTimer && sendPatch({ action: "timerStop" });
  const resetTimer = () => perms.allowModsTimer && sendPatch({ action: "timerReset" });
  const toggleTimerVisible = () =>
    perms.allowModsTimer && sendPatch({ action: "timerToggleVisible", visible: !timerVisible });
  const adjustTimer = (deltaMs) => perms.allowModsTimer && sendPatch({ action: "timerAdjust", deltaMs });

  const applyManualTime = () => {
    if (!perms.allowModsTimer) return;
    const ms = parseClockInput(manualTime);
    if (ms == null) {
      setManualTimeError(true);
      return;
    }
    setManualTimeError(false);
    sendPatch({ action: "timerSet", elapsedMs: ms });
    setManualTime("");
  };

  /* ───────────── Titel Actions ───────────── */

  const commitTitle = () => {
    if (!perms.allowModsTitle) return;
    sendPatch({ action: "setTitle", title: localTitle || "" });
  };

  /* ───────────── Challenge Actions ───────────── */

  const currentItems = Array.isArray(doc.items) ? doc.items : [];

  const updateItems = (builder) => {
    if (!perms.allowModsChallenges) return;
    const nextItems = builder(currentItems);
    sendPatch({ action: "setItems", items: nextItems });
  };

  const addChallenge = () => {
    updateItems((items) => [
      ...items,
      {
        id: nanoid(8),
        name: "",
        useWins: false,
        target: 1,
        progress: 0,
        done: false,
        pinned: false,
      },
    ]);
  };

  const removeChallenge = (id) => {
    updateItems((items) => items.filter((it) => it.id !== id));
  };

  const patchChallenge = (id, patch) => {
    updateItems((items) =>
      items.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  };

  const adjustChallengeProgress = (id, delta) => {
    updateItems((items) =>
      items.map((it) => {
        if (it.id !== id) return it;
        const next = Math.max(0, (it.progress || 0) + delta);
        return { ...it, progress: next };
      })
    );
  };

  const setChallengeTarget = (id, value) => {
    const n = Math.max(1, parseInt(value || "1", 10));
    patchChallenge(id, { target: n });
  };

  const toggleChallengeDone = (id, checked) => {
    patchChallenge(id, {
      done: checked,
      progress: checked ? 1 : 0,
    });
  };

  const hasAnyPerm =
    perms.allowModsTimer || perms.allowModsTitle || perms.allowModsChallenges;

  // Chat-Befehle, die mit den aktuellen Berechtigungen tatsächlich funktionieren
  const visibleCommands = CHAT_COMMAND_DOCS.filter(
    (c) =>
      (c.perm === "timer" && perms.allowModsTimer) ||
      (c.perm === "challenges" && perms.allowModsChallenges)
  );

  /* ───────────── Render ───────────── */

  return (
    <div className="min-h-full text-white flex justify-center p-4 md:p-8">
      <SEO title="Control" />
      <div className="w-full max-w-2xl space-y-4">
        {/* Header */}
        <div className="bg-[#121215] rounded-sm border border-white/5 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={18} className="text-yellow-500 shrink-0" />
            <div>
              <h1 className="text-base font-black tracking-tight leading-none">
                WinChallenge — Moderation
              </h1>
              <p className="text-[11px] text-white/40 mt-0.5">
                {doc.hostName && doc.hostName !== "Unknown"
                  ? `Overlay von ${doc.hostName}`
                  : "Moderator-Ansicht"}
              </p>
            </div>
          </div>
          <span className={`text-xs ${saving ? "text-amber-400" : "text-white/40"}`}>
            {saving ? "Speichern…" : "Verbunden"}
          </span>
        </div>

        {/* Timer */}
        {perms.allowModsTimer && (
          <div className="bg-black/20 rounded-sm border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${running ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-sm font-bold uppercase tracking-wider">Timer</span>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${running ? "text-green-400" : "text-white/30"}`}>
                {running ? "Läuft" : "Pausiert"}
              </span>
            </div>

            {/* Sichtbarkeit — deutlich sichtbar */}
            <button
              onClick={toggleTimerVisible}
              className={`w-full mb-4 py-2.5 rounded-sm text-xs font-bold transition-colors flex items-center justify-center gap-2 border ${
                timerVisible
                  ? "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
                  : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/40"
              }`}
            >
              {timerVisible ? <Eye size={15} /> : <EyeOff size={15} />}
              {timerVisible ? "Timer im Overlay sichtbar" : "Timer im Overlay ausgeblendet"}
            </button>

            <div className="bg-black/40 rounded-sm p-4 text-center border border-white/5 mb-4">
              <span className="font-mono text-4xl font-black tracking-widest tabular-nums">
                {msToClock(elapsed)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {!running ? (
                <button
                  onClick={startTimer}
                  className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Play size={18} fill="currentColor" /> START
                </button>
              ) : (
                <button
                  onClick={pauseTimer}
                  className="bg-amber-500 hover:bg-amber-400 text-black py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Pause size={18} fill="currentColor" /> PAUSE
                </button>
              )}
              <button
                onClick={resetTimer}
                className="bg-white/10 hover:bg-white/20 text-white py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2 border border-white/5"
              >
                <RotateCcw size={18} /> RESET
              </button>
            </div>

            <div className="grid grid-cols-6 gap-2 pt-4 border-t border-white/5">
              <button onClick={() => adjustTimer(3600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">+1h</button>
              <button onClick={() => adjustTimer(600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">+10m</button>
              <button onClick={() => adjustTimer(60000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">+1m</button>
              <button onClick={() => adjustTimer(-60000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">-1m</button>
              <button onClick={() => adjustTimer(-600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">-10m</button>
              <button onClick={() => adjustTimer(-3600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">-1h</button>
            </div>

            {/* Manuelle Zeit-Eingabe */}
            <div className="flex gap-2 mt-4">
              <input
                type="text"
                value={manualTime}
                onChange={(e) => {
                  setManualTime(e.target.value);
                  setManualTimeError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyManualTime();
                  }
                }}
                placeholder="01:30:00"
                className={`flex-1 bg-black/40 border rounded-sm px-3 py-2 text-sm font-mono text-center focus:outline-none transition-colors ${
                  manualTimeError ? "border-red-500/60" : "border-white/10 focus:border-violet-500"
                }`}
              />
              <button
                onClick={applyManualTime}
                disabled={!manualTime.trim()}
                className="px-4 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-sm text-white/70 text-xs font-bold transition-colors border border-white/5"
              >
                Zeit setzen
              </button>
            </div>
            {manualTimeError && (
              <p className="text-[11px] text-red-400 mt-1.5">Format: HH:MM:SS oder MM:SS</p>
            )}
          </div>
        )}

        {/* Titel */}
        {perms.allowModsTitle && (
          <div className="bg-black/20 rounded-sm border border-white/5 p-5">
            <span className="block text-sm font-bold uppercase tracking-wider mb-3">
              Titel bearbeiten
            </span>
            <input
              className="w-full bg-black/40 border border-white/10 rounded-sm px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none transition-colors"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                  e.target.blur();
                }
              }}
              placeholder="Neuer Titel"
            />
            <p className="text-xs text-white/40 mt-2">
              Änderung wird beim Verlassen des Feldes oder mit Enter gespeichert.
            </p>
          </div>
        )}

        {/* Challenges */}
        {perms.allowModsChallenges && (
          <div className="bg-black/20 rounded-sm border border-white/5 p-5">
            <span className="block text-sm font-bold uppercase tracking-wider mb-3">
              Challenges bearbeiten
            </span>

            {currentItems.length === 0 && (
              <p className="text-xs text-white/40 mb-2">
                Es sind aktuell keine Challenges eingetragen.
              </p>
            )}

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {currentItems.map((it) => {
                const done = it.useWins
                  ? (it.progress || 0) >= (it.target || 0)
                  : !!it.done;

                return (
                  <div
                    key={it.id}
                    className={`bg-black/30 rounded-sm p-3 text-sm flex flex-col gap-2 border transition-colors ${
                      done ? "border-green-500/30" : "border-white/5"
                    }`}
                  >
                    {/* Kopfzeile: Name + Pin + Löschen */}
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 bg-black/40 border border-white/10 px-3 py-1.5 rounded-sm text-xs focus:border-violet-500 focus:outline-none transition-colors"
                        defaultValue={it.name}
                        onBlur={(e) =>
                          patchChallenge(it.id, { name: e.target.value })
                        }
                        placeholder="Challenge-Name"
                      />
                      <button
                        onClick={() => patchChallenge(it.id, { pinned: !it.pinned })}
                        className={`p-2 rounded-sm transition-colors ${
                          it.pinned
                            ? "text-violet-400 bg-violet-500/10"
                            : "text-white/20 hover:text-white hover:bg-white/5"
                        }`}
                        title={it.pinned ? "Lösen" : "Anpinnen"}
                      >
                        <Pin size={15} />
                      </button>
                      <button
                        onClick={() => removeChallenge(it.id)}
                        className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                        title="Challenge löschen"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Zweite Zeile: Wins / Done / Fortschritt */}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="accent-violet-500"
                          checked={!!it.useWins}
                          onChange={(e) =>
                            patchChallenge(it.id, {
                              useWins: e.target.checked,
                            })
                          }
                        />
                        Zähler
                      </label>

                      {it.useWins ? (
                        <>
                          <div className="flex items-center bg-black/40 rounded-sm border border-white/10 px-2 py-1">
                            <span className="text-[10px] uppercase text-white/30 font-bold mr-2">
                              Ziel
                            </span>
                            <input
                              type="number"
                              min={1}
                              className="w-10 bg-transparent text-right text-xs font-mono focus:outline-none"
                              defaultValue={it.target || 1}
                              onBlur={(e) =>
                                setChallengeTarget(it.id, e.target.value)
                              }
                            />
                          </div>

                          <div className="flex items-center bg-white/5 rounded-sm border border-white/5 overflow-hidden ml-auto">
                            <button
                              onClick={() => adjustChallengeProgress(it.id, -1)}
                              className="px-3 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors font-mono"
                              title="Win -1"
                            >
                              −
                            </button>
                            <span className="w-14 text-center text-xs font-mono font-bold">
                              {it.progress || 0} / {it.target || 0}
                            </span>
                            <button
                              onClick={() => adjustChallengeProgress(it.id, 1)}
                              className="px-3 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors font-mono"
                              title="Win +1"
                            >
                              +
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => toggleChallengeDone(it.id, !done)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border transition-colors text-xs font-bold ml-auto ${
                            done
                              ? "bg-green-500/20 border-green-500/30 text-green-400"
                              : "bg-white/5 border-white/5 text-white/40 hover:text-white"
                          }`}
                        >
                          {done ? (
                            <Check size={13} />
                          ) : (
                            <span className="w-3 h-3 rounded-sm border border-white/30" />
                          )}
                          {done ? "Erledigt" : "Offen"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={addChallenge}
              className="w-full mt-3 py-2.5 rounded-sm border border-dashed border-white/10 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors text-xs font-bold flex justify-center items-center gap-2"
            >
              <Plus size={15} /> Challenge hinzufügen
            </button>
          </div>
        )}

        {/* Chat-Befehle — Referenz für Mods */}
        {chatCommands.enabled && visibleCommands.length > 0 && (
          <div className="bg-black/20 rounded-sm border border-white/5 p-5">
            <span className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare size={15} className="text-cyan-400" /> Chat-Befehle
            </span>
            {chatChannels.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 mb-4">
                {chatChannels.map((c) => (
                  <span
                    key={c}
                    className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-sm px-2 py-1 text-xs font-mono text-white/70"
                  >
                    <Hash size={12} className="text-white/30" />
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {visibleCommands.map((c) => (
                <div
                  key={c.cmd}
                  className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-1.5 border-b border-white/5 last:border-b-0"
                >
                  <code className="text-xs font-mono text-violet-300 sm:w-52 shrink-0">
                    {c.cmd}
                  </code>
                  <span className="text-xs text-white/60">{c.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-white/40 mt-4">
              Die Namenssuche ist unscharf: „!pin minecraft“ findet „Minecraft
              Enderdragon besiegen“. Die Befehle funktionieren in allen oben
              gelisteten Kanälen.
            </p>
          </div>
        )}

        {/* Hinweis, falls keine Rechte */}
        {!hasAnyPerm && (
          <div className="bg-black/20 rounded-sm border border-white/5 p-5 flex items-start gap-3">
            <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-white/50">
              Für diesen Control-Link wurden aktuell keine Bearbeitungsrechte
              freigeschaltet. Der Streamer kann sie im Editor unter
              „Einstellungen“ aktivieren.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
