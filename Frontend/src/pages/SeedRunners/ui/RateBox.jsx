// RateBox.jsx — Sterne (1–5) und Favorit für ein Level: nach jeder Mehrspieler-Runde, nach dem Tagesrennen und auf der
// Level-Seite. Funktioniert ohne Login (Spielerschlüssel aus dem Browser); wer angemeldet ist, dem gehören die Stimmen auf
// jedem Gerät. Für ein Zufallslevel schickt der Favorit Leitidee und Autor mit, damit die Favoritenliste mehr zeigt als
// einen Seed.
import React, { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { lookupRatings, rateLevel, setFavorite } from "../levels/levelsApi.js";
import { RatingBadge, StarInput } from "./kit.jsx";
import { infoFromLevel, refKey } from "./levelRef.js";

/**
 * @param levelRef  { kind: 'custom', code } | { kind: 'pfad', seed, biome } — null blendet die Box aus
 * @param level     das gespielte Level (optional) — liefert die Favoriten-Info eines Zufallslevels
 * @param canRate   false: nur Favorit und Schnitt (z. B. das eigene Level)
 * @param title     Überschrift, Standard „Wie war das Level?“
 */
export default function RateBox({ levelRef, level = null, canRate = true, title = "Wie war das Level?", compact = false }) {
  const key = refKey(levelRef);
  const [state, setState] = useState({ key: "", rating: null, mine: null, favorite: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    setError("");
    lookupRatings([levelRef]).then((items) => {
      const it = items[0];
      if (alive) setState({ key, rating: it?.rating || { count: 0, avg: null }, mine: it?.mine ?? null, favorite: !!it?.favorite });
    });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!levelRef) return null;
  const ready = state.key === key;

  const rate = async (stars) => {
    setBusy(true);
    setError("");
    const before = state;
    setState((s) => ({ ...s, mine: stars || null }));                 // sofort zeigen, bei Fehler zurück
    const res = await rateLevel(levelRef, stars);
    if (res.status === "ok") setState((s) => ({ ...s, mine: res.mine, rating: res.rating }));
    else { setState(before); setError(res.reason || "Bewerten hat nicht geklappt."); }
    setBusy(false);
  };

  const toggleFavorite = async () => {
    setBusy(true);
    setError("");
    const on = !state.favorite;
    setState((s) => ({ ...s, favorite: on }));
    const res = await setFavorite(levelRef, on, levelRef.kind === "pfad" ? infoFromLevel(level) : undefined);
    if (res.status !== "ok") { setState((s) => ({ ...s, favorite: !on })); setError(res.reason || "Das hat nicht geklappt."); }
    setBusy(false);
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${compact ? "" : "sr-sunk px-4 py-3"}`} data-testid="rate-box">
      <div className="min-w-0">
        {!compact && <p className="sr-label mb-1">{title}</p>}
        <div className="flex items-center gap-3">
          <StarInput value={state.mine || 0} onChange={rate} disabled={!ready || busy || !canRate} />
          <RatingBadge rating={state.rating} />
        </div>
      </div>
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={!ready || busy}
        aria-pressed={state.favorite}
        className={`sr-btn sr-btn-sm ${state.favorite ? "" : "sr-btn-ghost"} ml-auto`}
        title={state.favorite ? "Aus den Favoriten entfernen" : "Als Favorit merken — in jeder künftigen Lobby direkt auswählbar"}
      >
        <Bookmark size={14} fill={state.favorite ? "currentColor" : "none"} />
        {state.favorite ? "Favorit" : "Merken"}
      </button>
      {!canRate && <p className="w-full text-xs sr-faint">Dein eigenes Level kannst du nicht bewerten.</p>}
      {error && <p className="w-full text-xs sr-bad">{error}</p>}
    </div>
  );
}
