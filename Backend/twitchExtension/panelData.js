// twitchExtension/panelData.js — was das Panel unter dem Stream zeigt: dieselben Zahlen wie das OBS-Overlay des Win
// Trackers (Ausbauplan „twitch-erweiterung“).
//
// Der Win Tracker gehört Spur B und wird hier NUR gelesen (Anschluss „twitch-ext-liest-wt“): Die Einstellungen hängen
// an der Twitch-ID des Streamers (cr_wintracker_settings.user_id) — das ist genau die channel_id aus Twitchs Token.
// Der Streamer muss also nichts verknüpfen: Wer den Win Tracker mit demselben Twitch-Konto nutzt, hat das Panel.
// Die Zahlen kommen aus overlayStateForSettings (dieselbe Funktion wie Overlay und Chat-Befehle). Frisch hält sie der
// Hintergrund-Abgleich des Win Trackers (alle 90 s für jeden aktiven Account), auch ohne laufende OBS-Quelle.
'use strict';

/**
 * Overlay-Zahlen fürs Panel: Formatwünsche fürs OBS (feste Breite/Höhe, Vergrößerung) gelten unter dem Stream nicht —
 * dort hat die Karte ihre natürliche Breite (310 px, das Panel ist 318 px breit). Auch das Blättern zwischen den Teilen
 * (paginateOverlay, gegen Platznot im Stream-Bild) fällt weg: Das Panel hat Platz für alles untereinander. Welche Teile
 * zu sehen sind (Profil, Session, letzte Spiele, Deck), bleibt die Wahl des Streamers.
 * @param {object|null} state  Ergebnis von overlayStateForSettings
 */
function panelState(state) {
  if (!state || !state.hasAccount) return { hasAccount: false };
  return {
    ...state,
    settings: { ...(state.settings || {}), overlayScale: 100, overlayWidth: 0, overlayHeight: 0, paginateOverlay: false },
  };
}

let stmt = null;
let overlayStateForSettings = null;

/**
 * Standard-Quelle: Win-Tracker-Datenbank (nur lesen). Erst beim ersten Abruf geladen — Tests reichen eine eigene
 * Quelle herein und öffnen so nie die echte Datenbank.
 * @returns {{ tracker: boolean, state: object }}
 */
function loadFromWinTracker(channelId) {
  if (!stmt) {
    const db = require('../clashRoyale/lib/winTrackerStore');
    stmt = db.prepare('SELECT * FROM cr_wintracker_settings WHERE user_id = ?');
    ({ overlayStateForSettings } = require('../clashRoyale/routes/crWinTrackerRoutes'));
  }
  const row = stmt.get(String(channelId));
  if (!row) return { tracker: false, state: { hasAccount: false } };
  return { tracker: true, state: panelState(overlayStateForSettings(row)) };
}

module.exports = { panelState, loadFromWinTracker };
