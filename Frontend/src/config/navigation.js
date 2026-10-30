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
  BarChart3,
  Grid3x3,
  Music,
  Bot,
  Mail,
  MessageSquare,
  MessagesSquare,
  Disc,
  Flag,
  Volleyball,
  Goal,
  Flame,
  Flashlight,
  PersonStanding,
  HelpCircle,
} from "lucide-react";
import { InstagramGlyph } from "../components/BrandGlyphs";
// Kleine Symbolbilder (thumb) — Clash-Royale-Grafiken NUR für Clash-Royale-Seiten, der Rest aus public/media/icons
import crCrownImg from "../assets/clashRoyale/ui/crown.png";
import crTrophyImg from "../assets/clashRoyale/ui/trophy.png";
import crKingImg from "../assets/clashRoyale/ui/king_blue.webp";
import crSkullImg from "../assets/clashRoyale/ui/sudden_death.webp";
import crQuestionImg from "../assets/clashRoyale/ui/question.webp";
import crSwordImg from "../assets/clashRoyale/ui/sword.webp";
import crTvImg from "../assets/clashRoyale/ui/tv.webp";
import crScrollImg from "../assets/clashRoyale/ui/icon_daily_task_scroll_opened.png";
import crSearchImg from "../assets/clashRoyale/ui/search.webp";
import crEyeImg from "../assets/clashRoyale/ui/eye.webp";

// Vorschaubilder der Unterseiten (Startseite, Türen, Übersichtsseiten) — erzeugt mit scripts/vorschaubilder.cjs
// fit: "cover" füllt die Karte (Spiele, Seiten), "contain" zeigt das ganze Bild (Overlays sind kleine Ausschnitte)
// thumb: kleines Symbolbild (Startseite, Schnell weiter) — erzeugt mit scripts/vorschaubilder.cjs icons
const icon = (id) => `/media/icons/${id}.webp`;
const preview = (id, fit = "cover") => ({ src: `/media/previews/${id}.webp`, fit });

export const NAV_CATEGORIES = [
  {
    key: "fun",
    label: "Fun",
    thumb: icon("blobby"),
    to: "/fun",
    icon: Gamepad2,
    tagline: "Spiele & Zeitvertreib",
    description: "Browser-Games rund um den Stream — direkt spielbar, ohne Download.",
    links: [
      {
        label: "adVentures",
        to: "/adventures",
        id: "adventures",
        thumb: icon("adventures"),
        previews: [preview("adventures")],
        icon: Swords,
        description: "Roguelite: Kit wählen, Items stapeln, Bosse besiegen — je länger du brauchst, desto härter wird es.",
      },
      {
        label: "Virtual Farm",
        to: "/garden",
        id: "garden",
        thumb: "/garden-assets/animals/huhn/1.png",
        previews: [preview("garden")],
        icon: Sprout,
        description: "Deine eigene Farm: Pflanzen setzen, ernten und ausbauen.",
      },
      {
        label: "Connect 4",
        to: "/connect4",
        id: "connect4",
        thumb: icon("connect4"),
        previews: [preview("connect4")],
        icon: Disc,
        description: "Vier Gewinnt gegen einen Freund — Link teilen und direkt loslegen.",
      },
      {
        // Die Sperre ist gefallen: Grund war nicht der Spielcode, sondern der alte Host, der
        // die VM bis 245 ms einfror. Auf der neuen Maschine misst loopProbe.js 1,2 ms typisch
        // und null Blockaden > 40 ms. `locked`/`lockedNote` bleiben in Layout/CategoryPage
        // unterstützt, falls wieder einmal ein Punkt still gelegt werden muss.
        label: "Blobby Volley",
        to: "/blobby",
        id: "blobby",
        thumb: icon("blobby"),
        previews: [preview("blobby")],
        icon: Volleyball,
        description: "Strandvolleyball im Browser — 1v1 oder 2v2, mit Powerups. Link teilen und spielen.",
      },
      {
        label: "Seed Runners",
        to: "/seed-runners",
        id: "seed-runners",
        thumb: icon("seed-runners"),
        previews: [preview("seed-runners")],
        icon: Flag,
        description: "Speedrun-Rennen im Browser: alle laufen dasselbe Zufallslevel, wer zuerst im Ziel ist, gewinnt.",
      },
      {
        label: "Sacrifice & Sigils",
        to: "/sacrifice-and-sigils",
        id: "sacrifice-and-sigils",
        thumb: "/media/cards/bestien_grauwolf.webp",
        previews: [preview("sacrifice-and-sigils")],
        icon: Flame,
        description: "Düsteres 1v1-Kartenspiel: draften, opfern, die Waage neigen. Online oder gegen die KI.",
      },
      {
        label: "Flick Soccer",
        to: "/flick-soccer",
        id: "flick-soccer",
        thumb: icon("flick-soccer"),
        previews: [preview("flick-soccer")],
        icon: Goal,
        description: "Scheiben-Fußball Zug um Zug: Formation wählen, Kronkorken zurückziehen und abschießen. Gegen die KI, zu zweit oder online.",
      },
      {
        label: "Lights Out",
        to: "/lights-out",
        id: "lights-out",
        thumb: icon("lights-out"),
        previews: [preview("lights-out")],
        icon: Flashlight,
        description: "Horror in vier Ebenen: Wald, Anstalt, Keller, Garten. Mit der Taschenlampe haushalten, Rätsel lösen und vier Monstern entkommen — allein oder im Koop mit bis zu vier Leuten.",
      },
    ],
  },
  {
    key: "community",
    label: "Community",
    thumb: icon("giveaways"),
    to: "/community",
    icon: Users,
    tagline: "Mitmachen & Abstauben",
    description: "Alles, wo die Community mitentscheidet oder gewinnen kann.",
    links: [
      {
        label: "Abstimmungen",
        to: "/Abstimmungen",
        id: "abstimmungen",
        thumb: icon("abstimmungen"),
        previews: [preview("abstimmungen")],
        icon: Vote,
        description: "Stimme bei aktuellen Fragen ab und bestimme mit.",
      },
      {
        label: "Giveaways",
        to: "/Giveaways",
        id: "giveaways",
        thumb: icon("giveaways"),
        previews: [preview("giveaways")],
        icon: Gift,
        description: "Aktuelle Verlosungen — mitmachen lohnt sich.",
      },
      {
        label: "Tanzfigur",
        to: "/tanzfigur",
        id: "tanzfigur",
        icon: PersonStanding,
        description: "Bau dir deine Figur — sie tanzt beim Stream-Start auf der Tanzfläche mit.",
      },
    ],
  },
  {
    key: "clash-royale",
    label: "Clash Royale",
    // Tür der Startseite: der König ist sofort als Clash Royale erkennbar (die Krone trägt der Eintrag Mini Games)
    thumb: crKingImg,
    to: "/clash",
    icon: Crown,
    tagline: "Challenges & Formate",
    description: "Alle Clash-Royale-Formate vom Stream an einem Ort.",
    // seoTitle/seoDescription/keywords gehen nur in die Meta-Tags (siehe CategoryPage) —
    // sichtbar bleibt die kurze description oben.
    seoTitle: "Clash Royale Minigames, Nuzlocke & Overlays",
    seoDescription:
      "Alle Clash-Royale-Formate an einem Ort: Multiplayer-Minigames für 2–8 Spieler im Browser, die Nuzlocke-Challenge und ein kostenloses Win-Tracker-Overlay für OBS mit Liga, Medaillen und Tagesstatistik.",
    keywords:
      "Clash Royale Minigames, Clash Royale Nuzlocke, Clash Royale Overlay, Clash Royale Draft, Clash Royale Browserspiel, Clash Royale Stream",
    links: [
      {
        label: "Mini Games",
        to: "/clash-royale",
        id: "cr-minigames",
        thumb: crCrownImg,
        previews: [preview("cr-minigames")],
        icon: Dices,
        description: "Bingo Royale, Elixier Auktion, Snake Royale und mehr.",
      },
      {
        label: "Nuzlocke",
        to: "/nuzlocke",
        id: "nuzlocke",
        thumb: crSkullImg,
        previews: [preview("nuzlocke")],
        icon: Skull,
        description: "Die Nuzlocke-Challenge: Verlorene Karten sind weg.",
      },
      {
        label: "Win Tracker Overlay",
        to: "/clash-royale/win-tracker",
        id: "win-tracker",
        thumb: crTrophyImg,
        previews: [preview("win-tracker", "contain")],
        icon: TrendingUp,
        description: "OBS-Overlay mit Liga, Trophäen, Tagesstatistik und den letzten Matches.",
      },
      // Chat-Quiz-Overlay für Streamer (pages/ClashRoyale/clash/ViewerGamesPage.jsx)
      {
        label: "Viewer Games",
        to: "/clash/viewer-games",
        id: "cr-viewer-games",
        thumb: crTvImg,
        icon: TrendingUp,
        description: "Chat-Quiz als OBS-Overlay: dein Chat errät Karten mit !tipp.",
      },
      // Kartenrätsel (pages/ClashRoyale/clash/) — allein spielbar, mit Tageskarte
      {
        label: "Karten-Wordle",
        to: "/clash/wordle",
        id: "cr-wordle",
        thumb: crScrollImg,
        icon: HelpCircle,
        description: "Rate die Karte des Tages — jede Eigenschaft zeigt, wie nah du dran bist.",
      },
      {
        label: "Kartenraten",
        to: "/clash/kartenraten",
        id: "cr-kartenraten",
        thumb: crQuestionImg,
        icon: HelpCircle,
        description: "24 Karten, ein Hinweis pro Runde — klapp aus, was es nicht sein kann.",
      },
      {
        label: "Wer bin ich?",
        to: "/clash/wer-bin-ich",
        id: "cr-wer-bin-ich",
        thumb: crKingImg,
        icon: HelpCircle,
        description: "Das Klappbrett-Spiel zu zweit mit Clash-Royale-Karten.",
      },
      {
        label: "Stats-Duell",
        to: "/clash/stats-duell",
        id: "cr-stats-duell",
        thumb: crSwordImg,
        icon: TrendingUp,
        description: "Höher oder tiefer mit echten Kampfwerten: Leben, Schaden, Tempo, Reichweite.",
      },
      {
        label: "Zoom-Raten",
        to: "/clash/zoom",
        id: "cr-zoom",
        thumb: crSearchImg,
        icon: HelpCircle,
        description: "Erkennst du die Karte an einem winzigen, stark vergrößerten Ausschnitt?",
      },
      {
        label: "Pixel-Raten",
        to: "/clash/pixel",
        id: "cr-pixel",
        thumb: crEyeImg,
        icon: HelpCircle,
        description: "Die Karte ist extrem verpixelt — alle zwei Versuche wird sie schärfer.",
      },
    ],
  },
  {
    key: "tools",
    label: "Streamer-Tools",
    thumb: icon("streamer"),
    to: "/tools",
    icon: Wrench,
    tagline: "Kostenlose Tools für Streamer",
    description: "Overlays, Bots und Helfer — kostenlos nutzbar für jeden Streamer.",
    links: [
      {
        label: "Win-Challenge Overlay",
        to: "/WinChallenge-Overlay",
        id: "win-challenge",
        thumb: icon("win-challenge"),
        previews: [preview("win-challenge", "contain")],
        icon: Trophy,
        description: "Individuelles OBS-Overlay mit Timer, Zählern und Chat-Befehlen.",
      },
      {
        label: "Twitch-Overlay-Tools",
        to: "/twitch-tools",
        id: "twitch-tools",
        thumb: icon("twitch-tools"),
        previews: [preview("twitch-poll", "contain"), preview("twitch-prediction", "contain"), preview("twitch-goal", "contain"), preview("twitch-stats", "contain")],
        icon: BarChart3,
        description: "Umfragen, Vorhersagen, Ziele und Stream-Statistik als OBS-Overlay.",
      },
      {
        label: "Bingo-Card Generator",
        to: "/Bingo",
        id: "bingo",
        thumb: icon("bingo"),
        previews: [preview("bingo")],
        icon: Grid3x3,
        description: "Erstelle Bingo-Karten für deinen Stream — inklusive Overlay.",
      },
      {
        label: "YTM Songrequest (Bot)",
        to: "/tutorial/ytm-bot",
        id: "ytm-bot",
        thumb: icon("ytm-bot"),
        previews: [{ src: "/media/vorschau_ytmbot.png", fit: "cover" }],
        icon: Music,
        description: "Songrequests über YouTube Music — Anleitung & Setup.",
      },
      {
        label: "Discord-Bot",
        to: "/discord-bot",
        id: "discord-bot",
        thumb: icon("discord-bot"),
        previews: [preview("discord-bot")],
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
        icon: InstagramGlyph,
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

/** Alle Unterseiten mit Vorschau, flach (für Startseite und "Schnell weiter") — ohne noch nicht fertige */
export function showcaseLinks() {
  return NAV_CATEGORIES.flatMap((c) => c.links.filter((l) => l.id && l.to && !l.soon && !l.locked).map((l) => ({ ...l, category: c.key })));
}

export function getCategory(key) {
  return NAV_CATEGORIES.find((c) => c.key === key) || null;
}
