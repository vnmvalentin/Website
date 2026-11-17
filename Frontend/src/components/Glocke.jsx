// components/Glocke.jsx — die Glocke: Neuigkeiten mit Zähler für Ungelesenes. Steht im Kopf der Website (Layout.jsx)
// und ist als ANDOCKSTELLE für die Spiel- und Tool-Hüllen gebaut: <Glocke /> braucht nichts außer Router und holt
// alles selbst.
//
// Inhalt:  Stream ist live (useLiveStatus; zählt einmal je Stream) · persönliche Nachrichten am Konto (GET /api/glocke,
//          z. B. Antworten auf Feedback; entstehen über Backend/lib/mitteilungen.js) · neue Updates (Liste vom Server,
//          Merker im Browser wie „Neu seit deinem letzten Besuch“, utils/updatesGesehen.js).
// Öffnen markiert alles als gelesen; was beim Öffnen neu war, bleibt in diesem Fenster als „neu“ markiert.
// Aufgefrischt wird beim Laden, alle 2 Minuten bei sichtbarem Tab, beim Zurückkehren in den Tab und wenn der Service
// Worker eine Mitteilung bekommt (public/sw.js). ?glocke=1 in der Adresse öffnet sie (Antwort-Mitteilungen).
//
// Props: ausrichtung "rechts" (Standard, Panel rechtsbündig) | "links"; className für den Knopf.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { useKonto, oeffneAnmeldung } from "../utils/konto.js";
import { useLiveStatus } from "../utils/useLiveStatus";
import { useLanguage } from "../i18n/language.js";
import { neueUpdates, merkeGesehen, teileVersion } from "../utils/updatesGesehen.js";
import { liveGesehen, merkeLive, zaehleNeues, vorZeit, eintragZiel } from "../utils/glocke.js";
import { GLOCKE_TEXTE } from "./glockeTexte.js";

const AUFFRISCHEN_MS = 2 * 60 * 1000;

function Eintrag({ titel, text, zeit, neu, ziel, onClick, t, live = false }) {
  const inhalt = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0 text-sm font-semibold text-white">
          {live && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />}
          <span className="truncate">{titel}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {neu && <span className="text-[10px] font-bold uppercase tracking-wider text-accent-soft">{t.neu}</span>}
          {zeit && <span className="text-[11px] text-white/50 tabular-nums">{zeit}</span>}
        </span>
      </span>
      {text && <span className="block mt-1 text-xs text-white/55 leading-relaxed whitespace-pre-line break-words">{text}</span>}
    </>
  );
  const klasse = `block w-full text-left px-4 py-3 ${neu ? "bg-accent/[0.06]" : ""} ${ziel ? "hover:bg-white/[0.04] transition-colors" : ""}`;
  if (!ziel) return <div className={klasse}>{inhalt}</div>;
  if (/^https:/.test(ziel)) return <a href={ziel} target="_blank" rel="noopener noreferrer" className={klasse} onClick={onClick}>{inhalt}</a>;
  return <Link to={ziel} className={klasse} onClick={onClick}>{inhalt}</Link>;
}

export default function Glocke({ ausrichtung = "rechts", className = "" }) {
  const { lang } = useLanguage({ supported: GLOCKE_TEXTE.langs });
  const t = GLOCKE_TEXTE.dict(lang);
  const { konto } = useKonto();
  const live = useLiveStatus();
  const location = useLocation();
  const [daten, setDaten] = useState({ eintraege: [], ungelesen: 0, updates: [], mitspielen: null });
  const [neueVersionen, setNeueVersionen] = useState([]);
  const [offen, setOffen] = useState(false);
  const [schnappschuss, setSchnappschuss] = useState(null); // was beim Öffnen neu war
  const huelle = useRef(null);
  const knopf = useRef(null);
  const fensterRef = useRef(null);

  const laden = useCallback(async () => {
    try {
      const r = await fetch("/api/glocke", { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setDaten({ eintraege: d.eintraege || [], ungelesen: d.ungelesen || 0, updates: d.updates || [], mitspielen: d.mitspielen || null });
      setNeueVersionen(neueUpdates(d.updates || []).map((u) => u.version));
    } catch { /* nächster Versuch beim Auffrischen */ }
  }, []);

  useEffect(() => { laden(); }, [laden, konto?.id]);

  useEffect(() => {
    const sichtbar = () => document.visibilityState === "visible";
    const takt = setInterval(() => { if (sichtbar()) laden(); }, AUFFRISCHEN_MS);
    const zurueck = () => { if (sichtbar()) laden(); };
    document.addEventListener("visibilitychange", zurueck);
    const vomSw = (e) => { if (e.data?.art === "mitteilung") laden(); };
    navigator.serviceWorker?.addEventListener?.("message", vomSw);
    return () => {
      clearInterval(takt);
      document.removeEventListener("visibilitychange", zurueck);
      navigator.serviceWorker?.removeEventListener?.("message", vomSw);
    };
  }, [laden]);

  const liveNeu = Boolean(live.live && live.startedAt && !liveGesehen(live.startedAt));
  const zahl = zaehleNeues({ ungelesen: daten.ungelesen, neueUpdates: neueVersionen.length, liveNeu });

  const oeffnen = useCallback(() => {
    setSchnappschuss({
      eintraege: new Set(daten.eintraege.filter((e) => !e.gelesen).map((e) => e.id)),
      versionen: new Set(neueVersionen),
      live: liveNeu,
    });
    setOffen(true);
    // Alles als gelesen merken
    if (daten.updates[0]?.version) merkeGesehen(daten.updates[0].version);
    setNeueVersionen([]);
    if (live.startedAt) merkeLive(live.startedAt);
    if (konto && daten.ungelesen > 0) {
      setDaten((d) => ({ ...d, ungelesen: 0, eintraege: d.eintraege.map((e) => ({ ...e, gelesen: true })) }));
      fetch("/api/glocke/gelesen", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
    }
  }, [daten, neueVersionen, liveNeu, live.startedAt, konto]);

  // ?glocke=1 (Antwort-Mitteilung) öffnet die Glocke, sobald die Daten da sind
  const vonAdresse = useRef(new URLSearchParams(location.search).has("glocke"));
  useEffect(() => {
    if (vonAdresse.current && (daten.eintraege.length || daten.updates.length)) {
      vonAdresse.current = false;
      oeffnen();
    }
  }, [daten, oeffnen]);

  // Schließen: Seitenwechsel, Klick daneben, Escape
  useEffect(() => { setOffen(false); }, [location.pathname]);
  useEffect(() => {
    if (!offen) return undefined;
    const daneben = (e) => { if (huelle.current && !huelle.current.contains(e.target)) setOffen(false); };
    // Escape gibt den Fokus an die Glocke zurück (sonst stünde er nach dem Schließen nirgends)
    const taste = (e) => { if (e.key === "Escape") { setOffen(false); knopf.current?.focus(); } };
    document.addEventListener("pointerdown", daneben);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("pointerdown", daneben);
      document.removeEventListener("keydown", taste);
    };
  }, [offen]);

  // Beim Öffnen springt der Fokus ins Fenster (Screenreader hören „Neuigkeiten“, Tab geht durch die Einträge).
  // Verlässt der Fokus Glocke und Fenster per Tab, klappt es zu — ein Fenster ohne Sperre, wie ein Menü.
  useEffect(() => {
    if (offen) fensterRef.current?.focus({ preventScroll: true });
  }, [offen]);
  const fokusWeg = (e) => {
    if (offen && e.relatedTarget && !huelle.current?.contains(e.relatedTarget)) setOffen(false);
  };

  const jetzt = Date.now();
  const s = schnappschuss || { eintraege: new Set(), versionen: new Set(), live: false };
  const leer = !live.live && !daten.mitspielen && !daten.eintraege.length && !daten.updates.length;

  return (
    <div className="relative" ref={huelle} onBlur={fokusWeg}>
      <button
        ref={knopf}
        type="button"
        onClick={() => (offen ? setOffen(false) : oeffnen())}
        aria-expanded={offen}
        aria-haspopup="dialog"
        aria-label={zahl ? t.oeffnenMit(zahl) : t.oeffnen}
        title={t.titel}
        className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${offen ? "text-white bg-white/5" : "text-white/50 hover:text-white hover:bg-white/5"} ${className}`}
      >
        <Bell size={18} />
        {zahl > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-bold leading-[18px] text-center tabular-nums">
            {zahl > 9 ? "9+" : zahl}
          </span>
        )}
      </button>

      {offen && (
        // Am Handy fest an den Bildschirmrändern (die Glocke sitzt dort nicht ganz außen), ab sm am Knopf ausgerichtet
        <div role="dialog" aria-label={t.titel} ref={fensterRef} tabIndex={-1}
          className={`fixed inset-x-4 top-[4.5rem] z-50 dropdown-in sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-[360px] ${ausrichtung === "links" ? "sm:left-0" : "sm:right-0"}`}>
          <div className="panel-strong shadow-2xl shadow-black/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="font-display text-sm font-bold text-white">{t.titel}</span>
              <button type="button" onClick={() => setOffen(false)} aria-label={t.schliessen} className="p-1 rounded-md text-white/55 hover:text-white hover:bg-white/5"><X size={16} /></button>
            </div>
            <div className="max-h-[min(70vh,520px)] overflow-y-auto custom-scrollbar divide-y divide-white/5">
              {live.live && (
                <Eintrag live t={t} titel={t.liveTitel} text={[live.title, live.game].filter(Boolean).join(" · ") || t.liveText}
                  neu={s.live} ziel="/" onClick={() => setOffen(false)} />
              )}

              {/* Stream-Raum offen (Backend/mitspielen) — zählt nicht als ungelesen */}
              {daten.mitspielen && (
                <Eintrag t={t} titel={t.mitspielenTitel} text={daten.mitspielen.spielName || t.mitspielenText}
                  ziel="/mitspielen" onClick={() => setOffen(false)} />
              )}

              {daten.eintraege.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/50">{t.fuerDich}</p>
                  {daten.eintraege.slice(0, 15).map((e) => (
                    <Eintrag key={e.id} t={t} titel={e.titel?.[lang] || e.titel?.de} text={e.text?.[lang] || e.text?.de}
                      zeit={vorZeit(e.erstellt, { jetzt, lang, gerade: t.zeit.gerade })} neu={s.eintraege.has(e.id)}
                      ziel={eintragZiel(e.url)} onClick={() => setOffen(false)} />
                  ))}
                </div>
              )}

              {daten.updates.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/50">{t.updates}</p>
                  {daten.updates.slice(0, 3).map((u) => {
                    const { nummer, titel } = teileVersion(u.version);
                    return (
                      <Eintrag key={u.version} t={t} titel={titel} text={`${nummer} · ${u.date}`} neu={s.versionen.has(u.version)}
                        ziel={`/updates?v=${encodeURIComponent(nummer)}`} onClick={() => setOffen(false)} />
                    );
                  })}
                </div>
              )}

              {leer && <p className="px-4 py-6 text-sm text-white/55 text-center">{t.leer}</p>}

              {!konto && (
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-white/55">{t.anmeldenHinweis}</span>
                  <button type="button" onClick={() => { setOffen(false); oeffneAnmeldung(); }}
                    className="shrink-0 text-xs font-semibold text-accent-soft hover:text-white">{t.anmelden}</button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-white/10 text-xs">
              <Link to="/profile?bereich=einstellungen" onClick={() => setOffen(false)} className="text-white/55 hover:text-white">{t.mitteilungen}</Link>
              <Link to="/updates" onClick={() => setOffen(false)} className="text-white/55 hover:text-white">{t.alleUpdates}</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
