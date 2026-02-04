// WinChallengeControl.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import SEO from "../../components/SEO";

function msToClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function WinChallengeControl() {
  const { controlKey } = useParams();
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

  if (!doc) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div>Lade Control-Interface…</div>
      </div>
    );
  }

  const perms = doc.controlPermissions || {};
  const timer = doc.timer || {};
  const elapsed = timer.running
    ? now - (timer.startedAt || 0)
    : timer.elapsedMs || 0;

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

  const startTimer = () => {
    if (!perms.allowModsTimer) return;
    sendPatch({ action: "timerStart" });
  };

  const pauseTimer = () => {
    if (!perms.allowModsTimer) return;
    sendPatch({ action: "timerPause" });
  };

  const resetTimer = () => {
    if (!perms.allowModsTimer) return;
    sendPatch({ action: "timerReset" });
  };

  const toggleTimerVisible = (visible) => {
    if (!perms.allowModsTimer) return;
    sendPatch({ action: "timerSetVisible", visible });
  };

  const adjustTimer = (deltaMs) => {
    if (!perms.allowModsTimer) return;
    sendPatch({ action: "timerAdjust", deltaMs });
  };

  /* ───────────── Titel Actions ───────────── */

  const commitTitle = () => {
    if (!perms.allowModsTitle) return;
    sendPatch({ action: "updateTitle", title: localTitle || "" });
  };

  /* ───────────── Challenge Actions ───────────── */

  const currentItems = Array.isArray(doc.items) ? doc.items : [];

  const updateItems = (builder) => {
    if (!perms.allowModsChallenges) return;
    const nextItems = builder(currentItems);
    sendPatch({ action: "updateItems", items: nextItems });
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

  /* ───────────── Render ───────────── */

  return (
    <div
      className="min-h-screen text-gray-100 flex justify-center p-4"
      style={{ background: "transparent" }}
    >
      <SEO title = "Control"/>
      <div className="w-full max-w-xl bg-gray-900/80 rounded-2xl p-4 border border-gray-800 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">WinChallenge Control</h1>
          <span className="text-xs text-gray-400">
            {saving ? "Speichern…" : "Verbunden"}
          </span>
        </div>

        {/* Timer Control */}
        {perms.allowModsTimer && (
          <div className="mb-4 bg-gray-900/80 rounded-xl p-3 border border-gray-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Timer</span>
              <span className="font-mono text-lg">{msToClock(elapsed)}</span>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={startTimer}
                className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm"
              >
                Start
              </button>
              <button
                onClick={pauseTimer}
                className="bg-yellow-600 hover:bg-yellow-700 px-3 py-2 rounded text-sm"
              >
                Pause
              </button>
              <button
                onClick={resetTimer}
                className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm"
              >
                Reset
              </button>
              <label className="flex items-center gap-2 text-xs text-gray-300 ml-2">
                <input
                  type="checkbox"
                  checked={timer.visible !== false}
                  onChange={(e) => toggleTimerVisible(e.target.checked)}
                />
                Timer im Overlay anzeigen
              </label>
            </div>

            {/* Timer manuell anpassen */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-gray-400 mr-1">
                Timer manuell anpassen:
              </span>
              <button
                onClick={() => adjustTimer(60 * 60 * 1000)}
                className="bg-gray-700 hover:bg-gray-800 px-2 py-1 rounded text-xs"
              >
                +1h
              </button>
              <button
                onClick={() => adjustTimer(60 * 1000)}
                className="bg-gray-700 hover:bg-gray-800 px-2 py-1 rounded text-xs"
              >
                +1min
              </button>
              <button
                onClick={() => adjustTimer(-60 * 1000)}
                className="bg-gray-700 hover:bg-gray-800 px-2 py-1 rounded text-xs"
              >
                −1min
              </button>
              <button
                onClick={() => adjustTimer(-60 * 60 * 1000)}
                className="bg-gray-700 hover:bg-gray-800 px-2 py-1 rounded text-xs"
              >
                −1h
              </button>
            </div>
          </div>
        )}

        {/* Titel Control */}
        {perms.allowModsTitle && (
          <div className="mb-4 bg-gray-900/80 rounded-xl p-3 border border-gray-800/80">
            <span className="block text-sm font-semibold mb-2">
              Titel bearbeiten
            </span>
            <input
              className="w-full bg-gray-800 px-3 py-2 rounded text-sm"
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
            <p className="text-xs text-gray-500 mt-1">
              Änderung wird beim Verlassen des Feldes oder mit Enter gespeichert.
            </p>
          </div>
        )}

        {/* Challenges Control */}
        {perms.allowModsChallenges && (
          <div className="mb-4 bg-gray-900/80 rounded-xl p-3 border border-gray-800/80">
            <span className="block text-sm font-semibold mb-2">
              Challenges bearbeiten
            </span>

            {currentItems.length === 0 && (
              <p className="text-xs text-gray-500 mb-2">
                Es sind aktuell keine Challenges eingetragen.
              </p>
            )}

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {currentItems.map((it) => {
                const done = it.useWins
                  ? (it.progress || 0) >= (it.target || 0)
                  : !!it.done;

                return (
                  <div
                    key={it.id}
                    className="bg-gray-800/80 rounded-lg p-2 text-sm flex flex-col gap-2"
                  >
                    {/* Kopfzeile: Name + Pin + Löschen */}
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 bg-gray-900 px-2 py-1 rounded text-xs"
                        defaultValue={it.name}
                        onBlur={(e) =>
                          patchChallenge(it.id, { name: e.target.value })
                        }
                        placeholder="Challenge-Name"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={!!it.pinned}
                          onChange={(e) =>
                            patchChallenge(it.id, {
                              pinned: e.target.checked,
                            })
                          }
                        />
                        📌
                      </label>
                      <button
                        onClick={() => removeChallenge(it.id)}
                        className="bg-red-700 hover:bg-red-800 px-2 py-1 rounded text-xs"
                        title="Challenge löschen"
                      >
                        🗑
                      </button>
                    </div>

                    {/* Zweite Zeile: Wins / Done / Fortschritt */}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={!!it.useWins}
                          onChange={(e) =>
                            patchChallenge(it.id, {
                              useWins: e.target.checked,
                            })
                          }
                        />
                        Wins zählen
                      </label>

                      {it.useWins ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400">
                              Ziel:
                            </span>
                            <input
                              type="number"
                              min={1}
                              className="w-16 bg-gray-900 px-2 py-1 rounded text-xs"
                              defaultValue={it.target || 1}
                              onBlur={(e) =>
                                setChallengeTarget(it.id, e.target.value)
                              }
                            />
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[11px] text-gray-400">
                              Anzahl der Wins:
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  adjustChallengeProgress(it.id, -1)
                                }
                                className="bg-gray-700 hover:bg-gray-600 px-2 rounded"
                                title="Win -1"
                              >
                                −
                              </button>
                              <span className="w-16 text-center text-xs font-mono">
                                {it.progress || 0} / {it.target || 0}
                              </span>
                              <button
                                onClick={() =>
                                  adjustChallengeProgress(it.id, 1)
                                }
                                className="bg-gray-700 hover:bg-gray-600 px-2 rounded"
                                title="Win +1"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <label className="flex items-center gap-1 text-xs ml-auto">
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={(e) =>
                              toggleChallengeDone(it.id, e.target.checked)
                            }
                          />
                          Abgehakt
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3">
              <button
                onClick={addChallenge}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm"
              >
                + Challenge hinzufügen
              </button>
            </div>
          </div>
        )}

        {/* Hinweis, falls keine Rechte */}
        {!perms.allowModsTimer &&
          !perms.allowModsTitle &&
          !perms.allowModsChallenges && (
            <p className="text-sm text-gray-400">
              Für diesen Control-Link wurden aktuell keine Bearbeitungsrechte
              freigeschaltet.
            </p>
          )}
      </div>
    </div>
  );
}
