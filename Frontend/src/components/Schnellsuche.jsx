// components/Schnellsuche.jsx — Befehlsleiste: Strg+K (Mac ⌘K), „/“ außerhalb von Eingabefeldern oder der Knopf im
// Kopf (SucheKnopf). Findet Seiten und Spiele (Seitenliste in der gewählten Sprache + Extras), Clash-Royale-Karten,
// Spieler und Clans (GET /api/clash/scout/search von Spur B, entprellt) und führt bei einem Spieler-Tag direkt hin.
// Ohne Eingabe stehen die zuletzt gewählten Ziele und zuletzt besuchten Bereiche oben. Logik in utils/schnellsuche.js.
//
// Einmal in Layout.jsx eingesetzt: <Schnellsuche onAktion={(aktion) => …} /> — onAktion bekommt z. B. "feedback".
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, CornerDownLeft, ExternalLink, FileText, UserRound, Shield, Layers, Clock, Loader2 } from "lucide-react";
import { useLanguage } from "../i18n/language.js";
import { navigationFuer, showcaseLinksFuer } from "../config/navigationEn";
import { recentVisited } from "../utils/visitMemory";
import { salesVisible } from "../config/legal";
import {
  seitenIndex, kartenIndex, suche, alsTag, merkeZiel, zuletztGewaehlt, oeffneSuche, schliesseSuche, istSucheOffen, abonniereSuche,
} from "../utils/schnellsuche.js";
import { SCHNELLSUCHE_TEXTE } from "./schnellsucheTexte.js";
import useFokusFalle from "./ui/useFokusFalle.js";

// Offen/zu steht in utils/schnellsuche.js (Knopf, Tastenkürzel und andere Stellen öffnen dieselbe Suche)
const useOffen = () => useSyncExternalStore(abonniereSuche, istSucheOffen, () => false);

const istMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const tasteText = (lang) => (istMac() ? "⌘K" : lang === "en" ? "Ctrl+K" : "Strg+K");
const istEingabe = (el) => el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

/** Knopf mit Lupe für den Kopf (und Hüllen) */
export function SucheKnopf({ className = "" }) {
  const { lang } = useLanguage({ supported: SCHNELLSUCHE_TEXTE.langs });
  const t = SCHNELLSUCHE_TEXTE.dict(lang);
  return (
    <button type="button" onClick={oeffneSuche} aria-label={t.knopf} title={t.knopfTitel(tasteText(lang))}
      className={`flex items-center justify-center w-10 h-10 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors ${className}`}>
      <Search size={18} />
    </button>
  );
}

const ICONS = { spieler: UserRound, clan: Shield, karte: Layers, seite: FileText };

function SuchFenster({ onAktion }) {
  const { lang } = useLanguage({ supported: SCHNELLSUCHE_TEXTE.langs });
  const t = SCHNELLSUCHE_TEXTE.dict(lang);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const [kartenModul, setKartenModul] = useState(null);
  const [api, setApi] = useState({ q: "", spieler: [], clans: [], laedt: false });
  const liste = useRef(null);
  // Tab bleibt im Fenster (Eingabe ↔ Schließen), beim Schließen zurück zum Auslöser (ui/useFokusFalle.js)
  const fenster = useRef(null);
  useFokusFalle(fenster, true, { start: "input" });
  const anfrage = q.trim();

  const seiten = useMemo(() => seitenIndex(navigationFuer(lang), lang, { verkauf: salesVisible() }), [lang]);
  const karten = useMemo(() => (kartenModul ? kartenIndex(kartenModul.ALL_CARDS) : null), [kartenModul]);

  // Kartendaten erst laden, wenn jemand tippt (kleine Datei, aber nicht auf jeder Seite nötig)
  useEffect(() => {
    if (anfrage.length < 2 || kartenModul) return;
    import("../pages/ClashRoyale/data/cards.js").then(setKartenModul).catch(() => setKartenModul({ ALL_CARDS: [] }));
  }, [anfrage, kartenModul]);

  // Spieler und Clans: entprellt (die Suche von Spur B erlaubt 90 Anfragen je Minute), Clans erst ab 3 Zeichen
  useEffect(() => {
    if (anfrage.length < 2 || alsTag(anfrage)) {
      setApi({ q: anfrage, spieler: [], clans: [], laedt: false });
      return undefined;
    }
    setApi((a) => ({ ...a, laedt: true }));
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/clash/scout/search?q=${encodeURIComponent(anfrage)}&clans=${anfrage.length >= 3 ? 1 : 0}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setApi({ q: anfrage, spieler: (d?.players || []).slice(0, 5), clans: (d?.clans || []).slice(0, 4), laedt: false }))
        .catch((e) => { if (e.name !== "AbortError") setApi({ q: anfrage, spieler: [], clans: [], laedt: false }); });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [anfrage]);

  const gruppen = useMemo(() => {
    const zahl = (n) => Number(n || 0).toLocaleString(lang === "en" ? "en-US" : "de-DE");
    if (!anfrage) {
      const uebersetzt = Object.fromEntries(showcaseLinksFuer(lang).map((l) => [l.id, l]));
      const besucht = recentVisited(6).map((l) => uebersetzt[l.id] || l)
        .map((l) => ({ art: "seite", titel: l.label, text: l.description || "", ziel: l.to, icon: l.icon }));
      const eintraege = [...zuletztGewaehlt(), ...besucht].filter((e, i, alle) => alle.findIndex((x) => x.ziel === e.ziel) === i).slice(0, 8);
      return eintraege.length ? [{ key: "zuletzt", titel: t.zuletzt, eintraege, zuletzt: true }] : [];
    }
    const g = [];
    const tag = alsTag(anfrage);
    if (tag) {
      g.push({ key: "direkt", titel: t.direkt, eintraege: [
        { art: "spieler", titel: t.spielerTag(tag), ziel: `/clash/spieler/${tag}` },
        { art: "clan", titel: t.clanTag(tag), ziel: `/clash/clan/${tag}` },
      ] });
    }
    const s = suche(seiten, anfrage, 7);
    if (s.length) g.push({ key: "seiten", titel: t.seiten, eintraege: s });
    const k = karten ? suche(karten, anfrage, 5) : [];
    if (k.length) g.push({ key: "karten", titel: t.karten, eintraege: k });
    if (api.q === anfrage && api.spieler.length) {
      g.push({ key: "spieler", titel: t.spieler, eintraege: api.spieler.map((p) => ({
        art: "spieler", titel: p.name, ziel: `/clash/spieler/${p.tag}`,
        text: [`#${p.tag}`, p.trophies ? t.trophaeen(zahl(p.trophies)) : null, p.clan || null].filter(Boolean).join(" · "),
      })) });
    }
    if (api.q === anfrage && api.clans.length) {
      g.push({ key: "clans", titel: t.clans, eintraege: api.clans.map((c) => ({
        art: "clan", titel: c.name, ziel: `/clash/clan/${c.tag}`,
        text: [`#${c.tag}`, c.members ? t.mitglieder(c.members) : null, c.location?.name || null].filter(Boolean).join(" · "),
      })) });
    }
    return g;
  }, [anfrage, seiten, karten, api, lang, t]);

  const flach = useMemo(() => gruppen.flatMap((g) => g.eintraege), [gruppen]);
  useEffect(() => { setAktiv(0); }, [anfrage]);
  useEffect(() => {
    liste.current?.querySelector(`[data-index="${aktiv}"]`)?.scrollIntoView({ block: "nearest" });
  }, [aktiv]);

  const waehle = useCallback((e) => {
    if (!e) return;
    merkeZiel(e);
    schliesseSuche();
    if (e.aktion) onAktion?.(e.aktion);
    else if (e.extern) window.open(e.ziel, "_blank", "noopener,noreferrer");
    else navigate(e.ziel);
  }, [navigate, onAktion]);

  const taste = (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!flach.length) return;
      setAktiv((a) => (a + (ev.key === "ArrowDown" ? 1 : -1) + flach.length) % flach.length);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      waehle(flach[aktiv]);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      schliesseSuche();
    }
  };

  let index = -1;
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-[8vh] md:pt-[12vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) schliesseSuche(); }}>
      <div ref={fenster} role="dialog" aria-modal="true" aria-label={t.titel} className="w-full max-w-xl panel-strong shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-white/10">
          <Search size={18} className="text-white/55 shrink-0" aria-hidden="true" />
          {/* Kein autoFocus: den Fokus setzt useFokusFalle — sonst stünde er schon im Feld, bevor sie sich den
              Auslöser (Lupe) für das Zurückgeben merken kann */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={taste}
            placeholder={t.platzhalter}
            aria-label={t.titel}
            role="combobox"
            aria-expanded={flach.length > 0}
            aria-controls="schnellsuche-liste"
            aria-activedescendant={flach.length ? `schnellsuche-${aktiv}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 h-14 bg-transparent text-base text-white placeholder:text-white/50 focus:outline-none"
          />
          <button type="button" onClick={schliesseSuche} aria-label={t.schliessen} className="p-1.5 rounded-md text-white/55 hover:text-white hover:bg-white/5"><X size={18} /></button>
        </div>

        <div id="schnellsuche-liste" role="listbox" ref={liste} className="max-h-[60vh] overflow-y-auto custom-scrollbar py-2">
          {gruppen.map((g) => (
            <div key={g.key} role="group" aria-label={g.titel}>
              <p className="flex items-center gap-1.5 px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
                {g.zuletzt && <Clock size={11} aria-hidden="true" />} {g.titel}
              </p>
              {g.eintraege.map((e) => {
                index += 1;
                const i = index;
                const Icon = e.icon || ICONS[e.art] || FileText;
                const bild = e.art === "karte" && kartenModul && e.kartenId ? kartenModul.cardImageUrl(e.kartenId) : null;
                const an = i === aktiv;
                return (
                  // Einträge sind keine Tab-Halte: gewählt wird mit den Pfeiltasten im Suchfeld (aria-activedescendant)
                  <button key={`${g.key}:${e.ziel || e.aktion}`} type="button" id={`schnellsuche-${i}`} role="option" aria-selected={an} tabIndex={-1}
                    data-index={i} onMouseMove={() => setAktiv(i)} onClick={() => waehle(e)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${an ? "bg-accent/15" : ""}`}>
                    <span className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-md border ${an ? "border-accent/40 text-accent-soft" : "border-line text-white/55"}`}>
                      {bild ? <img src={bild} alt="" className="w-7 h-7 object-contain" loading="lazy" /> : <Icon size={16} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-white truncate">{e.titel}</span>
                      {(e.text || e.bereich) && (
                        <span className="block text-xs text-white/55 truncate">{[e.bereich, e.text].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                    {e.extern && <ExternalLink size={13} className="text-white/30 shrink-0" aria-label={t.extern} />}
                    {an && <CornerDownLeft size={14} className="text-white/55 shrink-0 hidden sm:block" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
          {anfrage && api.laedt && (
            <p className="flex items-center gap-2 px-4 py-2 text-xs text-white/55"><Loader2 size={13} className="animate-spin" /> {t.sucht}</p>
          )}
          {anfrage && !flach.length && !api.laedt && <p className="px-4 py-6 text-sm text-white/55 text-center">{t.nichts(anfrage)}</p>}
          {!anfrage && !flach.length && <p className="px-4 py-6 text-sm text-white/55 text-center">{t.leer}</p>}
        </div>

        <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-white/10 text-[11px] text-white/50">
          <span><kbd className="font-mono">↑↓</kbd> {t.hinweisNavigieren}</span>
          <span><kbd className="font-mono">↵</kbd> {t.hinweisOeffnen}</span>
          <span><kbd className="font-mono">Esc</kbd> {t.hinweisSchliessen}</span>
        </div>
      </div>
    </div>
  );
}

/** Einmal im Layout: Tastenkürzel und das Fenster selbst */
export default function Schnellsuche({ onAktion }) {
  const istOffen = useOffen();
  useEffect(() => {
    const taste = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (istSucheOffen()) schliesseSuche(); else oeffneSuche();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !istSucheOffen() && !istEingabe(e.target)) {
        e.preventDefault();
        oeffneSuche();
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);
  // Bei jedem Öffnen frisch (leere Eingabe, neue „Zuletzt“-Liste)
  return istOffen ? <SuchFenster onAktion={onAktion} /> : null;
}
