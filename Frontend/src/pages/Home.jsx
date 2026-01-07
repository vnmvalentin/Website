import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const HOME_BANNER = {
  // Banner oben im Hero-Block (über dem Twitch-Player) – über volle Breite der Box.
  // enabled: false => wird nicht angezeigt
  enabled: true,
  text: "🔥 Neue Casino-Seite 🎰!",
  subtext: "Hole die täglich 500 Credits ab und verspiele sie oder ziehe Packs.",
  href: "/Casino", // kann auch eine externe URL sein
  cta: "Ansehen",
};

const SOCIAL_LINKS = [
  { label: "Twitch", href: "https://twitch.tv/vnmvalentin" },
  { label: "Discord", href: "https://discord.gg/ecRJSx2R6x" },
  { label: "Instagram", href: "https://instagram.com/vnmvalentin" },
  { label: "YouTube", href: "https://youtube.com/@vnmvalentin" },
  { label: "Twitter", href: "https://x.com/vnmvalentin" },
  { label: "TikTok", href: "https://tiktok.com/@vnmvalentin" },
];

const SETUP_HARDWARE = [
  // Trage hier dein Setup ein (Name + Link). Wenn href leer ist, wird der Eintrag ausgegraut.
  {
    label: "CPU: Ryzen 9 7950x",
    href: "https://www.amd.com/de/products/processors/desktops/ryzen/7000-series/amd-ryzen-9-7950x.html",
  },
  {
    label: "GPU: Nvidia RTX 4070 Ti SUPER",
    href: "https://rog.asus.com/de/graphics-cards/graphics-cards/rog-strix/rog-strix-rtx4070tis-o16g-gaming/",
  },
  {
    label: "RAM: 32GB DDR5 5200Mhz",
    href: "https://www.corsair.com/de/de/p/memory/cmh32gx5m2b5200c40/vengeance-rgb-32gb-2x16gb-ddr5-dram-5200mhz-c40-memory-kit-black-cmh32gx5m2b5200c40",
  },
  {
    label: "Mainboard: Asus Prime X670-P",
    href: "https://www.asus.com/de/motherboards-components/motherboards/prime/prime-x670-p/",
  },
  {
    label: "SSD 1: Samsung 980 Pro 2TB",
    href: "https://semiconductor.samsung.com/consumer-storage/internal-ssd/980pro/",
  },
  {
    label: "SSD 2: Kingston SA2000M8 1TB",
    href: "https://www.kingston.com/datasheets/SA2000_de.pdf",
  },
  {
    label: "Power Supply: 850W System Power 13 be quiet!",
    href: "https://www.bequiet.com/de/powersupply/4043",
  },
  {
    label: "Wasserkühlung: Golden Field SF240 AiO",
    href: "https://www.amazon.de/dp/B07QPZMNQ2?th=1",
  },
  {
    label: "Gehäuse: NZXT H7 Elite",
    href: "https://nzxt.com/de-intl/products/h7-elite",
  },
  { label: "Mikrofon: RODE NT-USB", href: "https://rode.com/de-de/products/nt-usb" },
  {
    label: "Kamera: Razer Kiyo Pro",
    href: "https://www.razer.com/de-de/streaming-cameras/razer-kiyo-pro",
  },
  {
    label: "Tastatur: Roccat Magma",
    href: "https://de.turtlebeach.com/products/magma-keyboard?Layout=DE",
  },
  {
    label: "Maus: Razer Viper V2 Pro",
    href: "https://www.razer.com/gaming-mice/razer-viper-v2-pro",
  },
  {
    label: "Kopfhörer: Beyerdynamic DT770 Pro",
    href: "https://www.beyerdynamic.de/p/dt-770-pro",
  },
  {
    label: "Monitore (2x): LG Ultragear 27 Zoll 165Hz",
    href: "https://www.lg.com/de/monitore/gaming/27gq50f-b/",
  },
  {
    label: "Stream Deck: Elgato Stream Deck XL",
    href: "https://www.elgato.com/de/de/p/stream-deck-xl",
  },
  {
    label: "Pulsmesssensor: Polar H10",
    href: "https://www.polar.com/de/sensors/h10-heart-rate-sensor",
  },
  {
    label: "Capture Card: AVerMedia Live Gamer Mini",
    href: "https://www.avermedia.com/de/product-detail/GC311",
  },
];

function SmartLink({ href, className, children }) {
  if (!href) {
    return <div className={`${className} opacity-50 cursor-not-allowed`}>{children}</div>;
  }

  const isExternal = /^https?:\/\//i.test(href);

  if (!isExternal && href.startsWith("/")) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function LinksCard({ title, items }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((x) =>
      String(x.label || "").toLowerCase().includes(query)
    );
  }, [items, q]);

  const showSearch = items.length >= 8;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur p-4 flex flex-col h-[380px] md:h-[420px]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold tracking-[0.15em] uppercase text-white/70">
          {title}
        </div>
        <div className="text-xs text-white/50">{filtered.length}</div>
      </div>

      {showSearch && (
        <div className="mt-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen…"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/20"
          />
        </div>
      )}

      <div className="mt-3 space-y-2 flex-1 overflow-y-auto pr-1">
        {filtered.map((item) => (
          <SmartLink
            key={item.label}
            href={item.href}
            className="group block rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">{item.label}</div>
              <div className="text-xs text-white/40 group-hover:text-white/60">
                ↗
              </div>
            </div>
          </SmartLink>
        ))}

        {filtered.length === 0 && (
          <div className="text-sm text-white/50 border border-white/10 rounded-xl bg-black/30 px-3 py-2">
            Keine Treffer.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-full flex flex-col">
      {/* Full-Width Banner (zieht die Layout-Paddings ab, damit es wirklich bis zum Rand geht) */}
      {HOME_BANNER?.enabled && (
        <SmartLink
          href={HOME_BANNER.href}
          className="block relative w-[calc(100%+2rem)] md:w-[calc(100%+3rem)] -mx-4 md:-mx-6 -mt-4 md:-mt-6 border-b border-white/10 bg-gradient-to-r from-orange-500/35 via-red-500/30 to-amber-500/25 hover:from-orange-500/45 hover:via-red-500/40 hover:to-amber-500/35 transition-colors"
        >
          <div className="px-4 md:px-6 py-4 md:py-5">
            <div className="mx-auto max-w-5xl text-center flex flex-col items-center">
              <div className="flex items-center justify-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-300 opacity-50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-300" />
                </span>

                <div className="text-lg md:text-2xl font-extrabold tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
                  {HOME_BANNER.text}
                </div>
              </div>

              {HOME_BANNER.subtext && (
                <div className="mt-1 text-sm md:text-base text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
                  {HOME_BANNER.subtext}
                </div>
              )}

              {HOME_BANNER.cta && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-4 py-2 text-sm md:text-base font-semibold backdrop-blur">
                  {HOME_BANNER.cta} <span aria-hidden>→</span>
                </div>
              )}
            </div>
          </div>
        </SmartLink>
      )}

      {/* Restlicher Content bleibt mittig */}
      <div className="flex-1 pt-6 pb-40 flex flex-col items-center justify-start">
        <div className="w-full max-w-4xl mx-auto">
          {/* Hero-Box: Twitch */}
          <div className="w-full rounded-2xl overflow-hidden border border-white/10 bg-black/30">
            <div className="w-full h-[320px] relative">
              <iframe
                src="https://player.twitch.tv/?channel=vnmvalentin&parent=vnmvalentin.de&parent=vnmvalentin.com"
                width="100%"
                height="100%"
                allowFullScreen
                frameBorder="0"
                title="Twitch Player"
              />
            </div>
          </div>

          {/* Neue Boxen / Tabs */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <LinksCard title="Social Media" items={SOCIAL_LINKS} />
            <LinksCard title="Setup Hardware" items={SETUP_HARDWARE} />
          </div>
        </div>
      </div>
    </div>
  );
}
