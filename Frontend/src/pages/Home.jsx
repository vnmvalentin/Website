// Home.jsx — die Startseite. Bewusst schlicht (Neubau 12.11.2026): Kopf mit zwei Knöpfen, drei Vorschau-Karten
// (dieselbe TileCard wie auf den Übersichten: für Wiederkehrer „Zuletzt besucht", sonst „Beliebt"), ein
// Text-Verzeichnis aller Bereiche und eine ruhige Zeile zu Social Media und Setup. Der Stream startet von selbst,
// wenn der Kanal live ist. Keine eigenen Schriften oder Spiel-Looks hier — die gehören in die jeweilige Unterseite.
import { useEffect, useMemo, useState, useContext } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SEO from "../components/SEO";
import { Share2, MonitorSmartphone, ArrowRight, Play } from "lucide-react";
import { Button, Dialog, Input, Page, SectionHeading } from "../components/ui";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import ActivityStrip from "../components/ActivityStrip";
import TileCard from "../components/TileCard";
import SiteDirectory from "../components/SiteDirectory";
import { showcaseLinks } from "../config/navigation";
import { recentVisited } from "../utils/visitMemory";
import { useLiveStatus } from "../utils/useLiveStatus";

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

// „Beliebt": die drei meistgenutzten Seiten. Bild und Ziel kommen aus navigation.js (id), der Text ist hier kürzer.
// Wer schon Unterseiten besucht hat, sieht stattdessen diese zuerst (utils/visitMemory.js, nur im eigenen Browser);
// freie Plätze füllen die beliebten auf.
const FEATURED = [
  { id: "cr-minigames", title: "Clash Royale Minigames", text: "Zehn Draft-Modi für 2–8 Spieler — mit Freunden oder dem Chat, ohne Anmeldung." },
  { id: "win-tracker", title: "Win Tracker", text: "OBS-Overlay mit Liga, Trophäen, Deck und den letzten Matches. Aktualisiert sich von selbst." },
  { id: "win-challenge", title: "Win Challenge", text: "OBS-Overlay für deine Challenges mit Zählern, Timer und Chat-Befehlen." },
];
const FEATURED_COUNT = 3;
const DESKTOP_QUERY = "(min-width: 1024px)"; // ab hier steht der Stream im Kopf (Tailwind lg)

const ABOUT = [
  { view: "social", icon: Share2, title: "Social Media", text: "Alle Kanäle auf einen Blick" },
  { view: "setup", icon: MonitorSmartphone, title: "Mein Setup", text: "Hardware & Streaming-Equipment" },
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

function HardwareContent() {
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
          aria-label="Hardware suchen"
          placeholder="Hardware suchen..."
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
              Check
            </span>
          </SmartLink>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-white/30">Keine Hardware gefunden.</div>
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
 * @param {{ live: { live: boolean, title: string|null, game: string|null } }} props
 */
function StreamTile({ live }) {
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
            <span className="text-sm font-semibold text-white">Stream hier ansehen</span>
          </button>
        )}
      </div>
      <a
        href="https://twitch.tv/vnmvalentin"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between px-4 py-2.5 border-t border-line text-xs text-white/45 hover:text-white transition-colors"
      >
        {live.live ? (
          <span className="flex items-center gap-2 min-w-0 text-white/80">
            <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-white shrink-0">Live</span>
            {(live.game || live.title) && <span className="truncate">{live.game || live.title}</span>}
          </span>
        ) : (
          <span>twitch.tv/vnmvalentin</span>
        )}
        <span className="flex items-center gap-1.5 shrink-0 pl-3">Kanal öffnen <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" /></span>
      </a>
    </div>
  );
}

/** Bilder einer Karte: die Vorschau, sonst das kleine Symbolbild der Unterseite (ganz gezeigt), sonst nur das Symbol */
function cardImages(link) {
  if (link.previews?.length) return link.previews;
  return link.thumb ? [{ src: link.thumb, fit: "contain" }] : [];
}

function Featured() {
  // Einmal beim Öffnen gelesen: zuletzt besuchte Unterseiten zuerst, den Rest füllen die beliebten auf
  const { cards, recentCount } = useMemo(() => {
    const byId = Object.fromEntries(showcaseLinks().map((l) => [l.id, l]));
    const recent = recentVisited(FEATURED_COUNT).map((link) => ({ link, title: link.label, text: link.description }));
    const taken = new Set(recent.map((c) => c.link.id));
    const popular = FEATURED
      .filter((f) => byId[f.id] && !taken.has(f.id))
      .map((f) => ({ link: byId[f.id], title: f.title, text: f.text }));
    return { cards: [...recent, ...popular].slice(0, FEATURED_COUNT), recentCount: recent.length };
  }, []);

  const title = recentCount >= FEATURED_COUNT ? "Zuletzt besucht" : recentCount > 0 ? "Zuletzt besucht & beliebt" : "Beliebt";
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

export default function Home() {
  const { user } = useContext(TwitchAuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeModal = searchParams.get("view"); // 'social', 'setup', oder null
  const live = useLiveStatus();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // Der Stream steht im Kopf: am großen Bildschirm immer, auf dem Handy nur während einer Sendung (sonst ganz unten)
  const streamInHead = isDesktop || live.live;

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
        title="Home"
        description="Die offizielle Website von vnmvalentin. Streaming, Tools und Community."
        path="/"
      />
      <div className="flex flex-col gap-14 md:gap-20">

        {/* Kopf: Aussage + zwei Wege, rechts der Stream (startet von selbst, wenn live — sonst erst auf Klick) */}
        <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-10 lg:gap-16 items-center">
          <div className="min-w-0">
            {user && (
              <p className="text-sm text-white/45 mb-3">Willkommen zurück, {user.displayName || user.login}</p>
            )}
            <h1 className="font-display text-4xl md:text-6xl font-bold text-white tracking-tight leading-[1.05] text-balance">
              Spiele, Overlays & Tools vom Stream
            </h1>
            <p className="mt-4 md:mt-5 text-base md:text-lg text-white/55 max-w-xl leading-relaxed">
              Kostenlos, direkt im Browser und ohne Download.
            </p>
            <div className="mt-7 md:mt-8 flex flex-wrap gap-3">
              <Button to="/fun" size="lg">Spiele entdecken</Button>
              <Button to="/tools" size="lg" variant="secondary">Tools für Streamer</Button>
            </div>
          </div>
          {streamInHead && (
            <aside aria-label="Stream auf Twitch">
              <StreamTile live={live} />
            </aside>
          )}
        </header>

        <Featured />

        <nav aria-labelledby="home-all">
          <SectionHeading id="home-all" title="Alles auf einen Blick" />
          <SiteDirectory className="border-t border-line pt-6 md:pt-8" />
        </nav>

        {/* Echte Zahlen, nur wenn sie über ihrer Schwelle liegen (Backend/activity) */}
        <ActivityStrip />

        {/* Über mich: Social Media und Setup (öffnen die Fenster unten, ?view=social|setup) */}
        <section aria-labelledby="home-about">
          <SectionHeading id="home-about" title="Mehr von vnmvalentin" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ABOUT.map((x) => (
              <button
                key={x.view}
                type="button"
                onClick={() => openModal(x.view)}
                className="group flex items-center gap-4 px-4 py-4 text-left rounded-lg border border-line hover:border-white/20 hover:bg-white/[0.03] transition-colors"
              >
                <x.icon size={19} className="shrink-0 text-white/40 group-hover:text-white/70 transition-colors" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">{x.title}</span>
                  <span className="block text-xs text-white/45 mt-0.5">{x.text}</span>
                </span>
                <ArrowRight size={16} className="text-white/20 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
          {!streamInHead && (
            <aside aria-label="Stream auf Twitch" className="mt-4">
              <StreamTile live={live} />
            </aside>
          )}
        </section>

        {/* Modals prüfen auf den URL Parameter 'view' */}
        {activeModal === 'social' && (
            <InfoModal title="Social Media" onClose={closeModal}>
                <SocialContent />
            </InfoModal>
        )}

        {activeModal === 'setup' && (
            <InfoModal title="Mein Streaming Setup" onClose={closeModal}>
                <HardwareContent />
            </InfoModal>
        )}

      </div>
    </Page>
  );
}
