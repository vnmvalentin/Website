// Home.jsx — die Startseite. Bewusst schlicht (Neubau 12.11.2026): Kopf mit zwei Knöpfen, drei Vorschau-Karten
// (dieselbe TileCard wie auf den Übersichten: für Wiederkehrer „Zuletzt besucht", sonst „Beliebt"), ein
// Text-Verzeichnis aller Bereiche und eine ruhige Zeile zu Social Media und Setup. Der Stream startet von selbst,
// wenn der Kanal live ist. Keine eigenen Schriften oder Spiel-Looks hier — die gehören in die jeweilige Unterseite.
//
// Persönlich (seit 16.11.2026, Ausbauplan persoenliche-startseite): Angemeldete (Twitch, Discord oder Gast) sehen statt
// der Begrüßung für Neue ihren Namen und ihre Stufe, die Tagesaufgaben (Andockstelle utils/tagesaufgaben.js), den Weg
// zur Visitenkarte und „Neu seit deinem letzten Besuch“ (utils/updatesGesehen.js). Texte DE/EN in startseiteTexte.js.
import { useEffect, useMemo, useState, useContext } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SEO from "../../components/SEO";
import { Share2, MonitorSmartphone, ArrowRight, Play, Check, CalendarCheck, Sparkles, X, Bell, BellRing, Gamepad2 } from "lucide-react";
import { Button, Dialog, Input, Page, SectionHeading } from "../../components/ui";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import ActivityStrip from "../../components/ActivityStrip";
import TileCard from "../../components/TileCard";
import SiteDirectory from "../../components/SiteDirectory";
import { showcaseLinksFuer } from "../../config/navigationEn";
import { recentVisited } from "../../utils/visitMemory";
import { useLiveStatus } from "../../utils/useLiveStatus";
import { useKonto } from "../../utils/konto.js";
import { ladeTagesaufgaben, TAGESAUFGABEN } from "../../utils/tagesaufgaben.js";
import { neueUpdates, merkeGesehen, teileVersion } from "../../utils/updatesGesehen.js";
import { useLanguage } from "../../i18n/language.js";
import { STARTSEITE_TEXTE } from "./startseiteTexte.js";
import { MITTEILUNGEN_TEXTE } from "../../components/mitteilungenTexte.js";
import { useMitteilungen } from "../../utils/mitteilungen.js";
import { useMitspielen } from "../../utils/mitspielen.js";
import { MITSPIELEN_TEXTE } from "../../components/mitspielenTexte.js";

// --- DATEN ---

const SOCIAL_LINKS = [
  {
    label: "Twitch",
    href: "https://twitch.tv/vnmvalentin",
    color: "hover:bg-[#9146FF] hover:text-white",
    icon: "https://cdn.simpleicons.org/twitch/white"
  },
  {
    label: "Discord",
    href: "https://discord.gg/ecRJSx2R6x",
    color: "hover:bg-[#5865F2] hover:text-white",
    icon: "https://cdn.simpleicons.org/discord/white"
  },
  {
    label: "Instagram",
    href: "https://instagram.com/vnmvalentin",
    color: "hover:bg-[#E1306C] hover:text-white",
    icon: "https://cdn.simpleicons.org/instagram/white"
  },
  {
    label: "YouTube",
    href: "https://youtube.com/@vnmvalentin",
    color: "hover:bg-[#FF0000] hover:text-white",
    icon: "https://cdn.simpleicons.org/youtube/white"
  },
  {
    label: "Twitter / X",
    href: "https://x.com/vnmvalentin",
    color: "hover:bg-black hover:text-white",
    icon: "https://cdn.simpleicons.org/x/white"
  },
  {
    label: "TikTok",
    href: "https://tiktok.com/@vnmvalentin",
    color: "hover:bg-[#00f2ea] hover:text-black",
    icon: "https://cdn.simpleicons.org/tiktok/white"
  },
];

const SETUP_HARDWARE = [
  { label: "CPU: Ryzen 9 7950x", href: "https://www.amd.com/de/products/processors/desktops/ryzen/7000-series/amd-ryzen-9-7950x.html" },
  { label: "GPU: Nvidia RTX 4070 Ti SUPER", href: "https://rog.asus.com/de/graphics-cards/graphics-cards/rog-strix/rog-strix-rtx4070tis-o16g-gaming/" },
  { label: "RAM: 32GB DDR5 5200Mhz", href: "https://www.corsair.com/de/de/p/memory/cmh32gx5m2b5200c40/vengeance-rgb-32gb-2x16gb-ddr5-dram-5200mhz-c40-memory-kit-black-cmh32gx5m2b5200c40" },
  { label: "MB: Asus Prime X670-P", href: "https://www.asus.com/de/motherboards-components/motherboards/prime/prime-x670-p/" },
  { label: "SSD 1: Samsung 980 Pro 2TB", href: "https://semiconductor.samsung.com/consumer-storage/internal-ssd/980pro/" },
  { label: "SSD 2: Kingston SA2000M8 1TB", href: "https://www.kingston.com/datasheets/SA2000_de.pdf" },
  { label: "PSU: 850W be quiet!", href: "https://www.bequiet.com/de/powersupply/4043" },
  { label: "AiO: Golden Field SF240", href: "https://www.amazon.de/dp/B07QPZMNQ2?th=1" },
  { label: "Case: NZXT H7 Elite", href: "https://nzxt.com/de-intl/products/h7-elite" },
  { label: "Mic: RODE NT-USB", href: "https://rode.com/de-de/products/nt-usb" },
  { label: "Cam: Razer Kiyo Pro", href: "https://www.razer.com/de-de/streaming-cameras/razer-kiyo-pro" },
  { label: "Key: Roccat Magma", href: "https://de.turtlebeach.com/products/magma-keyboard?Layout=DE" },
  { label: "Mouse: Razer Viper V2 Pro", href: "https://www.razer.com/gaming-mice/razer-viper-v2-pro" },
  { label: "Headset: Beyerdynamic DT770", href: "https://www.beyerdynamic.de/p/dt-770-pro" },
  { label: "Monitore: 2x LG Ultragear 27\"", href: "https://www.lg.com/de/monitore/gaming/27gq50f-b/" },
  { label: "Stream Deck XL", href: "https://www.elgato.com/de/de/p/stream-deck-xl" },
  { label: "Puls: Polar H10", href: "https://www.polar.com/de/sensors/h10-heart-rate-sensor" },
  { label: "Cap-Card: AVerMedia Mini", href: "https://www.avermedia.com/de/product-detail/GC311" },
];

// „Beliebt": die drei meistgenutzten Seiten. Bild und Ziel kommen aus navigation.js (id), Titel und Text stehen kürzer
// in startseiteTexte.js (featured). Wer schon Unterseiten besucht hat, sieht stattdessen diese zuerst
// (utils/visitMemory.js, nur im eigenen Browser); freie Plätze füllen die beliebten auf.
const FEATURED = ["cr-minigames", "win-tracker", "win-challenge"];
const FEATURED_COUNT = 3;
const DESKTOP_QUERY = "(min-width: 1024px)"; // ab hier steht der Stream im Kopf (Tailwind lg)
const NEU_GEZEIGT = 3; // so viele neue Updates stehen einzeln da, der Rest als „und N weitere“

const ABOUT = [
  { view: "social", icon: Share2, title: "social", text: "socialText" },
  { view: "setup", icon: MonitorSmartphone, title: "setup", text: "setupText" },
];

// --- HELPER COMPONENTS ---

function SmartLink({ href, className, children, ...props }) {
  if (!href) {
    return <div className={`${className} opacity-50 cursor-not-allowed`}>{children}</div>;
  }
  const isExternal = /^https?:\/\//i.test(href);
  if (!isExternal && href.startsWith("/")) {
    return <Link to={href} className={className} {...props}>{children}</Link>;
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...props}>{children}</a>;
}

// Modal Component für die Overlays
// Der gemeinsame Dialog (components/ui) übernimmt Escape, Klick daneben und den Fokus
function InfoModal({ title, onClose, children }) {
  return (
    <Dialog open onClose={onClose} title={title} width="xl">
      {children}
    </Dialog>
  );
}

function SocialContent() {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SOCIAL_LINKS.map((item) => (
          <SmartLink
            key={item.label}
            href={item.href}
            className={`group relative overflow-hidden rounded-lg bg-white/5 border border-white/10 px-4 py-4 transition-colors ${item.color}`}
          >
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                  {item.icon && (
                      <img
                        src={item.icon}
                        alt={item.label}
                        className="w-5 h-5 object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                  )}
                  <span className="text-sm font-medium">{item.label}</span>
              </div>
              <span className="text-xs opacity-50 group-hover:opacity-100 transition-opacity">↗</span>
            </div>
          </SmartLink>
        ))}
      </div>
    </div>
  );
}

function HardwareContent({ t }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return SETUP_HARDWARE;
    return SETUP_HARDWARE.filter((x) =>
      String(x.label || "").toLowerCase().includes(query)
    );
  }, [q]);

  return (
    <div className="flex flex-col">
      <div className="pb-3 border-b border-line">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t.hardwareSuchen}
          placeholder={t.hardwarePlatzhalter}
        />
      </div>
      <div className="pt-2 space-y-1">
        {filtered.map((item, idx) => (
          <SmartLink
            key={idx}
            href={item.href}
            className="flex items-center justify-between group px-3 py-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
          >
            <span className="text-sm text-white/80 group-hover:text-white truncate pr-4">
              {item.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/20 group-hover:text-accent-soft opacity-0 group-hover:opacity-100 transition-all shrink-0">
              {t.hardwareAnsehen}
            </span>
          </SmartLink>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-white/55">{t.keineHardware}</div>
        )}
      </div>
    </div>
  );
}

/** true, sobald das Fenster zur Abfrage passt — damit der Stream nur an EINER Stelle der Seite geladen wird */
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * Der Stream. Ist der Kanal live (Backend fragt Twitch, utils/useLiveStatus.js), startet der Player von selbst und
 * stumm; sonst lädt er erst auf Klick. Vorher stand er immer da und zeigte, wenn der Kanal offline war, einen großen
 * weißen Kasten mitten auf der dunklen Seite.
 * @param {{ live: { live: boolean, title: string|null, game: string|null }, t: object, lang: string }} props
 */
function StreamTile({ live, t, lang }) {
  // "click": selbst gestartet (mit Ton) · "auto": von selbst gestartet, weil live (stumm — Browser erlauben nichts anderes)
  const [started, setStarted] = useState(null);
  useEffect(() => {
    if (live.live) setStarted((s) => s || "auto");
  }, [live.live]);

  return (
    <div className="w-full rounded-lg border border-line bg-surface overflow-hidden">
      <div className="relative w-full aspect-video bg-black">
        {started ? (
          <iframe
            src={`https://player.twitch.tv/?channel=vnmvalentin&parent=vnmvalentin.de&parent=vnmvalentin.com&parent=localhost${started === "auto" ? "&muted=true" : ""}`}
            width="100%"
            height="100%"
            allowFullScreen
            frameBorder="0"
            title="Twitch Player"
            className="w-full h-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setStarted("click")}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface hover:bg-surface-raised transition-colors"
          >
            <span className="flex items-center justify-center w-11 h-11 rounded-lg bg-twitch group-hover:bg-twitch-hover text-white transition-colors">
              <Play size={18} fill="currentColor" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-white">{t.streamAnsehen}</span>
          </button>
        )}
      </div>
      <a
        href="https://twitch.tv/vnmvalentin"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between px-4 py-2.5 border-t border-line text-xs text-white/55 hover:text-white transition-colors"
      >
        {live.live ? (
          <span className="flex items-center gap-2 min-w-0 text-white/80">
            <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-white shrink-0">{t.live}</span>
            {(live.game || live.title) && <span className="truncate">{live.game || live.title}</span>}
          </span>
        ) : (
          <span>twitch.tv/vnmvalentin</span>
        )}
        <span className="flex items-center gap-1.5 shrink-0 pl-3">{t.kanalOeffnen} <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" /></span>
      </a>
      <LiveGlocke lang={lang} />
    </div>
  );
}

/**
 * „Bei Live benachrichtigen“: schaltet das Thema „live“ der Mitteilungen auf diesem Gerät (utils/mitteilungen.js) —
 * auch ohne Anmeldung. Fehlt, wo es keine Mitteilungen gibt (alte Browser, iPhone ohne installierte App).
 */
function LiveGlocke({ lang }) {
  const t = MITTEILUNGEN_TEXTE.dict(lang);
  const m = useMitteilungen();
  if (!m.unterstuetzt || m.brauchtApp) return null;
  const an = m.themen.includes("live");
  const gesperrt = m.erlaubnis === "denied";
  return (
    <button
      type="button"
      onClick={() => m.setzeThemen(an ? m.themen.filter((x) => x !== "live") : [...m.themen, "live"])}
      disabled={!m.geladen || m.busy || gesperrt}
      aria-pressed={an}
      title={gesperrt ? t.glockeGesperrt : an ? t.glockeAnTitel : t.glockeAusTitel}
      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 border-t border-line text-xs font-semibold transition-colors disabled:opacity-50 ${
        an ? "text-accent-soft hover:text-white" : "text-white/55 hover:text-white hover:bg-white/[0.03]"
      }`}
    >
      {an ? <BellRing size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
      {gesperrt ? t.glockeGesperrt : an ? t.glockeAn : t.glockeAus}
    </button>
  );
}

/** Bilder einer Karte: die Vorschau, sonst das kleine Symbolbild der Unterseite (ganz gezeigt), sonst nur das Symbol */
function cardImages(link) {
  if (link.previews?.length) return link.previews;
  return link.thumb ? [{ src: link.thumb, fit: "contain" }] : [];
}

function Featured({ t, lang }) {
  // Einmal beim Öffnen gelesen: zuletzt besuchte Unterseiten zuerst, den Rest füllen die beliebten auf
  const { cards, recentCount } = useMemo(() => {
    const byId = Object.fromEntries(showcaseLinksFuer(lang).map((l) => [l.id, l]));
    const recent = recentVisited(FEATURED_COUNT).map((l) => byId[l.id] || l).map((link) => ({ link, title: link.label, text: link.description }));
    const taken = new Set(recent.map((c) => c.link.id));
    const popular = FEATURED
      .filter((id) => byId[id] && !taken.has(id))
      .map((id) => ({ link: byId[id], title: t.featured[id].titel, text: t.featured[id].text }));
    return { cards: [...recent, ...popular].slice(0, FEATURED_COUNT), recentCount: recent.length };
  }, [t, lang]);

  const title = recentCount >= FEATURED_COUNT ? t.zuletztBesucht : recentCount > 0 ? t.zuletztUndBeliebt : t.beliebt;
  return (
    <section aria-labelledby="home-featured">
      <SectionHeading id="home-featured" title={title} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
        {cards.map((c, i) => (
          <TileCard key={c.link.id} index={i} to={c.link.to} title={c.title} text={c.text} images={cardImages(c.link)} icon={c.link.icon} />
        ))}
      </div>
    </section>
  );
}

// --- JETZT MITSPIELEN (Backend/mitspielen) ---

/** Hinweis ganz oben, solange ein Stream-Raum offen ist: offen → direkt in den Raum, Warteschlange → /mitspielen */
function MitspielenHinweis({ lang }) {
  const t = MITSPIELEN_TEXTE.dict(lang);
  const m = useMitspielen();
  if (!m.aktiv) return null;
  const ziel = m.modus === "offen" && m.url ? m.url : "/mitspielen";
  return (
    <Link to={ziel} className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-accent/30 bg-accent/10 hover:bg-accent/15 px-4 py-3 transition-colors">
      {m.live && (
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> {t.live}
        </span>
      )}
      <span className="flex items-center gap-2 flex-1 min-w-[12rem] text-sm text-white/85">
        <Gamepad2 size={16} className="text-accent-soft shrink-0" aria-hidden="true" />
        <span>{m.spielName ? t.hinweisSpielt(m.spielName) : t.hinweisRaum}{m.notiz ? ` ${m.notiz}` : ""}</span>
      </span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-accent-soft group-hover:text-white shrink-0">
        {m.modus === "offen" ? t.jetztMitspielen : t.hinweisAnstellen}
        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
      </span>
    </Link>
  );
}

// --- PERSÖNLICH (angemeldet) ---

/** Eine Tagesaufgabe: Titel, Stand in einer Zeile, optional ein schmaler Balken; erledigt mit Haken */
function AufgabeKachel({ a, t }) {
  const anteil = a.fortschritt ? Math.round((Math.min(a.fortschritt.wert, a.fortschritt.max) / Math.max(1, a.fortschritt.max)) * 100) : null;
  return (
    <Link to={a.pfad}
      className="group flex flex-col gap-2 rounded-lg border border-line bg-surface/80 hover:border-white/20 hover:bg-white/[0.03] p-4 transition-colors min-w-0">
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white truncate">{a.titel}</span>
        {a.fertig
          ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300 shrink-0"><Check size={13} aria-hidden="true" /> {t.erledigt}</span>
          : <ArrowRight size={15} className="text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all shrink-0" aria-hidden="true" />}
      </span>
      <span className="text-xs text-white/50 tabular-nums">{a.zeile}</span>
      {anteil !== null && (
        <span className="block h-1.5 rounded-sm bg-white/[0.06] overflow-hidden" aria-hidden="true">
          <span className={`block h-full ${a.fertig ? "bg-emerald-400/70" : "bg-accent"}`} style={{ width: `${anteil}%` }} />
        </span>
      )}
    </Link>
  );
}

function Tagesaufgaben({ t, lang }) {
  const [liste, setListe] = useState(null);
  useEffect(() => {
    let lebt = true;
    ladeTagesaufgaben({ lang }).then((l) => { if (lebt) setListe(l); });
    return () => { lebt = false; };
  }, [lang]);

  return (
    <div>
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/55 mb-3">
        <CalendarCheck size={14} aria-hidden="true" /> {t.heute}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {liste === null
          // Platzhalter in Kachelhöhe, damit beim Laden nichts springt
          ? TAGESAUFGABEN.map((a) => <div key={a.id} className="h-[92px] rounded-lg border border-line bg-surface/50" aria-hidden="true" />)
          : liste.map((a) => <AufgabeKachel key={a.id} a={a} t={t} />)}
      </div>
    </div>
  );
}

/** Link zur Visitenkarte (eingeschaltet) oder zum Einrichten im Profil */
function useVisitenkarte(kontoId) {
  const [karte, setKarte] = useState(null);
  useEffect(() => {
    if (!kontoId) { setKarte(null); return undefined; }
    let lebt = true;
    fetch("/api/public-profile/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (lebt) setKarte(d ? { an: Boolean(d.an), adresse: d.adresse || "" } : null); })
      .catch(() => { /* ohne Stand kein Link */ });
    return () => { lebt = false; };
  }, [kontoId]);
  return karte;
}

function PersoenlicherKopf({ name, konto, t, lang }) {
  const karte = useVisitenkarte(konto?.id);
  const hatStufe = Boolean(konto && konto.spiele?.length > 0);
  return (
    <div className="min-w-0">
      <p className="text-sm text-white/55 mb-2">{t.willkommen}</p>
      <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.05] break-words">{name}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {hatStufe && <span className="font-semibold text-accent-soft">{t.stufe(konto.stufe.stufe)}</span>}
        {karte && (
          <Link to={karte.an && karte.adresse ? `/u/${karte.adresse}` : "/profile?bereich=visitenkarte"}
            className="group inline-flex items-center gap-1.5 text-white/55 hover:text-white">
            {karte.an && karte.adresse ? t.visitenkarteAnsehen : t.visitenkarteEinrichten}
            <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
          </Link>
        )}
      </p>
      <div className="mt-7">
        <Tagesaufgaben t={t} lang={lang} />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button to="/fun" variant="secondary">{t.spieleEntdecken}</Button>
        <Button to="/tools" variant="ghost">{t.toolsFuerStreamer}</Button>
      </div>
    </div>
  );
}

/** „Neu seit deinem letzten Besuch“ — die Updates-Liste ist groß und wird nur für Angemeldete nachgeladen */
function NeuSeitBesuch({ t }) {
  const [neu, setNeu] = useState([]);
  const [neueste, setNeueste] = useState(null);
  useEffect(() => {
    let lebt = true;
    import("../../utils/newData")
      .then(({ NEWS_UPDATES }) => {
        if (!lebt) return;
        setNeueste(NEWS_UPDATES[0]?.version || null);
        setNeu(neueUpdates(NEWS_UPDATES));
      })
      .catch(() => { /* ohne Liste kein Abschnitt */ });
    return () => { lebt = false; };
  }, []);
  if (!neu.length) return null;

  const ausblenden = () => {
    merkeGesehen(neueste);
    setNeu([]);
  };
  return (
    <section aria-labelledby="home-neu">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 id="home-neu" className="flex items-center gap-2 font-display text-lg md:text-xl font-bold text-white tracking-tight">
          <Sparkles size={18} className="text-accent-soft" aria-hidden="true" /> {t.neuTitel}
        </h2>
        <span className="flex items-center gap-3 shrink-0">
          <Link to="/updates" className="text-sm text-white/55 hover:text-white">{t.alleUpdates}</Link>
          <Button variant="ghost" size="sm" icon={X} aria-label={t.ausblenden} title={t.ausblenden} onClick={ausblenden} />
        </span>
      </div>
      <ul className="divide-y divide-white/5 rounded-lg border border-line bg-surface/60">
        {neu.slice(0, NEU_GEZEIGT).map((u) => {
          const { nummer, titel } = teileVersion(u.version);
          return (
            <li key={u.version}>
              <Link to={`/updates?v=${encodeURIComponent(nummer)}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                <span className="shrink-0 text-xs font-mono font-bold text-accent-soft bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-md">{nummer}</span>
                <span className="flex-1 min-w-0 text-sm text-white/80 group-hover:text-white truncate">{titel}</span>
                <span className="hidden sm:inline shrink-0 text-xs font-mono text-white/55">{u.date}</span>
              </Link>
            </li>
          );
        })}
        {neu.length > NEU_GEZEIGT && (
          <li>
            <Link to="/updates" className="block px-4 py-2.5 text-xs text-white/55 hover:text-white">{t.neuWeitere(neu.length - NEU_GEZEIGT)}</Link>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Ohne offenen Raum gar nichts (auch kein Abstand im Raster) */
function MitspielenHinweisRahmen({ lang }) {
  const m = useMitspielen();
  if (!m.aktiv) return null;
  return <div className="-mb-8 md:-mb-14"><MitspielenHinweis lang={lang} /></div>;
}

export default function Home() {
  const { user } = useContext(TwitchAuthContext);
  const { konto } = useKonto();
  const { lang } = useLanguage({ supported: STARTSEITE_TEXTE.langs });
  const t = STARTSEITE_TEXTE.dict(lang);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeModal = searchParams.get("view"); // 'social', 'setup', oder null
  const live = useLiveStatus();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // Der Stream steht im Kopf: am großen Bildschirm immer, auf dem Handy nur während einer Sendung (sonst ganz unten)
  const streamInHead = isDesktop || live.live;
  // Angemeldet: mit Twitch (sofort aus dem Browser bekannt) oder mit einem Konto (Discord, Gast — nach /api/konto/ich).
  // Twitch-Nutzer heißen wie bei Twitch, solange sie sich keinen eigenen Namen gegeben haben (wie im Profil).
  const angemeldet = Boolean(konto || user);
  const name = konto?.nameEigen ? konto.name : (user?.displayName || user?.login || konto?.name || "");

  const openModal = (viewName) => {
    setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set("view", viewName);
        return newParams;
    });
  };

  const closeModal = () => {
    setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete("view");
        return newParams;
    });
  };

  return (
    <Page width="wide" className="py-6 md:py-12">
      <SEO
        title={t.metaTitel}
        description={t.metaBeschreibung}
        path="/"
        lang={lang}
      />
      <div className="flex flex-col gap-14 md:gap-20">
        {/* „Jetzt mitspielen“ nur, solange ein Stream-Raum offen ist — sonst fehlt der Block samt Abstand */}
        <MitspielenHinweisRahmen lang={lang} />

        {/* Kopf: für Neue Aussage + zwei Wege, für Angemeldete ihr Stand; rechts der Stream (startet von selbst, wenn
            live — sonst erst auf Klick) */}
        <header className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-10 lg:gap-16 ${angemeldet ? "items-start" : "items-center"}`}>
          {angemeldet ? (
            <PersoenlicherKopf name={name} konto={konto} t={t} lang={lang} />
          ) : (
            <div className="min-w-0">
              <h1 className="font-display text-4xl md:text-6xl font-bold text-white tracking-tight leading-[1.05] text-balance">
                {t.heroTitel}
              </h1>
              <p className="mt-4 md:mt-5 text-base md:text-lg text-white/55 max-w-xl leading-relaxed">
                {t.heroText}
              </p>
              <div className="mt-7 md:mt-8 flex flex-wrap gap-3">
                <Button to="/fun" size="lg">{t.spieleEntdecken}</Button>
                <Button to="/tools" size="lg" variant="secondary">{t.toolsFuerStreamer}</Button>
              </div>
            </div>
          )}
          {streamInHead && (
            <section aria-label={t.streamBereich}>
              <StreamTile live={live} t={t} lang={lang} />
            </section>
          )}
        </header>

        {angemeldet && <NeuSeitBesuch t={t} />}

        <Featured t={t} lang={lang} />

        <nav aria-labelledby="home-all">
          <SectionHeading id="home-all" title={t.allesAufEinenBlick} />
          <SiteDirectory className="border-t border-line pt-6 md:pt-8" />
        </nav>

        {/* Echte Zahlen, nur wenn sie über ihrer Schwelle liegen (Backend/activity) */}
        <ActivityStrip />

        {/* Über mich: Social Media und Setup (öffnen die Fenster unten, ?view=social|setup) */}
        <section aria-labelledby="home-about">
          <SectionHeading id="home-about" title={t.mehrVon} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ABOUT.map((x) => (
              <button
                key={x.view}
                type="button"
                onClick={() => openModal(x.view)}
                className="group flex items-center gap-4 px-4 py-4 text-left rounded-lg border border-line hover:border-white/20 hover:bg-white/[0.03] transition-colors"
              >
                <x.icon size={19} className="shrink-0 text-white/55 group-hover:text-white/70 transition-colors" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">{t[x.title]}</span>
                  <span className="block text-xs text-white/55 mt-0.5">{t[x.text]}</span>
                </span>
                <ArrowRight size={16} className="text-white/20 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
          {!streamInHead && (
            <section aria-label={t.streamBereich} className="mt-4">
              <StreamTile live={live} t={t} lang={lang} />
            </section>
          )}
        </section>

        {/* Modals prüfen auf den URL Parameter 'view' */}
        {activeModal === 'social' && (
            <InfoModal title={t.social} onClose={closeModal}>
                <SocialContent />
            </InfoModal>
        )}

        {activeModal === 'setup' && (
            <InfoModal title={t.setupDialog} onClose={closeModal}>
                <HardwareContent t={t} />
            </InfoModal>
        )}

      </div>
    </Page>
  );
}
