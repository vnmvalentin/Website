// Texte der Tool-Hülle (ToolShell.jsx) auf Deutsch und Englisch. Die Hülle zeigt sie in der gewählten Sprache, wenn
// das Werkzeug sie kann (langs in tools.js, oder `lang` von einem eigenen Aufsatz wie WcShell); sonst Deutsch, damit
// Werkzeuge ohne Übersetzung nicht halb englisch erscheinen.
import { defineMessages } from "../../i18n/core.js";

export const SHELL_TEXT = defineMessages({
  de: {
    back: "Zu den Streamer-Tools",
    login: "Mit Twitch anmelden",
    loginShort: "Login",
    logout: "Abmelden",
    profile: "Profil öffnen",
    menu: "Alle Werkzeuge",
    allTools: "Streamer-Tools",
    home: "Startseite",
    language: "Sprache",
  },
  en: {
    back: "Back to streamer tools",
    login: "Log in with Twitch",
    loginShort: "Log in",
    logout: "Log out",
    profile: "Open profile",
    menu: "All tools",
    allTools: "Streamer tools",
    home: "Home",
    language: "Language",
  },
});
