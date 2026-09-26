// SeedRunnersLevels.jsx — der Level-Browser: veröffentlichte Level entdecken. Sortierung (Neu, Beliebt, Bestbewertet,
// Am schwersten, Zufällig), Suche nach Name, Ersteller, Tag oder Share-Code, Filter nach Tempo und Schwierigkeit.
// Der Zustand steht in der Adresse (?sort=…&q=…), damit Zurück-Taste und Weitergeben funktionieren.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Loader2, Shuffle, X } from "lucide-react";
import SEO from "../../components/SEO";
import SandboxTabs from "./SandboxTabs.jsx";
import LevelCard from "./levels/LevelCard.jsx";
import { listLevels } from "./levels/levelsApi.js";
import { normalizeCode, isFullCodeInput, levelPath } from "./levels/shareCode.js";
import { SORT_OPTIONS, DIFFICULTIES, plural } from "./levels/labels.js";
import { SPEED_CLASSES, SPEED_CLASS_IDS } from "./sim/classes.js";
import { buttonClass, inputClass, primaryButtonClass } from "./editor/fields.jsx";

const PAGE = 24;

export default function SeedRunnersLevels() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sort = SORT_OPTIONS.some((s) => s.id === params.get("sort")) ? params.get("sort") : "new";
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const difficulty = params.get("difficulty") || "";
  const speed = SPEED_CLASS_IDS.includes(params.get("speed")) ? params.get("speed") : "";

  const [draft, setDraft] = useState(q);
  const [state, setState] = useState({ items: [], total: 0, page: 0, pages: 1, loading: true, more: false, error: "" });
  const [shuffle, setShuffle] = useState(0);
  const request = useRef(0);

  // Die Suchzeile folgt der Adresse (Zurück-Taste, Tag-Klick)
  useEffect(() => setDraft(q), [q]);

  const set = useCallback((patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    setParams(next, { replace: true });
  }, [params, setParams]);

  const load = useCallback(async (page, append) => {
    const id = ++request.current;
    setState((s) => ({ ...s, loading: !append, more: append, error: "" }));
    try {
      const res = await listLevels({ sort, q, tag, difficulty, speed, page, limit: PAGE });
      if (id !== request.current) return;
      setState((s) => ({
        items: append ? [...s.items, ...res.items.filter((it) => !s.items.some((o) => o.code === it.code))] : res.items,
        total: res.total, page: res.page, pages: res.pages, loading: false, more: false, error: "",
      }));
    } catch (e) {
      if (id === request.current) setState((s) => ({ ...s, loading: false, more: false, error: e.message || "Die Level konnten nicht geladen werden." }));
    }
  }, [sort, q, tag, difficulty, speed]);

  useEffect(() => { load(1, false); }, [load, shuffle]);

  const submit = (e) => {
    e.preventDefault();
    // Ein vollständiger Code (mit "SR") springt direkt zum Level; alles andere ist eine Suche (der Server findet auch bloße Codes)
    if (isFullCodeInput(draft)) navigate(levelPath(normalizeCode(draft)));
    else set({ q: draft.trim() });
  };

  const isRandom = sort === "random";
  const filtered = !!(q || tag || difficulty || speed);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 md:py-10">
      <SEO title="Level-Bibliothek — Seed Runners" description="Spiele Level, die andere gebaut haben: mit Bestenliste, Geistern und bestätigten Zeiten." path="/seed-runners/levels" />

      <div className="mb-6">
        <p className="sr-label mb-2">Community</p>
        <h1 className="sr-display text-3xl md:text-5xl">Level-Bibliothek</h1>
        <p className="text-sm sr-dim mt-3 max-w-2xl leading-relaxed">
          Level von anderen Spielern. Jedes wurde von seinem Ersteller einmal durchgespielt und vom Server nachgeprüft — es ist also schaffbar.
        </p>
      </div>

      <SandboxTabs />

      <div className="sr-tabs mb-4" role="tablist" aria-label="Sortierung">
        {SORT_OPTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={sort === s.id}
            onClick={() => set({ sort: s.id === "new" ? "" : s.id })}
            className="sr-tab"
          >
            {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[14rem]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Name, Ersteller, Tag oder Code"
            aria-label="Level suchen"
            className={`${inputClass} !pl-8`}
          />
        </div>
        <select value={speed} onChange={(e) => set({ speed: e.target.value })} className={`${inputClass} !w-auto`} aria-label="Tempo-Klasse">
          <option value="">Alle Tempi</option>
          {SPEED_CLASS_IDS.map((id) => <option key={id} value={id}>{SPEED_CLASSES[id].label}</option>)}
        </select>
        <select value={difficulty} onChange={(e) => set({ difficulty: e.target.value })} className={`${inputClass} !w-auto`} aria-label="Schwierigkeit">
          <option value="">Alle Schwierigkeiten</option>
          {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button type="submit" className={primaryButtonClass}>Suchen</button>
      </form>

      {(tag || q || filtered) && (
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-white/55">
          {tag && (
            <button type="button" onClick={() => set({ tag: "" })} className="inline-flex items-center gap-1 border border-violet-400/30 rounded px-2 py-1 text-violet-200 hover:bg-violet-500/10">
              Tag: {tag}<X size={12} />
            </button>
          )}
          {filtered && (
            <button type="button" onClick={() => setParams({}, { replace: true })} className="underline underline-offset-2 hover:text-white">Alle Filter zurücksetzen</button>
          )}
        </div>
      )}

      {state.error && <p className="text-sm text-amber-300 mb-4" role="alert">{state.error}</p>}

      {state.loading ? (
        <p className="flex items-center gap-2 text-sm text-white/50 py-10"><Loader2 size={15} className="animate-spin" />Lädt …</p>
      ) : state.items.length === 0 && !state.error ? (
        <div className="border border-white/10 rounded-md bg-[#0d0d14] px-5 py-10 text-center">
          <p className="text-sm text-white/70 mb-1">{filtered ? "Kein Level passt zu dieser Suche." : "Noch kein Level veröffentlicht."}</p>
          <p className="text-xs text-white/40">{filtered ? "Versuche einen anderen Begriff oder setze die Filter zurück." : "Baue eins im Editor, verifiziere es und veröffentliche es — das erste gehört dir."}</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-white/40 mb-3 tabular-nums">{plural(state.total, "Level", "Level")}{isRandom ? " · zufällige Auswahl" : ""}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="level-grid">
            {state.items.map((l) => <LevelCard key={l.code} level={l} onTag={(t) => set({ tag: t })} />)}
          </div>
          <div className="mt-6 flex justify-center">
            {isRandom ? (
              <button type="button" onClick={() => setShuffle((n) => n + 1)} className={buttonClass}><Shuffle size={14} />Neu mischen</button>
            ) : state.page < state.pages ? (
              <button type="button" onClick={() => load(state.page + 1, true)} disabled={state.more} className={buttonClass}>
                {state.more && <Loader2 size={14} className="animate-spin" />}Mehr laden
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
