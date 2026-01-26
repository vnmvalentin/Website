import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";

// --- DATEN ---

const SOCIAL_LINKS = [
  { label: "Twitch", href: "https://twitch.tv/vnmvalentin", color: "hover:bg-[#9146FF] hover:text-white" },
  { label: "Discord", href: "https://discord.gg/ecRJSx2R6x", color: "hover:bg-[#5865F2] hover:text-white" },
  { label: "Instagram", href: "https://instagram.com/vnmvalentin", color: "hover:bg-[#E1306C] hover:text-white" },
  { label: "YouTube", href: "https://youtube.com/@vnmvalentin", color: "hover:bg-[#FF0000] hover:text-white" },
  { label: "Twitter / X", href: "https://x.com/vnmvalentin", color: "hover:bg-black hover:text-white" },
  { label: "TikTok", href: "https://tiktok.com/@vnmvalentin", color: "hover:bg-[#00f2ea] hover:text-black" },
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
      <div className="relative w-full max-w-2xl bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
          <h2 className="text-lg font-bold tracking-wide uppercase text-white/90">{title}</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
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
            className={`group relative overflow-hidden rounded-xl bg-white/5 border border-white/5 px-4 py-4 transition-all duration-300 ${item.color}`}
          >
            <div className="relative z-10 flex items-center justify-between">
              <span className="text-sm font-medium">{item.label}</span>
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
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-white/30 transition-colors"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {filtered.map((item, idx) => (
          <SmartLink
            key={idx}
            href={item.href}
            className="flex items-center justify-between group rounded-lg px-3 py-3 hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
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
    <div className="relative w-full mx-auto group">
      {/* TV Gehäuse */}
      <div className="relative bg-[#202023] rounded-t-3xl rounded-b-[2rem] p-3 md:p-5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] border-t border-x border-white/10 ring-1 ring-black/80">
        
        {/* Screen Container */}
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] border border-white/5">
          <iframe
            src="https://player.twitch.tv/?channel=vnmvalentin&parent=vnmvalentin.de&parent=vnmvalentin.com&parent=localhost"
            width="100%"
            height="100%"
            allowFullScreen
            frameBorder="0"
            title="Twitch Player"
            className="w-full h-full"
          />
          {/* Scanline Effect */}
          <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02]"></div>
        </div>

        {/* TV "Kinn" / Control Panel */}
        <div className="mt-5 bg-[#1a1a1d] rounded-xl border-t border-white/5 p-3 md:p-4 flex items-center justify-between shadow-inner relative overflow-hidden">
          
          {/* Links: Deko Knöpfe (Volume/Channel) */}
          <div className="flex items-center gap-4 pl-2">
            <div className="flex flex-col gap-1.5">
                <div className="w-10 h-1.5 bg-black/40 rounded-full border-b border-white/5"></div>
                <div className="w-10 h-1.5 bg-black/40 rounded-full border-b border-white/5"></div>
            </div>
            {/* Deko Drehregler */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-black to-[#333] border border-white/5 shadow-lg flex items-center justify-center">
                <div className="w-1 h-3 bg-white/20 rounded-full transform rotate-45"></div>
            </div>
          </div>

          {/* Mitte: Power Button */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
             <div className="group/power cursor-pointer relative flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#151515] border border-white/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]">
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-red-900 group-hover/power:bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.2)] group-hover/power:shadow-[0_0_15px_rgba(220,38,38,0.8)] transition-all duration-300"></div>
             </div>
          </div>
          
          {/* Rechts: LEDs & Label */}
          <div className="flex items-center gap-4 pr-2">
            <div className="text-[10px] md:text-[11px] font-mono text-white/10 tracking-widest uppercase hidden sm:block">
               Stereo / 4K
            </div>
            <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500/50 shadow-[0_0_4px_rgba(34,197,94,0.5)] animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-yellow-500/30"></div>
                <div className="w-2 h-2 rounded-full bg-red-500/20"></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Ambilight Glow */}
      <div className="absolute -inset-4 bg-purple-500/20 blur-3xl -z-10 rounded-[40%] opacity-20 pointer-events-none" />
    </div>
  );
}

export default function Home() {
  const [activeModal, setActiveModal] = useState(null); // 'social', 'setup', or null

  return (
    <div className="min-h-full w-full pb-20 pt-8 px-4 md:px-8">
      {/* Container jetzt viel breiter: max-w-7xl statt max-w-4xl */}
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-10">
        
        {/* Sektion 1: Der Fernseher */}
        <section className="w-full">
           <TwitchTV />
        </section>

        {/* Sektion 2: Buttons unter dem TV */}
        <section className="flex flex-wrap justify-center gap-6 w-full">
            <button
                onClick={() => setActiveModal('social')}
                // Button breiter gemacht mit min-w-[320px] und mehr padding
                className="group relative px-8 py-4 min-w-[320px] bg-[#18181b] border border-white/10 rounded-full overflow-hidden hover:border-white/20 hover:bg-[#202023] transition-all shadow-lg active:scale-95"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative font-bold text-base tracking-wide text-white/80 group-hover:text-white uppercase">
                    Social Media
                </span>
            </button>

            <button
                onClick={() => setActiveModal('setup')}
                className="group relative px-8 py-4 min-w-[320px] bg-[#18181b] border border-white/10 rounded-full overflow-hidden hover:border-white/20 hover:bg-[#202023] transition-all shadow-lg active:scale-95"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative font-bold text-base tracking-wide text-white/80 group-hover:text-white uppercase">
                    Mein Setup
                </span>
            </button>
        </section>

        {/* Overlays / Modals */}
        {activeModal === 'social' && (
            <InfoModal title="Social Media" onClose={() => setActiveModal(null)}>
                <SocialContent />
            </InfoModal>
        )}

        {activeModal === 'setup' && (
            <InfoModal title="Mein Streaming Setup" onClose={() => setActiveModal(null)}>
                <HardwareContent />
            </InfoModal>
        )}
        
      </div>
    </div>
  );
}