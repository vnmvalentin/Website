// components/einladungTexte.js — Texte rund um Einladungslinks: Hinweis für Eingeladene (EinladungHinweis.jsx) und
// „Freunde einladen“ im Profil (pages/Website/EinladenEinstellungen.jsx). Deutsch und Englisch.
import { defineMessages } from "../i18n/core.js";

export const EINLADUNG_TEXTE = defineMessages({
  de: {
    // Hinweis oben auf der Seite
    eingeladenVon: (name) => `${name} hat dich eingeladen.`,
    eingeladen: "Du wurdest eingeladen.",
    anmeldenText: "Melde dich an, auch als Gast ohne Konto bei Twitch oder Discord. Kommst du an einem anderen Tag wieder, bekommt ihr beide ein Abzeichen.",
    anmelden: "Anmelden",
    angenommen: "Einladung angenommen. Komm an einem anderen Tag wieder, dann bekommt ihr beide ein Abzeichen für eure Visitenkarte.",
    ausblenden: "Ausblenden",
    // Profil
    titel: "Freunde einladen",
    hinweis: "Teile deinen Link. Legt ein Freund darüber ein neues Konto an (auch als Gast) und kommt an einem anderen Tag wieder, bekommt ihr beide ein Abzeichen für die Visitenkarte.",
    deinLink: "Dein Einladungslink",
    kopieren: "Kopieren",
    kopiert: "Kopiert",
    teilen: "Teilen",
    teilenTitel: "Komm auf vnmvalentin.de",
    dabei: (n) => (n === 1 ? "1 Freund dabei" : `${n} Freunde dabei`),
    wartet: (n) => (n === 1 ? "1 wartet noch auf den zweiten Tag" : `${n} warten noch auf den zweiten Tag`),
    abzeichen: "Abzeichen",
    stufe: (ab) => (ab === 1 ? "ab 1 Freund" : `ab ${ab} Freunden`),
    erreicht: "erreicht",
    namen: { gastgeber: "Gastgeber", netzwerker: "Netzwerker", botschafter: "Botschafter" },
    selbstEingeladen: "Du bist selbst über eine Einladung gekommen.",
    ladeFehler: "Konnte nicht geladen werden.",
  },
  en: {
    eingeladenVon: (name) => `${name} invited you.`,
    eingeladen: "You were invited.",
    anmeldenText: "Sign in, even as a guest without a Twitch or Discord account. Come back on another day and you both get a badge.",
    anmelden: "Sign in",
    angenommen: "Invite accepted. Come back on another day and you both get a badge for your profile card.",
    ausblenden: "Dismiss",
    titel: "Invite friends",
    hinweis: "Share your link. If a friend creates a new account through it (guests count too) and comes back on another day, you both get a badge for your profile card.",
    deinLink: "Your invite link",
    kopieren: "Copy",
    kopiert: "Copied",
    teilen: "Share",
    teilenTitel: "Come to vnmvalentin.de",
    dabei: (n) => (n === 1 ? "1 friend joined" : `${n} friends joined`),
    wartet: (n) => (n === 1 ? "1 still waiting for the second day" : `${n} still waiting for the second day`),
    abzeichen: "Badges",
    stufe: (ab) => (ab === 1 ? "from 1 friend" : `from ${ab} friends`),
    erreicht: "earned",
    namen: { gastgeber: "Host", netzwerker: "Connector", botschafter: "Ambassador" },
    selbstEingeladen: "You joined through an invite yourself.",
    ladeFehler: "Couldn't be loaded.",
  },
});
