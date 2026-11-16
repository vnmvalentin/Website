// components/anmeldungTexte.js — Texte des Anmelde-Dialogs und der Hinweise nach einer Anmeldung (components/Anmeldung.jsx).
import { defineMessages } from "../i18n/core.js";

export const ANMELDUNG_TEXTE = defineMessages({
  de: {
    titel: "Anmelden",
    einleitung: "Mit einem Konto bleiben deine Spielstände und Abzeichen erhalten, auch auf anderen Geräten.",
    twitch: "Mit Twitch anmelden",
    twitchHinweis: "Nötig für Win Tracker, Overlays und alle Streamer-Werkzeuge",
    discord: "Mit Discord anmelden",
    discordHinweis: "Zum Spielen und für dein Profil",
    gast: "Als Gast spielen",
    gastHinweis: "Ohne Anmeldung, mit Wiederherstellungscode",
    codeLink: "Ich habe einen Wiederherstellungscode",
    codeTitel: "Mit Code anmelden",
    codeFeld: "Wiederherstellungscode",
    codeBeispiel: "XXXX-XXXX-XXXX-XXXX",
    codeLos: "Anmelden",
    zurueck: "Zurück",
    gastTitel: "Dein Wiederherstellungscode",
    gastText: "Damit holst du dein Gastkonto auf einem anderen Gerät oder nach dem Löschen der Browserdaten zurück. Wir zeigen ihn nur jetzt. Schreib ihn auf oder mach ein Foto.",
    gastSpaeter: "Im Profil kannst du jederzeit einen neuen Code erstellen oder Twitch bzw. Discord verknüpfen.",
    kopieren: "Kopieren",
    kopiert: "Kopiert",
    notiert: "Ich habe ihn notiert",
    fehlerAllgemein: "Das hat nicht geklappt. Bitte noch einmal versuchen.",
    rechtliches: "Mit der Anmeldung gilt unsere Datenschutzerklärung.",
    hinweise: {
      angemeldet: (name) => (name ? `Angemeldet als ${name}.` : "Angemeldet."),
      verknuepft: "Verknüpft: Du kannst dich jetzt auch so anmelden.",
      zusammengefuehrt: "Konten zusammengeführt: Spielstände und Abzeichen liegen jetzt in einem Konto.",
      fehler: {
        doppelt: "Das ging nicht: Beide Konten haben schon einen eigenen Zugang dieser Art. Trenne ihn zuerst in einem der beiden Konten.",
        "schon-verknuepft": "Dein Konto hat schon ein anderes Konto dieser Art. Trenne es zuerst im Profil.",
        abgebrochen: "Anmeldung abgebrochen.",
        abgelaufen: "Die Anmeldung hat zu lange gedauert. Bitte noch einmal.",
        discord: "Discord hat nicht geantwortet. Bitte später noch einmal.",
        "discord-aus": "Die Anmeldung mit Discord ist gerade nicht eingerichtet.",
        server: "Das Konto konnte nicht gespeichert werden. Bitte später noch einmal.",
        sonst: "Das hat nicht geklappt. Bitte noch einmal versuchen.",
      },
      schliessen: "Schließen",
    },
  },
  en: {
    titel: "Sign in",
    einleitung: "With an account, your game progress and badges are kept, on other devices too.",
    twitch: "Sign in with Twitch",
    twitchHinweis: "Needed for Win Tracker, overlays and all streamer tools",
    discord: "Sign in with Discord",
    discordHinweis: "For playing and your profile",
    gast: "Play as a guest",
    gastHinweis: "No sign-in, with a recovery code",
    codeLink: "I have a recovery code",
    codeTitel: "Sign in with a code",
    codeFeld: "Recovery code",
    codeBeispiel: "XXXX-XXXX-XXXX-XXXX",
    codeLos: "Sign in",
    zurueck: "Back",
    gastTitel: "Your recovery code",
    gastText: "Use it to get your guest account back on another device or after clearing your browser data. We only show it now. Write it down or take a photo.",
    gastSpaeter: "In your profile you can create a new code or link Twitch or Discord at any time.",
    kopieren: "Copy",
    kopiert: "Copied",
    notiert: "I wrote it down",
    fehlerAllgemein: "That didn't work. Please try again.",
    rechtliches: "Signing in means our privacy policy applies.",
    hinweise: {
      angemeldet: (name) => (name ? `Signed in as ${name}.` : "Signed in."),
      verknuepft: "Linked: you can now sign in this way as well.",
      zusammengefuehrt: "Accounts merged: progress and badges are now in one account.",
      fehler: {
        doppelt: "That didn't work: both accounts already have their own login of this kind. Unlink it in one of them first.",
        "schon-verknuepft": "Your account already has a different account of this kind. Unlink it in your profile first.",
        abgebrochen: "Sign-in cancelled.",
        abgelaufen: "Sign-in took too long. Please try again.",
        discord: "Discord didn't respond. Please try again later.",
        "discord-aus": "Signing in with Discord isn't set up right now.",
        server: "The account couldn't be saved. Please try again later.",
        sonst: "That didn't work. Please try again.",
      },
      schliessen: "Close",
    },
  },
});

/** Text zu einem Hinweis nach der Anmeldung ({ status, grund, name }) */
export function hinweisText(t, hinweis) {
  if (!hinweis) return "";
  const h = t.hinweise;
  if (hinweis.status === "angemeldet") return h.angemeldet(hinweis.name || "");
  if (hinweis.status === "verknuepft") return h.verknuepft;
  if (hinweis.status === "zusammengefuehrt") return h.zusammengefuehrt;
  return h.fehler[hinweis.grund] || h.fehler.sonst;
}
