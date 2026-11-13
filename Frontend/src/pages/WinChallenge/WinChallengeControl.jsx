// WinChallengeControl.jsx — Moderator-Ansicht für ein WinChallenge-Overlay.
// Aufbau wie der Editor (WinChallenge.jsx): links Timer und Titel, rechts die Challenges —
// mit denselben Bausteinen (ui/TimerPanel.jsx, ui/StreakBoxes.jsx). Was davon zu sehen ist,
// hängt an den Rechten, die der Streamer freigegeben hat.
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import SEO from "../../components/SEO";
import { chatCommandDocs } from "./chatCommands";
import {
  isItemDone,
  itemMode,
  itemModePatch,
  showsStreakPips,
  streakClickProgress,
  streakLengthPatch,
  STREAK_MIN,
  STREAK_MAX,
} from "./overlayUtils";
import { useWcShell } from "./ui/shellContext";
import GameCoverPicker from "./ui/GameCoverPicker";
import TimerPanel from "./ui/TimerPanel";
import StreakBoxes from "./ui/StreakBoxes";
import { PANEL, LABEL, INPUT, BTN_PRIMARY } from "./ui/editorStyles";
import {
  RotateCcw,
  Pin,
  Trash2,
  Plus,
  Check,
  MessageSquare,
  ShieldAlert,
  Hash,
  Type,
  ListChecks,
  Flame,
} from "lucide-react";

// Art einer Challenge: abhaken, Zähler oder Serie (B2B, B3B …) — wie im Editor
const ITEM_MODES = [
  { mode: "check", Icon: Check, stroke: 3, labelKey: "modeCheck" },
  { mode: "counter", Icon: Hash, stroke: 2.5, labelKey: "modeCounter" },
  { mode: "streak", Icon: Flame, stroke: 2.5, labelKey: "modeStreak", titleKey: "modeStreakHint" },
];

export default function WinChallengeControl() {
  const { controlKey } = useParams();
  const { lang, t, changeLang, langExplicit } = useWcShell();
  const [doc, setDoc] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [localTitle, setLocalTitle] = useState("");

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
  const timerVisible = timer.visible !== false;

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

  // Bedienung des Timers für ui/TimerPanel.jsx — jede Aktion geht an den Server, der rechnet.
  // Angezeigt wird das Feld nur mit der Berechtigung „Timer steuern“.
  const timerActions = {
    start: () => sendPatch({ action: "timerStart" }),
    pause: () => sendPatch({ action: "timerStop" }),
    reset: () => sendPatch({ action: "timerReset" }),
    adjust: (deltaMs) => sendPatch({ action: "timerAdjust", deltaMs }),
    // Name "elapsedMs" historisch — gemeint ist die angezeigte Zeit
    setDisplay: (ms) => sendPatch({ action: "timerSet", elapsedMs: ms }),
    setMode: (mode) => sendPatch({ action: "timerMode", mode }),
    setDuration: (ms) => sendPatch({ action: "timerDuration", durationMs: ms }),
    toggleVisible: () => sendPatch({ action: "timerToggleVisible", visible: !timerVisible }),
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
  const showCommands = !!chatCommands.enabled && visibleCommands.length > 0;

  const hostKnown = doc.hostName && doc.hostName !== "Unknown";

  // Aufteilung wie im Editor: links, was man ständig bedient (Timer, Titel), rechts die
  // Challenges. Fehlt eine Seite (keine Rechte dafür), bleibt es bei einer Spalte.
  const hasSide = !!perms.allowModsTimer || !!perms.allowModsTitle;
  const hasMain = !!perms.allowModsChallenges || showCommands || !hasAnyPerm;
  const twoCols = hasSide && hasMain;

  /* ───────────── Render ───────────── */

  return (
    <div className="h-full overflow-y-auto custom-scrollbar text-white">
      <SEO title="Control" noindex />
      <div className={`mx-auto px-3 sm:px-6 py-5 md:py-8 ${twoCols ? "max-w-5xl" : "max-w-2xl"}`}>

        {/* Kopf: wessen Overlay, und ob gerade gespeichert wird */}
        <div className="flex items-end justify-between gap-4 mb-4">
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

        <div className={`grid gap-3 ${twoCols ? "lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start" : ""}`}>

          {/* LINKS: Timer und Titel — bleiben beim Scrollen durch eine lange Liste stehen */}
          {hasSide && (
            <div className={`flex flex-col gap-3 ${twoCols ? "lg:sticky lg:top-0" : ""}`}>
              {perms.allowModsTimer && (
                <section className={`${PANEL} p-4`}>
                  <TimerPanel timer={timer} now={now} t={t} actions={timerActions} />
                </section>
              )}

              {perms.allowModsTitle && (
                <section className={`${PANEL} p-4`}>
                  <label htmlFor="wc-mod-title" className={`${LABEL} flex items-center gap-2 mb-2`}>
                    <Type size={14} /> {t.editTitle}
                  </label>
                  <input
                    id="wc-mod-title"
                    className={INPUT}
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
            </div>
          )}

          {/* RECHTS: Challenges, Chat-Befehle */}
          {hasMain && (
            <div className="flex flex-col gap-3 min-w-0">

              {perms.allowModsChallenges && (
                <section className={`${PANEL} p-4`}>
                  <h2 className={`${LABEL} flex items-center gap-2 mb-3`}><ListChecks size={14} /> {t.tabChallenges}</h2>

                  {currentItems.length === 0 && (
                    <p className="text-xs text-white/40 mb-3">{t.noChallenges}</p>
                  )}

                  {currentItems.length > 0 && (
                    <div className="space-y-1.5">
                      {currentItems.map((it) => {
                        const done = isItemDone(it);
                        const mode = itemMode(it);
                        // Serie mit gültiger Länge: Kästchen zum Abhaken statt −/+
                        const streakBoxes = showsStreakPips(it);
                        let tone = "border-white/10 bg-white/[0.04]";
                        if (done) tone = "border-green-500/70 bg-green-500/[0.06]";
                        else if (it.pinned) tone = "border-violet-500/80 bg-white/[0.04]";
                        // Zähler: steht bei „Zähler“ rechts neben der Art, bei einer Serie mit
                        // ungültiger Länge an der Stelle der Kästchen
                        const counter = (
                          <div className="shrink-0 flex items-center bg-black/30 rounded-sm overflow-hidden">
                            <button
                              type="button"
                              onClick={() => adjustChallengeProgress(it.id, -1)}
                              className="px-3.5 py-1.5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                              title="−1"
                            >
                              −
                            </button>
                            <span className={`w-16 text-center text-sm font-bold tabular-nums ${done ? "text-green-400" : ""}`}>
                              {it.progress || 0} / {it.target || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustChallengeProgress(it.id, 1)}
                              className="px-3.5 py-1.5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                              title="+1"
                            >
                              +
                            </button>
                          </div>
                        );

                        return (
                          <div key={it.id} className={`rounded-sm border-l-2 px-3 py-2.5 flex flex-col gap-2 ${tone}`}>
                            {/* Kopfzeile: Cover + Name + Pin + Löschen */}
                            <div className="flex items-center gap-1.5">
                              <GameCoverPicker
                                icon={it.icon}
                                onChange={(icon) => patchChallenge(it.id, { icon })}
                                t={t}
                                controlKey={controlKey}
                              />
                              <input
                                className="flex-1 min-w-0 bg-transparent text-base font-semibold placeholder-white/25 focus:outline-none text-white px-1"
                                defaultValue={it.name}
                                onBlur={(e) =>
                                  patchChallenge(it.id, { name: e.target.value })
                                }
                                placeholder={t.modNamePlaceholder}
                              />
                              <button
                                type="button"
                                onClick={() => patchChallenge(it.id, { pinned: !it.pinned })}
                                aria-pressed={!!it.pinned}
                                className={`p-2 rounded-sm transition-colors ${
                                  it.pinned
                                    ? "text-violet-300 bg-violet-500/15"
                                    : "text-white/35 hover:text-white hover:bg-white/[0.08]"
                                }`}
                                title={it.pinned ? t.unpin : t.pin}
                                aria-label={it.pinned ? t.unpin : t.pin}
                              >
                                <Pin size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeChallenge(it.id)}
                                className="p-2 text-white/35 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                                title={t.removeChallenge}
                                aria-label={t.removeChallenge}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            {/* Zweite Zeile: Art der Challenge, daneben ihr Stand */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                              <div role="radiogroup" aria-label={t.modeAria} className="flex p-0.5 rounded-sm bg-black/30">
                                {ITEM_MODES.map((m) => {
                                  const on = mode === m.mode;
                                  return (
                                    <button
                                      key={m.mode}
                                      type="button"
                                      role="radio"
                                      aria-checked={on}
                                      title={m.titleKey ? t[m.titleKey] : t[m.labelKey]}
                                      onClick={() => { if (!on) patchChallenge(it.id, itemModePatch(it, m.mode)); }}
                                      className={`h-7 px-2 flex items-center gap-1 rounded-[2px] text-[11px] font-bold transition-colors ${on ? "bg-violet-500/30 text-white" : "text-white/40 hover:text-white"}`}
                                    >
                                      {/* Auf dem Handy trägt nur die gewählte Art ihren Namen */}
                                      <m.Icon size={12} strokeWidth={m.stroke} />
                                      <span className={on ? "" : "sr-only sm:not-sr-only"}>{t[m.labelKey]}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {mode === "streak" && (
                                // Länge der Serie: B2B bis B10 — rechts, wo bei den anderen Arten der Stand steht
                                <div role="group" aria-label={t.streakLength} title={t.streakLength} className="ml-auto flex items-center h-8 rounded-sm bg-black/30">
                                  <button
                                    type="button"
                                    onClick={() => patchChallenge(it.id, streakLengthPatch(it, (it.target || 0) - 1))}
                                    disabled={(it.target || 0) <= STREAK_MIN}
                                    aria-label={t.streakShorter}
                                    className="w-8 h-8 text-white/50 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                  >−</button>
                                  <span className="min-w-[3.25rem] text-center text-xs font-bold text-white/80 tabular-nums whitespace-nowrap">{t.streakWins(it.target || 0)}</span>
                                  <button
                                    type="button"
                                    onClick={() => patchChallenge(it.id, streakLengthPatch(it, (it.target || 0) + 1))}
                                    disabled={(it.target || 0) >= STREAK_MAX}
                                    aria-label={t.streakLonger}
                                    className="w-8 h-8 text-white/50 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                  >+</button>
                                </div>
                              )}

                              {mode === "counter" && (
                                <label className="flex items-center h-8 bg-black/30 rounded-sm px-2">
                                  <span className="text-[10px] uppercase text-white/35 font-bold mr-2">{t.target}</span>
                                  <input
                                    type="number"
                                    min={1}
                                    className="w-10 bg-transparent text-right text-sm tabular-nums focus:outline-none text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    defaultValue={it.target || 1}
                                    onBlur={(e) => setChallengeTarget(it.id, e.target.value)}
                                  />
                                </label>
                              )}

                              {/* Stand — rechtsbündig. Eine Serie hat dafür ihre eigene Zeile darunter. */}
                              {mode === "counter" && <div className="ml-auto">{counter}</div>}
                              {mode === "check" && (
                                <button
                                  type="button"
                                  onClick={() => toggleChallengeDone(it.id, !done)}
                                  aria-pressed={done}
                                  className={`ml-auto h-8 px-3 flex items-center gap-1.5 rounded-sm text-xs font-bold transition-colors ${
                                    done
                                      ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                      : "bg-black/30 text-white/50 hover:text-white hover:bg-white/10"
                                  }`}
                                >
                                  <Check size={14} strokeWidth={3} className={done ? "" : "opacity-40"} />
                                  {done ? t.done : t.open}
                                </button>
                              )}
                            </div>

                            {/* Dritte Zeile, nur bei einer Serie: ein großes Kästchen je Win und „Auf 0“
                                für die gerissene Serie — wie im Editor. Die Kästchen brechen bei wenig
                                Platz in sich um, „Auf 0“ bleibt rechts stehen. */}
                            {mode === "streak" && (
                              <div className="flex items-center justify-between gap-3 rounded-sm bg-black/25 px-2.5 py-2">
                                {streakBoxes ? (
                                  <StreakBoxes
                                    size="lg"
                                    total={it.target || 0}
                                    filled={Math.min(it.progress || 0, it.target || 0)}
                                    onPick={(i) => patchChallenge(it.id, { progress: streakClickProgress(it, i) })}
                                    t={t}
                                  />
                                ) : counter}
                                <button
                                  type="button"
                                  onClick={() => patchChallenge(it.id, { progress: 0 })}
                                  disabled={!(it.progress > 0)}
                                  title={t.streakResetTitle}
                                  className="shrink-0 h-8 px-2 flex items-center gap-1.5 rounded-sm text-xs font-bold text-white/45 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                >
                                  <RotateCcw size={14} /> {t.streakReset}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addChallenge}
                    className={`${BTN_PRIMARY} w-full mt-3 py-2.5 text-sm flex justify-center items-center gap-2`}
                  >
                    <Plus size={16} /> {t.modAddChallenge}
                  </button>
                </section>
              )}

              {/* Chat-Befehle — Referenz für Mods */}
              {showCommands && (
                <section className={`${PANEL} p-4`}>
                  <h2 className={`${LABEL} flex items-center gap-2 mb-3`}><MessageSquare size={14} /> {t.chatCommands}</h2>
                  {chatChannels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {chatChannels.map((c) => (
                        <span
                          key={c}
                          className="flex items-center gap-1 bg-white/[0.06] rounded-sm px-2 py-1 text-xs text-white/70"
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
                        className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 py-1.5"
                      >
                        <span className="text-xs font-semibold text-violet-300 sm:w-52 shrink-0">
                          {c.cmd}
                        </span>
                        <span className="text-xs text-white/60">{c.desc}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-white/40 mt-3">{t.modFuzzy}</p>
                </section>
              )}

              {/* Hinweis, falls keine Rechte */}
              {!hasAnyPerm && (
                <section className={`${PANEL} p-4 flex items-start gap-3`}>
                  <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-white/60">{t.noPerms}</p>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
