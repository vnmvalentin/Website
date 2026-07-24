// Zentrale Navigations-Struktur — wird von Header, Mobile-Menü und den
// Kategorie-Seiten gemeinsam benutzt. Neue Unterseiten nur hier eintragen.
import {
  Gamepad2,
  Swords,
  Sprout,
  Users,
  Vote,
  Gift,
  Crown,
  Dices,
  Skull,
  TrendingUp,
  Wrench,
  Trophy,
  Grid3x3,
  Music,
  Bot,
  Mail,
  Instagram,
  MessageSquare,
  MessagesSquare,
  Disc,
} from "lucide-react";

export const NAV_CATEGORIES = [
  {
    key: "fun",
    label: "Fun",
    to: "/fun",
    icon: Gamepad2,
    tagline: "Spiele & Zeitvertreib",
    description: "Browser-Games rund um den Stream — direkt spielbar, ohne Download.",
    links: [
      {
        label: "adVentures",
        to: "/adventures",
        icon: Swords,
        description: "Das Action-Adventure: Kämpfe dich durch Räume, sammle Coins und Packs.",
      },
      {
        label: "Virtual Farm",
        to: "/garden",
        icon: Sprout,
        description: "Deine eigene Farm: Pflanzen setzen, ernten und ausbauen.",
      },
      {
        label: "Connect 4",
        to: "/connect4",
        icon: Disc,
        description: "Vier Gewinnt gegen einen Freund — Link teilen und direkt loslegen.",
      },
    ],
  },
  {
    key: "community",
    label: "Community",
    to: "/community",
    icon: Users,
    tagline: "Mitmachen & Abstauben",
    description: "Alles, wo die Community mitentscheidet oder gewinnen kann.",
    links: [
      {
        label: "Abstimmungen",
        to: "/Abstimmungen",
        icon: Vote,
        description: "Stimme bei aktuellen Fragen ab und bestimme mit.",
      },
      {
        label: "Giveaways",
        to: "/Giveaways",
        icon: Gift,
        description: "Aktuelle Verlosungen — mitmachen lohnt sich.",
      },
    ],
  },
  {
    key: "clash-royale",
    label: "Clash Royale",
    to: "/clash",
    icon: Crown,
    tagline: "Challenges & Formate",
    description: "Alle Clash-Royale-Formate vom Stream an einem Ort.",
    links: [
      {
        label: "Mini Games",
        to: "/clash-royale",
        icon: Dices,
        description: "Bingo Royale, Elixir Auction, Snake Royale und mehr.",
      },
      {
        label: "Nuzlocke",
        to: "/nuzlocke",
        icon: Skull,
        description: "Die Nuzlocke-Challenge: Verlorene Karten sind weg.",
      },
      {
        label: "Win Tracker Overlay",
        to: "/clash-royale/win-tracker",
        icon: TrendingUp,
        description: "OBS-Overlay mit Liga, Trophäen, Tagesstatistik und den letzten Matches.",
      },
    ],
  },
  {
    key: "tools",
    label: "Streamer-Tools",
    to: "/tools",
    icon: Wrench,
    tagline: "Kostenlose Tools für Streamer",
    description: "Overlays, Bots und Helfer — kostenlos nutzbar für jeden Streamer.",
    links: [
      {
        label: "Win-Challenge Overlay",
        to: "/WinChallenge-Overlay",
        icon: Trophy,
        description: "Individuelles OBS-Overlay mit Timer, Zählern und Chat-Befehlen.",
      },
      {
        label: "Bingo-Card Generator",
        to: "/Bingo",
        icon: Grid3x3,
        description: "Erstelle Bingo-Karten für deinen Stream — inklusive Overlay.",
      },
      {
        label: "YTM Songrequest (Bot)",
        to: "/tutorial/ytm-bot",
        icon: Music,
        description: "Songrequests über YouTube Music — Anleitung & Setup.",
      },
      {
        label: "Discord-Bot",
        to: "/discord-bot",
        icon: Bot,
        description: "Der Bot für deinen Server: Rollen, Tickets, Live-Pings u.v.m.",
      },
    ],
  },
  {
    key: "contact",
    label: "Contact",
    to: "/contact",
    icon: Mail,
    tagline: "Sag Hallo",
    description: "Fragen, Ideen oder einfach quatschen? Hier erreichst du mich.",
    links: [
      {
        label: "Discord",
        href: "https://discord.gg/ecRJSx2R6x",
        icon: MessagesSquare,
        description: "Der Community-Server — der schnellste Weg zu mir.",
      },
      {
        label: "Instagram",
        href: "https://instagram.com/vnmvalentin",
        icon: Instagram,
        description: "Bilder & Stories abseits des Streams.",
      },
      {
        label: "Feedback",
        action: "feedback",
        icon: MessageSquare,
        description: "Direktes Feedback zur Website — Ideen und Bug-Reports.",
      },
    ],
  },
];

export function getCategory(key) {
  return NAV_CATEGORIES.find((c) => c.key === key) || null;
}
