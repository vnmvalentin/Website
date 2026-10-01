// Turnier-Einstellungen: Standardwerte und Prüfung — reine Logik ohne I/O (getestet in
// __tests__/settings.test.js). Plan und Hintergründe: ../PLANUNG_TURNIER.md.
//
// sanitizeSettings() nimmt beliebige Client-Eingaben und liefert IMMER ein vollständiges,
// gültiges Objekt plus eine Liste von Fehlern zurück. Fehler sind Schlüssel (i18n im Client),
// keine Texte — dieselbe Konvention wie core/errors.js.

const LIMITS = {
  nameMax: 60,
  descriptionMax: 600,
  minPlayers: 2,
  maxPlayers: 64,
  groupSizeMin: 3,
  groupSizeMax: 8,
  showUpMinutes: [3, 30],
  battleMinutes: [10, 60],
};

const MODE_SELECTION = ['pickban', 'random'];
const SIGNUP_MODES = ['twitch', 'open'];

/** Standardwerte — alles, was der Veranstalter nicht ausdrücklich setzt. */
function defaultSettings(soloModeIds) {
  return {
    name: '',
    description: '',
    maxPlayers: 16,
    modes: [...soloModeIds],
    groupStage: { enabled: false, groupSize: 4, advancePerGroup: 2 },
    doubleElimination: false,
    bestOf: { normal: 1, finals: 3 },
    modeSelection: 'pickban',
    signupMode: 'twitch',
    startsAt: null,         // Unix-ms oder null (= nur manueller Start)
    autoStart: false,       // zum Zeitpunkt startsAt automatisch starten
    listed: true,           // im Hub unter offenen Turnieren zeigen
    deckCheck: true,        // gedraftetes Deck muss im Kampf benutzt werden
    showUpMinutes: 10,      // Frist zum Erscheinen im Match-Raum, sonst kampfloser Sieg
    battleMinutes: 20,      // Frist für den Kampf nach Draft-Ende, sonst "Klärung nötig"
  };
}

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const cleanText = (raw, max) => String(raw ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);

/**
 * @param {object} input        Client-Eingabe (teilweise oder vollständig)
 * @param {string[]} soloModeIds  erlaubte Modi (Solo-Modi aus der Registry)
 * @param {object} [base]       bisherige Einstellungen (beim Bearbeiten) — fehlende Felder bleiben
 * @returns {{ settings: object, errors: string[] }}
 */
function sanitizeSettings(input, soloModeIds, base) {
  const d = base || defaultSettings(soloModeIds);
  const i = input && typeof input === 'object' ? input : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(i, k);
  const errors = [];

  // Erst Leerraum zusammenfassen, dann kürzen — sonst würde der Name kürzer als erlaubt
  const name = has('name') ? cleanText(i.name, 1000).replace(/\s+/g, ' ').slice(0, LIMITS.nameMax) : d.name;
  if (!name) errors.push('tournamentNameMissing');

  const description = has('description') ? cleanText(i.description, LIMITS.descriptionMax) : d.description;
  const maxPlayers = has('maxPlayers') ? clampInt(i.maxPlayers, LIMITS.minPlayers, LIMITS.maxPlayers, d.maxPlayers) : d.maxPlayers;

  let modes = d.modes;
  if (has('modes')) {
    modes = Array.isArray(i.modes) ? [...new Set(i.modes.filter(m => soloModeIds.includes(m)))] : [];
  }
  if (!modes.length) errors.push('tournamentNoModes');

  const gIn = has('groupStage') && i.groupStage && typeof i.groupStage === 'object' ? i.groupStage : {};
  const groupStage = {
    enabled: 'enabled' in gIn ? !!gIn.enabled : d.groupStage.enabled,
    groupSize: 'groupSize' in gIn ? clampInt(gIn.groupSize, LIMITS.groupSizeMin, LIMITS.groupSizeMax, d.groupStage.groupSize) : d.groupStage.groupSize,
    advancePerGroup: 'advancePerGroup' in gIn ? clampInt(gIn.advancePerGroup, 1, LIMITS.groupSizeMax - 1, d.groupStage.advancePerGroup) : d.groupStage.advancePerGroup,
  };
  if (groupStage.enabled) {
    if (maxPlayers % groupStage.groupSize !== 0) errors.push('tournamentGroupSizeMismatch');
    if (groupStage.advancePerGroup >= groupStage.groupSize) errors.push('tournamentAdvanceTooHigh');
    // Mindestens zwei Spieler müssen ins Bracket kommen, sonst gibt es kein Finale
    else if ((maxPlayers / groupStage.groupSize) * groupStage.advancePerGroup < 2) errors.push('tournamentAdvanceTooLow');
  }

  const doubleElimination = has('doubleElimination') ? !!i.doubleElimination : d.doubleElimination;

  const bIn = has('bestOf') && i.bestOf && typeof i.bestOf === 'object' ? i.bestOf : {};
  const bestOf = {
    normal: 'normal' in bIn ? ([1, 3].includes(Number(bIn.normal)) ? Number(bIn.normal) : d.bestOf.normal) : d.bestOf.normal,
    finals: 'finals' in bIn ? ([3, 5].includes(Number(bIn.finals)) ? Number(bIn.finals) : d.bestOf.finals) : d.bestOf.finals,
  };

  const modeSelection = has('modeSelection') && MODE_SELECTION.includes(i.modeSelection) ? i.modeSelection : d.modeSelection;
  // Pick/Ban zieht 3 Modi und jeder bannt einen — mit weniger als 3 Modi geht das nicht
  if (modeSelection === 'pickban' && modes.length < 3) errors.push('tournamentPickBanNeedsThree');

  const signupMode = has('signupMode') && SIGNUP_MODES.includes(i.signupMode) ? i.signupMode : d.signupMode;

  let startsAt = d.startsAt;
  if (has('startsAt')) {
    const t = i.startsAt === null || i.startsAt === '' ? null : Number(i.startsAt);
    startsAt = Number.isFinite(t) && t > 0 ? Math.round(t) : null;
  }
  const autoStart = has('autoStart') ? !!i.autoStart && startsAt !== null : d.autoStart && startsAt !== null;

  return {
    settings: {
      name, description, maxPlayers, modes, groupStage, doubleElimination, bestOf, modeSelection,
      signupMode, startsAt, autoStart,
      listed: has('listed') ? !!i.listed : d.listed,
      deckCheck: has('deckCheck') ? !!i.deckCheck : d.deckCheck,
      showUpMinutes: has('showUpMinutes') ? clampInt(i.showUpMinutes, ...LIMITS.showUpMinutes, d.showUpMinutes) : d.showUpMinutes,
      battleMinutes: has('battleMinutes') ? clampInt(i.battleMinutes, ...LIMITS.battleMinutes, d.battleMinutes) : d.battleMinutes,
    },
    errors,
  };
}

module.exports = { LIMITS, defaultSettings, sanitizeSettings };
