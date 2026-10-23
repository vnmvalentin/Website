import { useMemo, useEffect, useState, useContext } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SEO from "../components/SEO";
import { Share2, MonitorSmartphone, ArrowRight, X } from "lucide-react";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import ActivityStrip from "../components/ActivityStrip";
import HomeDoors from "../components/HomeDoors";

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
function InfoModal({ title, onClose, children }) {
  // Schließen bei ESC-Taste
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Content Card */}
      <div className="relative w-full max-w-2xl panel-strong shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-0 overflow-hidden flex-1 relative">
           {children}
        </div>
      </div>
    </div>
  );
}

function SocialContent() {
  return (
    <div className="p-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
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
    <div className="flex flex-col h-full max-h-[60vh]">
      <div className="p-4 border-b border-white/10">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hardware suchen..."
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {filtered.map((item, idx) => (
          <SmartLink
            key={idx}
            href={item.href}
            className="flex items-center justify-between group px-3 py-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
          >
            <span className="text-sm text-white/80 group-hover:text-white truncate pr-4">
              {item.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/20 group-hover:text-violet-300 opacity-0 group-hover:opacity-100 transition-all shrink-0">
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

function TwitchTV() {
  return (
    <div className="w-full panel overflow-hidden shadow-2xl shadow-black/40">
      <div className="relative w-full aspect-video bg-black">
        <iframe
          src="https://player.twitch.tv/?channel=vnmvalentin&parent=vnmvalentin.de&parent=vnmvalentin.com&parent=localhost"
          width="100%"
          height="100%"
          allowFullScreen
          frameBorder="0"
          title="Twitch Player"
          loading="lazy"
          className="w-full h-full"
        />
      </div>
      {/* Hier stand früher fest "● Live" — auch wenn der Kanal offline war und der Player
          direkt darüber "OFFLINE" zeigte. Den Zustand kennt nur der Player, deshalb steht
          hier jetzt ein Link zum Kanal statt einer Behauptung. */}
      <a
        href="https://twitch.tv/vnmvalentin"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between px-4 py-2.5 border-t border-white/10 text-xs text-white/40 hover:text-white transition-colors"
      >
        <span>twitch.tv/vnmvalentin</span>
        <span className="flex items-center gap-1.5">Kanal öffnen <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" /></span>
      </a>
    </div>
  );
}

export default function Home() {
  const { user } = useContext(TwitchAuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeModal = searchParams.get("view"); // 'social', 'setup', oder null

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
    <div className="page-fade min-h-full w-full pb-20 pt-6 md:pt-10 px-2 md:px-4">
      <SEO
        title="Home"
        description="Die offizielle Website von vnmvalentin. Streaming, Tools und Community."
        path="/"
      />
      <div className="max-w-7xl mx-auto flex flex-col gap-10 md:gap-12">

        {/* Kopf: Frage links, Stream klein rechts (statt großem Fernseher) */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-end">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-2">
              {user ? `Willkommen, ${user.displayName || user.login}` : "vnmvalentin.de"}
            </p>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight mb-3">Was führt dich her?</h1>
            <p className="text-white/50 text-sm md:text-base max-w-2xl">
              Tools für Streamer, alles rund um Clash Royale und Browserspiele — kostenlos und ohne Download.
            </p>
          </div>
          <aside className="hidden lg:block">
            <p className="text-xs font-bold uppercase tracking-widest text-white/45 mb-3">Auf Twitch</p>
            <TwitchTV />
          </aside>
        </section>

        {/* Die drei Türen: je bis zu 4 Einträge, meistbesuchte zuerst (components/HomeDoors.jsx) */}
        <HomeDoors />

        {/* Echte Zahlen, nur wenn sie über ihrer Schwelle liegen (Backend/activity) */}
        <ActivityStrip />

        {/* Über mich: Social Media und Setup (öffnen die Fenster unten, ?view=social|setup) */}
        <section aria-label="Über vnmvalentin" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { view: "social", icon: Share2, title: "Social Media", text: "Alle Kanäle auf einen Blick" },
            { view: "setup", icon: MonitorSmartphone, title: "Mein Setup", text: "Hardware & Streaming-Equipment" },
          ].map((x) => (
            <button
              key={x.view}
              type="button"
              onClick={() => openModal(x.view)}
              className="group flex items-center gap-4 p-4 text-left rounded-2xl bg-[#13131c] border border-white/10 hover:border-violet-400/40 transition-colors"
            >
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
                <x.icon size={19} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-white">{x.title}</span>
                <span className="block text-xs text-white/40 mt-0.5">{x.text}</span>
              </span>
              <ArrowRight size={16} className="text-white/20 group-hover:text-violet-300 group-hover:translate-x-1 transition-all shrink-0" />
            </button>
          ))}
        </section>

        <aside className="lg:hidden">
          <p className="text-xs font-bold uppercase tracking-widest text-white/45 mb-3">Auf Twitch</p>
          <TwitchTV />
        </aside>

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
    </div>
  );
}
