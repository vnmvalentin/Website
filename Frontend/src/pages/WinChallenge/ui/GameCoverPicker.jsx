// GameCoverPicker.jsx — Knopf vor dem Challenge-Namen, der ein Spielcover auswählt.
// Gesucht wird in den Twitch-Kategorien (Backend: winchallenge/winchallengeGames.js).
// Editor (WinChallenge.jsx) und Mod-Seite (WinChallengeControl.jsx) nutzen dieselbe
// Komponente; die Mod-Seite hat keinen Login und weist sich über `controlKey` aus.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Gamepad2, Search, X } from "lucide-react";
import { itemIconUrl } from "../overlayUtils";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
const POPOVER_W = 288;
// Höchste Ausdehnung: Suchfeld + 8 Treffer + „entfernen“ — danach wird gewählt,
// ob das Fenster unter oder über dem Knopf aufgeht
const POPOVER_MAX_H = 400;
const EDGE = 8;

/**
 * @param {object} props
 * @param {{id: string, name: string, url: string}|null} [props.icon] aktuelles Cover
 * @param {(icon: object|null) => void} props.onChange  null entfernt das Cover
 * @param {object} props.t               Texte (wcI18n.js)
 * @param {string} [props.controlKey]    nur auf der Mod-Seite
 * @param {"sm"|"lg"} [props.size]      lg: großer Platz in der Challenge-Karte des Editors
 */
export default function GameCoverPicker({ icon, onChange, t, controlKey, size = "sm" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [query, setQuery] = useState("");
  const [games, setGames] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [thumbBroken, setThumbBroken] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const currentUrl = itemIconUrl({ icon });
  useEffect(() => setThumbBroken(false), [currentUrl]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setGames([]);
    setStatus("idle");
  };

  // Das Fenster hängt am Dokument statt an der Zeile: die Challenge-Liste scrollt und
  // würde es bei den unteren Zeilen abschneiden. Ist unten zu wenig Platz, geht es
  // nach oben auf.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - POPOVER_W - EDGE));
    const below = window.innerHeight - r.bottom;
    setPos(
      below < POPOVER_MAX_H && r.top > below
        ? { left, bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 6 - EDGE }
        : { left, top: r.bottom + 6, maxHeight: below - 6 - EDGE }
    );
  }, [open]);

  // Schließen: Klick daneben, Escape, oder die Seite bewegt sich unter dem Fenster weg
  useEffect(() => {
    if (!open) return undefined;
    const inside = (target) =>
      popRef.current?.contains(target) || btnRef.current?.contains(target);
    const onDown = (e) => { if (!inside(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") { close(); btnRef.current?.focus(); } };
    const onScroll = (e) => { if (!popRef.current?.contains(e.target)) close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Suche mit Verzögerung; eine überholte Anfrage wird abgebrochen
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setGames([]);
      setStatus("idle");
      return undefined;
    }
    setStatus("loading");
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (controlKey) params.set("control", controlKey);
        const res = await fetch(`/api/winchallenge/games?${params}`, {
          credentials: "include",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setGames(Array.isArray(data?.games) ? data.games : []);
        setStatus("done");
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error("Game search failed:", e);
        setGames([]);
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query, controlKey]);

  const pick = (game) => {
    onChange(game ? { id: game.id, name: game.name, url: game.url } : null);
    close();
    btnRef.current?.focus();
  };

  const label = currentUrl ? `${t.coverChange}${icon?.name ? ` (${icon.name})` : ""}` : t.coverPick;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        aria-label={label}
        // Der leere Platz ist gestrichelt umrandet: man soll ihm ansehen, dass hier
        // etwas hingehört — als bloßes Symbol hat ihn niemand gefunden.
        className={`shrink-0 flex items-center justify-center rounded-sm overflow-hidden transition-colors ${
          size === "lg" ? "w-9 h-12" : "w-[27px] h-9"
        } ${
          currentUrl && !thumbBroken
            ? "ring-1 ring-white/10 hover:ring-white/40"
            : `border border-dashed hover:border-violet-400 hover:text-violet-300 ${
                open ? "border-violet-400 text-violet-300" : "border-white/25 text-white/40"
              }`
        }`}
      >
        {currentUrl && !thumbBroken ? (
          <img
            src={currentUrl}
            alt=""
            draggable={false}
            onError={() => setThumbBroken(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <Gamepad2 size={size === "lg" ? 18 : 15} />
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={t.coverPick}
          style={{ position: "fixed", width: POPOVER_W, ...pos }}
          className="z-50 flex flex-col bg-[#1c1c27] rounded-md shadow-xl shadow-black/50 text-white overflow-hidden"
        >
          <div className="relative shrink-0 p-2">
            <Search size={15} className="absolute left-[18px] top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && games.length > 0) {
                  e.preventDefault();
                  pick(games[0]);
                }
              }}
              placeholder={t.coverSearch}
              maxLength={50}
              className="w-full bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.09] rounded-sm pl-8 pr-3 py-2 text-sm text-white placeholder-white/25 outline-none ring-1 ring-transparent focus:ring-violet-500 transition-colors"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {games.map((g) => (
              <button
                key={g.id || g.url}
                type="button"
                onClick={() => pick(g)}
                className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.08] focus:bg-white/[0.08] outline-none ${
                  g.url === currentUrl ? "bg-violet-500/15" : ""
                }`}
              >
                <img src={g.url} alt="" loading="lazy" className="shrink-0 w-[27px] h-9 object-cover rounded-[2px] bg-white/[0.06]" />
                <span className="min-w-0 truncate text-sm font-semibold">{g.name}</span>
              </button>
            ))}
            {games.length === 0 && (
              <p className={`px-3 pb-3 pt-1 text-xs ${status === "error" ? "text-red-400" : "text-white/40"}`}>
                {status === "loading" && t.coverLoading}
                {status === "done" && t.coverNone}
                {status === "error" && t.coverError}
                {status === "idle" && t.coverHint}
              </p>
            )}
          </div>

          {currentUrl && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-white/10 text-xs font-bold text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X size={14} /> {t.coverRemove}
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
