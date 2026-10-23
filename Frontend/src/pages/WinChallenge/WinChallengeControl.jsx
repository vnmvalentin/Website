// WinChallengeControl.jsx — Moderator-Ansicht für ein WinChallenge-Overlay
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import SEO from "../../components/SEO";
import { chatCommandDocs } from "./chatCommands";
import { msToClock } from "./overlayUtils";
import { useWcShell } from "./ui/shellContext";
import GameCoverPicker from "./ui/GameCoverPicker";
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  EyeOff,
  Pin,
  Trash2,
  Plus,
  Minus,
  Check,
  MessageSquare,
  ShieldAlert,
  Hash,
  Clock,
  Type,
  ListChecks,
} from "lucide-react";

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

// Schrittweiten für „Zeit anpassen“ — dieselbe Bedienung wie im Editor (WinChallenge.jsx)
const TIMER_STEPS_MS = [60000, 600000, 3600000];

const INPUT = "bg-black/40 border border-white/10 rounded-sm text-white focus:border-violet-500 focus:outline-none transition-colors";
const HEADING = "text-sm font-bold text-white flex items-center gap-2 mb-4";

export default function WinChallengeControl() {
  const { controlKey } = useParams();
  const { lang, t, changeLang, langExplicit } = useWcShell();
  const [doc, setDoc] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [localTitle, setLocalTitle] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualTimeError, setManualTimeError] = useState(false);
  const [timerStep, setTimerStep] = useState(TIMER_STEPS_MS[0]);

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

  // Hat der Mod selbst keine Sprache gewählt, gilt die des Streamers — einmal beim ersten Laden.
  const langAdoptedRef = useRef(false);
  const docLanguage = doc?.language;
  useEffect(() => {
    if (!docLanguage || langAdoptedRef.current) return;
    langAdoptedRef.current = true;
    if (!langExplicit && docLanguage !== lang) changeLang(docLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docLanguage]);

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-white/40">
        <SEO title="Control" noindex />
        {t.modLoading}
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
  const visibleCommands = chatCommandDocs(lang).filter(
    (c) =>
      (c.perm === "timer" && perms.allowModsTimer) ||
      (c.perm === "challenges" && perms.allowModsChallenges)
  );

  const hostKnown = doc.hostName && doc.hostName !== "Unknown";

  /* ───────────── Render ───────────── */

  return (
    <div className="h-full overflow-y-auto custom-scrollbar text-white">
      <SEO title="Control" noindex />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 md:py-10">

        {/* Kopf: wessen Overlay, und ob gerade gespeichert wird */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight truncate">{t.modTitle}</h1>
            <p className="text-sm text-white/50 mt-1 truncate">
              {hostKnown ? t.modOverlayOf(doc.hostName) : t.modView}
            </p>
          </div>
          <span className={`text-xs font-bold shrink-0 ${saving ? "text-amber-300" : "text-white/35"}`}>
            {saving ? t.saving : t.connected}
          </span>
        </div>

        {/* Wie der Editor: eine Fläche, Abschnitte nur durch Linien getrennt */}
        <div className="bg-[#0d0d14] border border-white/10 rounded-md divide-y divide-white/10">

          {/* Timer */}
          {perms.allowModsTimer && (
            <section className="p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <Clock size={16} className="text-white/40" />
                  <h2 className="text-sm font-bold text-white">{t.timer}</h2>
                  <span className={`text-xs font-bold ${running ? "text-green-400" : "text-white/35"}`}>
                    {running ? t.running : t.paused}
                  </span>
                </div>
                <button
                  onClick={toggleTimerVisible}
                  className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${
                    timerVisible ? "text-white/50 hover:text-white" : "text-amber-300 hover:text-amber-200"
                  }`}
                >
                  {timerVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                  {timerVisible ? t.timerVisible : t.timerHidden}
                </button>
              </div>

              <div className="text-center text-5xl font-semibold tabular-nums tracking-wide py-4">
                {msToClock(elapsed)}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {!running ? (
                  <button
                    onClick={startTimer}
                    className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Play size={16} fill="currentColor" /> {t.start}
                  </button>
                ) : (
                  <button
                    onClick={pauseTimer}
                    className="bg-amber-500 hover:bg-amber-400 text-black py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Pause size={16} fill="currentColor" /> {t.pause}
                  </button>
                )}
                <button
                  onClick={resetTimer}
                  className="border border-white/15 hover:bg-white/5 text-white/80 hover:text-white py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={15} /> {t.reset}
                </button>
              </div>

              {/* Zeit anpassen — Schrittweite wählen, dann ± */}
              <div className="grid grid-cols-[auto_1fr_auto] gap-2 mt-3">
                <button
                  onClick={() => adjustTimer(-timerStep)}
                  title={t.subtractTime}
                  aria-label={t.subtractTime}
                  className="px-3 border border-white/10 hover:bg-white/5 rounded-sm text-white/60 hover:text-white transition-colors flex items-center"
                >
                  <Minus size={16} />
                </button>
                <div className="flex border border-white/10 rounded-sm overflow-hidden" role="group" aria-label={t.stepAria}>
                  {TIMER_STEPS_MS.map((ms, i) => (
                    <button
                      key={ms}
                      onClick={() => setTimerStep(ms)}
                      aria-pressed={timerStep === ms}
                      className={`flex-1 py-2 text-xs font-bold transition-colors ${
                        timerStep === ms ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                      }`}
                    >
                      {t.steps[i]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => adjustTimer(timerStep)}
                  title={t.addTime}
                  aria-label={t.addTime}
                  className="px-3 border border-white/10 hover:bg-white/5 rounded-sm text-white/60 hover:text-white transition-colors flex items-center"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Manuelle Zeit-Eingabe */}
              <div className="flex gap-2 mt-3">
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
                  className={`${INPUT} flex-1 min-w-0 px-3 py-2 text-sm text-center tabular-nums ${
                    manualTimeError ? "!border-red-500/60" : ""
                  }`}
                />
                <button
                  onClick={applyManualTime}
                  disabled={!manualTime.trim()}
                  className="px-4 border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed rounded-sm text-white/80 text-xs font-bold transition-colors"
                >
                  {t.setTime}
                </button>
              </div>
              {manualTimeError && (
                <p className="text-[11px] text-red-400 mt-1.5">{t.timeFormat}</p>
              )}
            </section>
          )}

          {/* Titel */}
          {perms.allowModsTitle && (
            <section className="p-5">
              <h2 className={HEADING}><Type size={16} className="text-white/40" /> {t.editTitle}</h2>
              <input
                className={`${INPUT} w-full px-4 py-2.5 text-sm`}
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
                placeholder={t.newTitle}
              />
              <p className="text-xs text-white/40 mt-2">{t.titleSaveHint}</p>
            </section>
          )}

          {/* Challenges */}
          {perms.allowModsChallenges && (
            <section className="p-5">
              <h2 className={HEADING}><ListChecks size={16} className="text-white/40" /> {t.tabChallenges}</h2>

              {currentItems.length === 0 && (
                <p className="text-xs text-white/40 mb-3">{t.noChallenges}</p>
              )}

              {currentItems.length > 0 && (
                <div className="border border-white/10 bg-[#171722] rounded-sm divide-y divide-white/10">
                  {currentItems.map((it) => {
                    const done = it.useWins
                      ? (it.progress || 0) >= (it.target || 0)
                      : !!it.done;

                    return (
                      <div
                        key={it.id}
                        className={`border-l-2 px-3 py-3 flex flex-col gap-2.5 ${
                          done ? "border-green-500/60" : "border-transparent"
                        }`}
                      >
                        {/* Kopfzeile: Name + Pin + Löschen */}
                        <div className="flex items-center gap-1.5">
                          <GameCoverPicker
                            icon={it.icon}
                            onChange={(icon) => patchChallenge(it.id, { icon })}
                            t={t}
                            controlKey={controlKey}
                          />
                          <input
                            className="flex-1 min-w-0 bg-transparent text-base font-bold placeholder-white/20 focus:outline-none text-white px-1"
                            defaultValue={it.name}
                            onBlur={(e) =>
                              patchChallenge(it.id, { name: e.target.value })
                            }
                            placeholder={t.modNamePlaceholder}
                          />
                          <button
                            onClick={() => patchChallenge(it.id, { pinned: !it.pinned })}
                            className={`p-2 rounded-sm transition-colors ${
                              it.pinned
                                ? "text-violet-400 bg-violet-500/10"
                                : "text-white/20 hover:text-white hover:bg-white/5"
                            }`}
                            title={it.pinned ? t.unpin : t.pin}
                          >
                            <Pin size={15} />
                          </button>
                          <button
                            onClick={() => removeChallenge(it.id)}
                            className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                            title={t.removeChallenge}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* Zweite Zeile: Zähler / Ziel / Fortschritt */}
                        <div className="flex flex-wrap items-center gap-3 pl-1">
                          <label className="flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors cursor-pointer select-none">
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
                            {t.counter}
                          </label>

                          {it.useWins ? (
                            <>
                              <div className="flex items-center border border-white/10 rounded-sm px-2 py-1">
                                <span className="text-[10px] uppercase text-white/30 font-bold mr-2">
                                  {t.target}
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  className="w-10 bg-transparent text-right text-sm tabular-nums focus:outline-none text-white"
                                  defaultValue={it.target || 1}
                                  onBlur={(e) =>
                                    setChallengeTarget(it.id, e.target.value)
                                  }
                                />
                              </div>

                              <div className="flex items-center border border-white/10 rounded-sm overflow-hidden ml-auto">
                                <button
                                  onClick={() => adjustChallengeProgress(it.id, -1)}
                                  className="px-3.5 py-1.5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                  title="−1"
                                >
                                  −
                                </button>
                                <span className="w-16 text-center text-sm font-bold tabular-nums">
                                  {it.progress || 0} / {it.target || 0}
                                </span>
                                <button
                                  onClick={() => adjustChallengeProgress(it.id, 1)}
                                  className="px-3.5 py-1.5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                  title="+1"
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
                                  ? "bg-green-500/15 border-green-500/30 text-green-400"
                                  : "border-white/10 text-white/40 hover:text-white"
                              }`}
                            >
                              {done ? (
                                <Check size={14} />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-sm border border-white/30" />
                              )}
                              {done ? t.done : t.open}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={addChallenge}
                className="w-full mt-3 py-3 bg-violet-600 hover:bg-violet-500 rounded-sm text-white text-sm font-bold transition-colors flex justify-center items-center gap-2"
              >
                <Plus size={16} /> {t.modAddChallenge}
              </button>
            </section>
          )}

          {/* Chat-Befehle — Referenz für Mods */}
          {chatCommands.enabled && visibleCommands.length > 0 && (
            <section className="p-5">
              <h2 className={HEADING}><MessageSquare size={16} className="text-white/40" /> {t.chatCommands}</h2>
              {chatChannels.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {chatChannels.map((c) => (
                    <span
                      key={c}
                      className="flex items-center gap-1 border border-white/10 rounded-sm px-2 py-1 text-xs text-white/70"
                    >
                      <Hash size={12} className="text-white/30" />
                      {c}
                    </span>
                  ))}
                </div>
              )}
              <div>
                {visibleCommands.map((c) => (
                  <div
                    key={c.cmd}
                    className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-white/5 last:border-b-0"
                  >
                    <span className="text-xs font-semibold text-violet-300 sm:w-52 shrink-0">
                      {c.cmd}
                    </span>
                    <span className="text-xs text-white/60">{c.desc}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/40 mt-4">{t.modFuzzy}</p>
            </section>
          )}

          {/* Hinweis, falls keine Rechte */}
          {!hasAnyPerm && (
            <section className="p-5 flex items-start gap-3">
              <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-white/60">{t.noPerms}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
