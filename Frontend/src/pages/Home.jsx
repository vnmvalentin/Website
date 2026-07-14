import { useMemo, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom"; // NEU: useSearchParams
import SEO from "../components/SEO";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Content Card */}
      <div className="relative w-full max-w-2xl bg-[#121212] border border-white/10 rounded-md shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
          <h2 className="text-lg font-bold tracking-wide uppercase text-white/90">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-sm hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            {/* Simple X Icon fallback */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 13 13"/></svg>
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
            className={`group relative overflow-hidden rounded-sm bg-white/5 border border-white/5 px-4 py-4 transition-colors ${item.color}`}
          >
            <div className="relative z-10 flex items-center justify-between">

              {/* NEU: Container für Icon und Text */}
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

              {/* Pfeil bleibt rechts */}
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
      <div className="p-4 border-b border-white/5 bg-black/20">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hardware suchen..."
          className="w-full bg-black/40 border border-white/10 rounded-sm px-4 py-2 text-sm text-white focus:outline-none focus:border-white/30 transition-colors"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {filtered.map((item, idx) => (
          <SmartLink
            key={idx}
            href={item.href}
            className="flex items-center justify-between group px-3 py-3 hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
          >
            <span className="text-sm text-white/80 group-hover:text-white truncate pr-4">
              {item.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/20 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-all shrink-0">
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
    <div className="w-full border border-white/10 bg-black overflow-hidden rounded-sm shadow-lg">
      <div className="relative w-full aspect-video">
        <iframe
          src="https://player.twitch.tv/?channel=vnmvalentin&parent=vnmvalentin.de&parent=vnmvalentin.com&parent=localhost"
          width="100%"
          height="100%"
          allowFullScreen
          frameBorder="0"
          title="Twitch Player"
          className="w-full h-full"
        />
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/5 bg-[#141414]">
        <span className="text-xs font-mono text-white/30 tracking-widest uppercase">vnmvalentin</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
          <span className="text-[10px] font-mono text-white/20 uppercase tracking-wider">Live</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  // NEU: URL Params statt useState
  const [searchParams, setSearchParams] = useSearchParams();
  const activeModal = searchParams.get("view"); // 'social', 'setup', oder null

  // Funktionen zum Öffnen und Schließen, die URL Parameter manipulieren
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
    <div className="min-h-full w-full pb-20 pt-8 px-4 md:px-8">
      <SEO
        title="Home"
        description="Die offizielle Website von vnmvalentin. Streaming, Tools und Community."
        path="/"
      />
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-10">

        <section className="w-full">
           <TwitchTV />
        </section>

        <section className="flex flex-wrap justify-center gap-6 w-full">
            <button
                onClick={() => openModal('social')}
                className="group relative px-8 py-4 w-full sm:w-auto sm:min-w-[320px] bg-[#18181b] border border-white/10 rounded-sm overflow-hidden hover:border-white/20 hover:bg-[#202023] transition-colors"
            >
                <span className="relative font-bold text-base tracking-wide text-white/80 group-hover:text-white uppercase">
                    Social Media
                </span>
            </button>

            <button
                onClick={() => openModal('setup')}
                className="group relative px-8 py-4 w-full sm:w-auto sm:min-w-[320px] bg-[#18181b] border border-white/10 rounded-sm overflow-hidden hover:border-white/20 hover:bg-[#202023] transition-colors"
            >
                <span className="relative font-bold text-base tracking-wide text-white/80 group-hover:text-white uppercase">
                    Mein Setup
                </span>
            </button>
        </section>

        {/* Modals prüfen jetzt auf den URL Parameter 'view' */}
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
