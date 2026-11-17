// landingTexts.js — Texte der Einstiegsseite des Discord-Bots /tools/discord-bot auf Deutsch und Englisch
// (Ausbauplan „discord-verzeichnis“, Spur C).
//
// Wozu eine eigene Seite: /discord-bot ist das Dashboard und zeigt Besuchern nur die Anmeldung. Bot-Listen,
// Discords App-Verzeichnis und die Begrüßung des Bots auf neuen Servern brauchen eine Seite, die für alle gleich
// aussieht und erklärt, was der Bot kann — vorgerendert, mit Link-Vorschau. Aufbau wie die Produktseiten der
// Overlays (StreamerTools/ProductPage.jsx).
//
// Nur belegte Funktionen: jede Aussage ist im Code des Bots nachgesehen (Backend/discord). Bewusst NICHT drin:
// die Live-Rolle — sie braucht Discords Presence-Berechtigung, die der Bot derzeit nicht anfragt.
// Dieselben Listen landen in den strukturierten Daten (buildLandingJsonLd).
import { defineMessages } from "../../i18n/core.js";

export const LANDING_PATH = "/tools/discord-bot";
export const LANDING_IMAGE = "/media/previews/discord-bot.webp";

const de = {
  ui: {
    back: "Streamer-Tools",
    add: "Zu Discord hinzufügen",
    dashboard: "Dashboard öffnen",
    facts: "Kostenlos · Deutsch und Englisch · eingerichtet im Browser, ohne Befehle",
    servers: (n) => (n === 1 ? "Läuft auf 1 Server" : `Läuft auf ${n.toLocaleString("de-DE")} Servern`),
    previewNote: "So schreibt der Bot in deinem Server — Beispiel mit erfundenen Namen.",
    featuresHeading: "Was der Bot kann",
    alsoHeading: "Außerdem",
    stepsHeading: "In drei Schritten eingerichtet",
    faqHeading: "Häufige Fragen",
    legalHeading: "Rechtliches",
    privacy: "Datenschutzerklärung des Bots",
    terms: "Nutzungsbedingungen des Bots",
    home: "Startseite",
  },
  name: "Discord-Bot",
  seoTitle: "Discord-Bot: Rollen, Tickets, Begrüßung",
  description:
    "Kostenloser Discord-Bot mit Dashboard: Begrüßung, Rollen-Buttons, Tickets, Twitch-Livemeldungen, eigene Voice-Kanäle und Punkte.",
  keywords:
    "Discord Bot, Discord Bot deutsch, Discord Willkommensnachricht, Discord Rollen Buttons, Discord Ticket Bot, " +
    "Discord Twitch Benachrichtigung, Discord Voice Kanäle, Discord Punkte System",
  kicker: "Für Discord-Server",
  h1: "Der Discord-Bot für deine Community",
  lead:
    "Neue Mitglieder begrüßen, Rollen per Knopf verteilen, Support-Tickets, Livemeldungen von Twitch und eigene " +
    "Voice-Kanäle — alles im Browser eingerichtet, ohne einen Befehl zu lernen.",
  features: [
    {
      title: "Begrüßung und Abschied",
      text: "Als schlichte Nachricht, als Karte mit Profilbild oder als gezeichnetes Bild in fünf Layouts. Platzhalter für Name, Server und Mitgliedsnummer.",
    },
    {
      title: "Rollen per Knopf",
      text: "Panels mit Knöpfen, über die sich Mitglieder Rollen selbst geben — mehrere oder genau eine. Dazu Auto-Rollen und Rollen nur für Booster.",
    },
    {
      title: "Support-Tickets",
      text: "Ein Knopf öffnet ein kurzes Formular und danach einen privaten Kanal für das Mitglied und dein Team. Mit Verlauf im Dashboard.",
    },
    {
      title: "Twitch-Livemeldungen",
      text: "Geht ein Twitch-Kanal live, schreibt der Bot eine Nachricht mit eigener Vorlage in deinen Kanal — für beliebig viele Kanäle.",
    },
    {
      title: "Eigene Voice-Kanäle",
      text: "Wer den Auslöser-Kanal betritt, bekommt einen eigenen Voice-Kanal. Limit, Sperren, Umbenennen, Verstecken und Rauswerfen per Befehl.",
    },
    {
      title: "Punkte und Mini-Spiele",
      text: "Punkte fürs Schreiben, für Voice-Zeit und mit /daily. Einsetzen im Glücksrad, in der Rakete oder im Duell, dazu eine Rangliste.",
    },
    {
      title: "Server-Statistik",
      text: "Nachrichten und Voice-Zeit je Mitglied und Kanal für bis zu 90 Tage — im Dashboard und per /serverstats.",
    },
    {
      title: "Genehmigungen",
      text: "Mitglieder stellen per Knopf eine Anfrage, dein Team stimmt in einem privaten Thread ab. Genehmigt gibt es eine Rolle oder einen Kanal.",
    },
    {
      title: "Deutsch und Englisch",
      text: "Der Bot schreibt je Server auf Deutsch oder Englisch. Neue Server starten in ihrer Server-Sprache, das Dashboard gibt es in beiden Sprachen.",
    },
  ],
  also: [
    "Kanäle nur für Bilder, auf Wunsch mit Slowmode",
    "Taverne: ein Kanal, der Server mit dem Bot verbindet",
    "Spaß-Befehle wie /ship, /coinflip und /superkraft",
    "Einrichtungs-Check, der fehlende Rechte mit Kanal nennt",
  ],
  steps: [
    {
      name: "Bot hinzufügen",
      text: "Wähle in Discord deinen Server. Der Bot fragt nur die Rechte an, die seine Funktionen brauchen — kein Administrator.",
    },
    {
      name: "Im Dashboard anmelden",
      text: "Melde dich mit Discord an (Twitch oder Gast gehen auch) und gib einmal deine Server-Liste frei. Der Server ist schon ausgewählt.",
    },
    {
      name: "Bereiche einschalten",
      text: "Schalte ein, was du brauchst. Der Einrichtungs-Check zeigt, wenn dem Bot irgendwo ein Recht fehlt, und führt direkt hin.",
    },
  ],
  faq: [
    {
      q: "Ist der Bot kostenlos?",
      a: "Ja, alle Funktionen auf dieser Seite sind kostenlos — ohne Abo, ohne Premium-Stufe und ohne Werbung in deinem Server.",
    },
    {
      q: "Welche Rechte braucht der Bot?",
      a: "Nur die, die seine Funktionen nutzen: Nachrichten senden und verwalten, Kanäle und Rollen verwalten, Webhooks für die Taverne, Threads für Genehmigungen und Mitglieder verschieben für die Voice-Kanäle. Administrator verlangt er nicht.",
    },
    {
      q: "Brauche ich ein Twitch-Konto?",
      a: "Nein. Im Dashboard meldest du dich mit Discord an, auf Wunsch auch mit Twitch oder als Gast. Für die Twitch-Livemeldungen reicht der Name des Kanals.",
    },
    {
      q: "Warum vergibt der Bot eine Rolle nicht?",
      a: "Discord lässt einen Bot nur Rollen vergeben, die unter seiner eigenen Rolle stehen. Zieh die Bot-Rolle in den Server-Einstellungen nach oben — der Einrichtungs-Check im Dashboard nennt jede betroffene Rolle.",
    },
    {
      q: "In welcher Sprache schreibt der Bot?",
      a: "Auf Deutsch oder Englisch, je Server einstellbar. Beim Hinzufügen übernimmt er die Sprache deines Servers. Die Slash-Befehle zeigt Discord in der Sprache der App jedes Mitglieds.",
    },
    {
      q: "Welche Daten speichert der Bot?",
      a: "Deine Einstellungen, Zählungen für Statistik und Punkte sowie Ticket-Angaben. Was genau und wie lange, steht in der Datenschutzerklärung des Bots.",
    },
  ],
  // Beispiel im Kopf: so schreibt der Bot (erfundene Namen)
  chat: {
    bot: "Bot",
    today: "heute um 20:15 Uhr",
    welcome: "Willkommen {user} auf Pixel Café! Du bist unser Mitglied #128",
    welcomeFooter: "Mitglied #128",
    rolesTitle: "Wähle deine Rollen",
    rolesText: "Klick auf einen Knopf — noch einmal klicken nimmt die Rolle wieder weg.",
    roles: ["🎮 Gaming", "🎨 Kreativ", "🔔 Stream-Pings"],
    live: "🔴 **Mika** ist jetzt live! twitch.tv/…",
    dailyTitle: "Tagesbonus abgeholt",
    dailyBody: "+250\nSerie: **3** Tage 🔥🔥🔥\nKontostand: 4.120",
  },
};

const en = {
  ui: {
    back: "Streamer tools",
    add: "Add to Discord",
    dashboard: "Open dashboard",
    facts: "Free · German and English · set up in your browser, no commands",
    servers: (n) => (n === 1 ? "Running on 1 server" : `Running on ${n.toLocaleString("en-US")} servers`),
    previewNote: "This is how the bot writes in your server — example with made-up names.",
    featuresHeading: "What the bot does",
    alsoHeading: "Also included",
    stepsHeading: "Set up in three steps",
    faqHeading: "Frequently asked questions",
    legalHeading: "Legal",
    privacy: "Bot privacy policy (in German)",
    terms: "Bot terms of use (in German)",
    home: "Home",
  },
  name: "Discord bot",
  seoTitle: "Discord Bot: Roles, Tickets and Welcome",
  description:
    "Free Discord bot with a web dashboard: welcome messages, role buttons, tickets, Twitch live alerts, personal voice channels and points.",
  keywords:
    "Discord bot, free Discord bot, Discord welcome message, Discord role buttons, Discord ticket bot, " +
    "Discord Twitch notifications, Discord voice channels, Discord points system",
  kicker: "For Discord servers",
  h1: "The Discord bot for your community",
  lead:
    "Welcome new members, hand out roles with buttons, run support tickets, post Twitch live alerts and give everyone " +
    "their own voice channel — all set up in your browser, without learning a single command.",
  features: [
    {
      title: "Welcome and goodbye",
      text: "As a plain message, a card with the profile picture or a drawn image in five layouts. Placeholders for name, server and member number.",
    },
    {
      title: "Roles by button",
      text: "Panels with buttons that let members give themselves roles — several or exactly one. Plus auto roles and roles just for boosters.",
    },
    {
      title: "Support tickets",
      text: "A button opens a short form and then a private channel for the member and your team. With a history in the dashboard.",
    },
    {
      title: "Twitch live alerts",
      text: "When a Twitch channel goes live, the bot posts a message with your own template in your channel — for as many channels as you like.",
    },
    {
      title: "Personal voice channels",
      text: "Whoever joins the trigger channel gets their own voice channel. Limit, lock, rename, hide and kick with commands.",
    },
    {
      title: "Points and mini games",
      text: "Points for chatting, for voice time and with /daily. Bet them on the wheel, in the rocket or in a duel, plus a leaderboard.",
    },
    {
      title: "Server stats",
      text: "Messages and voice time per member and channel for up to 90 days — in the dashboard and with /serverstats.",
    },
    {
      title: "Approvals",
      text: "Members send a request with a button, your team votes in a private thread. Once approved, they get a role or a channel.",
    },
    {
      title: "German and English",
      text: "The bot writes in German or English per server. New servers start in their server language, and the dashboard comes in both languages.",
    },
  ],
  also: [
    "Image-only channels, with slowmode if you like",
    "Tavern: one channel that connects servers with the bot",
    "Fun commands like /ship, /coinflip and /superpower",
    "A setup check that names missing permissions by channel",
  ],
  steps: [
    {
      name: "Add the bot",
      text: "Pick your server in Discord. The bot only asks for the permissions its features need — no administrator.",
    },
    {
      name: "Sign in to the dashboard",
      text: "Sign in with Discord (Twitch or guest work too) and allow access to your server list once. Your server is already selected.",
    },
    {
      name: "Turn on what you need",
      text: "Switch on the features you want. The setup check shows when the bot is missing a permission somewhere and takes you straight there.",
    },
  ],
  faq: [
    {
      q: "Is the bot free?",
      a: "Yes, every feature on this page is free — no subscription, no premium tier and no ads in your server.",
    },
    {
      q: "Which permissions does the bot need?",
      a: "Only the ones its features use: send and manage messages, manage channels and roles, webhooks for the tavern, threads for approvals and move members for voice channels. It never asks for administrator.",
    },
    {
      q: "Do I need a Twitch account?",
      a: "No. You sign in to the dashboard with Discord, or with Twitch or as a guest if you prefer. For Twitch live alerts, the channel name is all it takes.",
    },
    {
      q: "Why doesn't the bot hand out a role?",
      a: "Discord only lets a bot give roles that sit below its own role. Drag the bot role up in your server settings — the setup check in the dashboard names every affected role.",
    },
    {
      q: "Which language does the bot write in?",
      a: "German or English, set per server. When you add it, it picks up your server's language. Discord shows the slash commands in the language of each member's app.",
    },
    {
      q: "What data does the bot store?",
      a: "Your settings, counts for stats and points, and ticket details. What exactly and for how long is in the bot's privacy policy.",
    },
  ],
  chat: {
    bot: "Bot",
    today: "Today at 8:15 PM",
    welcome: "Welcome {user} to Pixel Café! You are member #128",
    welcomeFooter: "Member #128",
    rolesTitle: "Pick your roles",
    rolesText: "Click a button — click it again to remove the role.",
    roles: ["🎮 Gaming", "🎨 Creative", "🔔 Stream pings"],
    live: "🔴 **Mika** is live now! twitch.tv/…",
    dailyTitle: "Daily bonus claimed",
    dailyBody: "+250\nStreak: **3** days 🔥🔥🔥\nBalance: 4,120",
  },
};

export const LANDING_TEXTS = defineMessages({ de, en });

const DOMAIN = "https://vnmvalentin.de";
const urlFor = (lang) => `${DOMAIN}${LANDING_PATH}${lang === "en" ? "?lang=en" : ""}`;

/** Strukturierte Daten: Anwendung, Brotkrumen und Fragen — aus denselben Texten wie die Seite. */
export function buildLandingJsonLd(lang) {
  const t = LANDING_TEXTS.dict(lang);
  const url = urlFor(lang);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: t.h1,
      url,
      description: t.description,
      inLanguage: lang,
      applicationCategory: "CommunicationApplication",
      operatingSystem: "Discord",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      featureList: t.features.map((f) => f.title),
      screenshot: DOMAIN + LANDING_IMAGE,
      author: { "@type": "Person", name: "vnmvalentin", url: DOMAIN },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: t.ui.home, item: DOMAIN },
        { "@type": "ListItem", position: 2, name: t.ui.back, item: `${DOMAIN}/tools` },
        { "@type": "ListItem", position: 3, name: t.name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: lang,
      mainEntity: t.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}
