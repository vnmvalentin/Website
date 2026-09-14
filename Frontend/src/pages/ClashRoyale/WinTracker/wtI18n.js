// wtI18n.js — Übersetzungen für den Win-Tracker: Editor-Seite (WinTrackerPage.jsx) UND
// tatsächlicher Overlay-Inhalt (WinTrackerOverlayPage.jsx/OverlayPreview.jsx). Bewusst eine
// eigene, kleine Datei statt Erweiterung der geteilten ../i18n.js — die ist bereits >1100
// Zeilen für Lobby/Minigames/Endscreen, der Win-Tracker gehörte laut Projekt-Notiz bisher
// nicht zu deren Umfang und bräuchte dort einen komplett eigenen Namensraum an Keys.
//
// Nur DE/EN (nicht ES wie der Rest der CR-Seite) — explizit nur diese zwei angefragt. Eine
// einzige Einstellung (settings.language) steuert beides zugleich: Editor-UI-Text UND
// Overlay-Inhalt, siehe Kommentar an der language-Spalten-Migration in winTrackerStore.js.
//
// Werte sind entweder ein fertiger String oder eine Funktion (Parameter -> String) für Text
// mit eingesetzten Werten — genau wie resolveError() in ../i18n.js.
export const WT_I18N = {
  de: {
    // ── Seiten-Rahmen ──────────────────────────────────────────────────────
    pageSubtitle: 'Liga, Trophäen und die letzten Matches — live im OBS-Overlay, direkt aus der offiziellen Clash-Royale-API.',
    languageLabel: 'Sprache',
    loginRequired: 'Login erforderlich',
    loginHint: 'Melde dich mit Twitch an, um deine Accounts und das Overlay zu verwalten.',
    loginButton: 'Mit Twitch einloggen',
    tabAccounts: 'Accounts',
    tabSettings: 'Einstellungen',
    loadingAccounts: 'Lade Accounts…',

    // ── AddAccountModal ────────────────────────────────────────────────────
    addAccountTitle: 'Account hinzufügen',
    addAccountHint: 'Trage dein Spieler-Kürzel ein. Du findest es in Clash Royale in deinem Profil unter deinem Namen.',
    addAccountBusy: 'Verknüpfe…',
    addAccountSubmit: 'Account verknüpfen',

    // ── AccountsTab ────────────────────────────────────────────────────────
    yourAccounts: 'Deine Accounts',
    yourAccountsHint: 'Der aktive Account speist dein Win-Tracker-Overlay — jeder Account trackt seinen eigenen Wert. In Liga 1–6 zählt der Tracker Stufen statt Medaillen; stell die Stufe einmal auf deinen echten Stand.',
    addAccountBtn: 'Account hinzufügen',
    emptyTitle: 'Noch kein Account verknüpft',
    emptyHint: 'Verknüpfe deinen Clash-Royale-Account über dein Spieler-Kürzel, um Liga, Trophäen und Matches im Overlay zu tracken.',
    active: 'Aktiv',
    activate: 'Aktivieren',
    trackedValue: 'Getrackter Wert',
    // Ranked deckt beide Phasen der 1v1-Ranked-Leiter ab (Stufen in Liga 1-6, Medaillen ab
    // Ultimate Champion) — bewusst EIN Label statt je nach aktueller Liga zwischen "Stufen" und
    // "Medaillen" zu wechseln, damit die Option im Umschalter nicht ihren Namen ändert.
    optRanked: 'Ranked',
    optTrophies: 'Trophäen',
    opt2v2: '2v2 Ranked',
    titleTrophiesLifetime: 'Lifetime-Trophäen aus dem Profil',
    titleStepsLeague: 'Stufen dieser Liga — ab Ultimate Champion wieder Medaillen',
    titleMedalsSeason: 'Punktestand der laufenden Ranked-Season',
    // 2v2 Ranked (seit September 2026, zeitlich befristete Season): eigener Medaillen-Stand,
    // unabhängig von 1v1-Medaillen/Trophäen — 0 heißt entweder "noch nie gesynct" oder das
    // saisonale 2v2-Ranked-Fenster läuft gerade nicht (siehe league2v2 in crApi.js).
    titleLeague2v2Season: 'Punktestand der laufenden 2v2-Ranked-Season — 0, wenn gerade kein 2v2-Ranked-Fenster läuft',
    bestTrophiesLabel: (p) => `Trophäen · Beste ${p.n}`,
    medalsSeasonLabel: 'Medaillen (Season)',
    league2v2Label: (p) => `2v2 Ranked · Beste ${p.n}`,
    refreshNow: 'Jetzt aktualisieren',
    removeAccount: 'Account entfernen',
    confirmRemove: (p) => `Account "${p.name}" wirklich entfernen?`,
    // Manueller Session-Reset (siehe SessionRow/handleResetSession) — hebt den Sessionbeginn auf
    // "jetzt", ohne auf die automatische 4h-Pausen-Regel zu warten.
    resetSessionBtn: 'Session zurücksetzen',
    resetSessionTitle: 'Profit/Win-Loss/letzte 5 auf jetzt zurücksetzen, ohne auf die automatische 4h-Pause zu warten',
    confirmResetSession: 'Session-Statistik jetzt zurücksetzen? Bereits gespielte Matches zählen danach nicht mehr für Profit/Win-Loss/letzte 5.',
    autoSwitchLabel: 'Automatisch umschalten',
    autoSwitchDesc: 'Wechselt den getrackten Wert bei jedem Sync automatisch auf den zuletzt gespielten Modus (Ranked, Trophäen oder 2v2) — die Auswahl oben ist dann gesperrt, weil sie sonst vom nächsten Sync sofort überschrieben würde.',

    // ── LadderValue ────────────────────────────────────────────────────────
    stepsUnit: 'Stufen',
    bonusTitle: 'Season-Reset-Bonus: Siege zählen aktuell mehr als 1 Stufe, sinkt mit jedem Sieg um 1',
    bonusLabel: (p) => `Bonus +${p.n}`,
    stepCorrectTitle: 'Stufe korrigieren — an der Ligagrenze steigt/fällt automatisch die Liga mit',

    // ── Module-Definitionen ────────────────────────────────────────────────
    moduleDeckLabel: 'Aktuelles Deck',
    moduleDeckDesc: 'Die 8 Karten des zuletzt gespielten Matches — automatisch das Ranked- oder das Trophy-Road-Deck. Steht im Stapel oben/unten oder als eigene Spalte links/rechts neben allem, genau so hoch wie der Rest.',
    moduleSessionLabel: 'Session & letzte Spiele',
    moduleSessionDesc: 'Profit, Sieg/Niederlage, Win-Rate der laufenden Session (Reset nach 4h ohne Ranked-Match) sowie die letzten 5 Matches — direkt darunter, ohne Trennlinie.',
    visible: 'Sichtbar',
    hidden: 'Ausgeblendet',
    ariaHideModule: 'Modul ausblenden',
    ariaShowModule: 'Modul einblenden',
    profileHeadLabel: 'Profil-Kopf',
    profileHeadDesc: 'Name, Liga/Stufe und Hauptwert (Medaillen/Trophäen) oben in der Karte.',

    // ── SettingsTab ────────────────────────────────────────────────────────
    regenerateConfirm: 'Neuen Overlay-Link erzeugen? Der alte Link funktioniert danach nicht mehr (OBS muss aktualisiert werden).',
    designerTitle: 'Overlay-Designer',
    designerDesc: 'Das ist genau die Karte, die im Overlay landet. Mit dem Augen-Symbol oben rechts an einem Teil direkt aus-/einblenden — geht auch unten in der Liste, dort zusätzlich mit Feinabstimmung pro Teil, inklusive der Deck-Platzierung (oben/unten im Stapel oder als eigene Spalte links/rechts daneben, gleich hoch wie der Rest). Der Kopfbereich (Name, Liga, Hauptwert) bleibt immer an erster Stelle, lässt sich aber genau wie Deck und Session ausblenden.',
    // 100% steht für VOLL sichtbar — "Transparenz" hätte das genau umgekehrt gelesen
    // (100% Transparenz = unsichtbar). "Deckkraft" passt zur tatsächlichen Reglerrichtung.
    transparency: 'Deckkraft',
    // ── Farben-Karte ─────────────────────────────────────────────────────────
    sectionColorsTitle: 'Farben',
    sectionColorsDesc: 'Hintergrund, Verlauf und Rahmen der Overlay-Karte.',
    bgColorLabel: 'Hintergrundfarbe',
    bgGradientLabel: 'Verlauf',
    bgGradientDesc: 'Zweite Farbe für einen diagonalen Verlauf statt einer einfarbigen Fläche.',
    bgColor2Label: 'Zweite Farbe',
    borderColorLabel: 'Rahmenfarbe',
    borderColorAutoLabel: 'Automatisch',
    borderColorAutoTitle: 'Dezente helle Linie passend zur Deckkraft — keine eigene Farbe gesetzt',
    // ── Getrackter-Wert-Karte ────────────────────────────────────────────────
    sectionTrackedDesc: 'Welcher Wert im Kopf der Karte steht — jeder Modus hat seine eigene Session-Statistik und sein eigenes Deck.',
    // ── Anzeige-Karte ────────────────────────────────────────────────────────
    sectionVisualsTitle: 'Anzeige',
    sectionVisualsDesc: 'Welche Teile die Karte zeigt, und wie sie dargestellt werden.',
    // ── AN/AUS-Knopf ─────────────────────────────────────────────────────────
    onLabel: 'AN',
    offLabel: 'AUS',
    // ── Seitenleiste ─────────────────────────────────────────────────────────
    livePreviewTitle: 'Live-Vorschau',
    copiedLabel: 'Kopiert!',
    apiConnectedShort: 'API verbunden',
    apiNotConfiguredShort: 'API nicht konfiguriert',
    displayGroupLabel: 'Anzeige',
    stepBarPill: 'Stufenleiste',
    stepBarTitle: 'Die gefüllten Balken unter der Stufenzahl (nur Liga 1-6) — ausblenden macht das Overlay etwas niedriger, die Zahl selbst bleibt',
    dailyProfitPill: 'Daily Profit',
    dailyProfitTitle: 'Saldo der laufenden Session (+/-)',
    winLossNumbersPill: 'Win/Loss-Zahlen',
    winLossNumbersTitle: 'z.B. 14W – 6L',
    winRatePctPill: 'Win-Rate %',
    winRatePctTitle: 'Siegquote der laufenden Session',
    last5Pill: 'Letzte 5 Spiele',
    last5Title: 'Nur Matches der laufenden Session',
    last5DisplayGroupLabel: 'Darstellung der letzten Spiele',
    styleResultLabel: 'Win/Lose',
    styleResultTitle: 'Blase mit Text',
    styleDeltaLabel: '+/-',
    styleDeltaTitle: 'Blase mit der Änderung — Medaillen/Trophäen, in Liga 1-6 stattdessen +1/-1 Stufe',
    styleDotLabel: 'Punkte',
    styleDotTitle: 'Nur kleine grüne/rote Kreise, ohne Text',
    orderGroupLabel: 'Reihenfolge & Markierung',
    newestLeftLabel: 'Neuestes links',
    newestLeftTitle: 'Ein neues Spiel rutscht links rein, drückt die anderen nach rechts',
    newestRightLabel: 'Neuestes rechts',
    newestRightTitle: 'Chronologisch — ein neues Spiel hängt sich rechts an',
    markNewestPill: 'Neuestes markieren',
    markNewestTitle: "'NEWEST' unter der jeweils neuesten Blase",
    deckPlacementGroupLabel: 'Platzierung',
    placementTop: 'Oben',
    placementTopTitle: 'Direkt unter dem Profilkopf, über der Session',
    placementBottom: 'Unten',
    placementBottomTitle: 'Unter der Session, am Ende des Stapels',
    placementLeft: 'Links',
    placementLeftTitle: 'Eigene Spalte links neben allem — genau so hoch wie der Rest',
    placementRight: 'Rechts',
    placementRightTitle: 'Eigene Spalte rechts neben allem — genau so hoch wie der Rest',

    obsOverlayTitle: 'OBS-Overlay',
    obsOverlayHint: 'Binde diesen Link als Browser-Quelle in OBS ein.',
    linkLoading: 'Lade…',
    copyTitle: 'Kopieren',
    showTitle: 'Anzeigen',
    hideTitle: 'Verbergen',
    regenLink: 'Link neu generieren',

    chatCmdTitle: 'Twitch-Chat-Befehle',
    chatCmdDescPre: 'Aktiviere den Befehl in deinem eigenen Twitch-Kanal, damit ',
    chatCmdDescMod: 'Moderatoren',
    chatCmdDescMid: ' (und du selbst) das Overlay per Chat steuern können — kein zusätzlicher Twitch-Connect, läuft über den ohnehin schon laufenden Chat-Bot der Seite:',
    chatCmdList: [
      { code: '!tracker set #KÜRZEL', desc: 'zeigt diesen (bereits verknüpften) Account im Overlay' },
      { code: '!tracker mode <ranked|trophy|2v2>', desc: 'wechselt den getrackten Wert des aktiven Accounts' },
      { code: '!tracker reset', desc: 'setzt die Session (Profit/Win-Loss/letzte 5) des aktiven Accounts im gerade getrackten Modus zurück' },
      { code: '!tracker add #KÜRZEL', desc: 'verknüpft einen neuen Account' },
      { code: '!tracker list', desc: 'listet alle verknüpften Accounts mit Spielername' },
    ],
    chatCmdDescPost: '"!tracker #KÜRZEL" (ohne "set") funktioniert weiterhin als Kurzform.',
    chatActiveLabel: 'Befehl aktiv',
    chatActiveDesc: (p) => `Aktiv in #${p.channel}`,
    chatActiveDescEmpty: 'Mit Twitch einloggen, um den Kanal zu erkennen',

    apiConnected: 'Clash Royale API verbunden',
    apiNotConfigured: 'Clash Royale API nicht konfiguriert',
    apiConnectedDesc: 'Liga, Trophäen und Matches werden automatisch über das Spieler-Kürzel synchronisiert.',
    apiNotConfiguredDesc: 'Accounts können trotzdem verknüpft werden, aber ohne automatischen Abgleich. Hinterlege dazu CLASH_ROYALE_API_TOKEN in der Backend-.env.',

    // ── Overlay-Inhalt (WinTrackerOverlayPage.jsx + OverlayPreview.jsx) ──────
    bestLabel: 'Beste',
    stepSingular: 'Stufe',
    stepPlural: 'Stufen',
    loadingPreview: 'Lade Vorschau…',
    demoDataHint: 'Beispieldaten — sobald dein aktiver Account Spiele hat, zeigt die Vorschau live deine echten Werte.',
    eyeShow: 'Einblenden',
    eyeHide: 'Ausblenden',
  },

  en: {
    // ── Page frame ─────────────────────────────────────────────────────────
    pageSubtitle: 'League, trophies and your latest matches — live in the OBS overlay, straight from the official Clash Royale API.',
    languageLabel: 'Language',
    loginRequired: 'Login required',
    loginHint: 'Sign in with Twitch to manage your accounts and the overlay.',
    loginButton: 'Log in with Twitch',
    tabAccounts: 'Accounts',
    tabSettings: 'Settings',
    loadingAccounts: 'Loading accounts…',

    // ── AddAccountModal ────────────────────────────────────────────────────
    addAccountTitle: 'Add account',
    addAccountHint: 'Enter your player tag. You can find it in Clash Royale in your profile, under your name.',
    addAccountBusy: 'Linking…',
    addAccountSubmit: 'Link account',

    // ── AccountsTab ────────────────────────────────────────────────────────
    yourAccounts: 'Your Accounts',
    yourAccountsHint: 'The active account feeds your Win Tracker overlay — every account tracks its own value. In league 1–6 the tracker counts steps instead of medals; set the step once to match your real standing.',
    addAccountBtn: 'Add account',
    emptyTitle: 'No account linked yet',
    emptyHint: 'Link your Clash Royale account via your player tag to track league, trophies and matches in the overlay.',
    active: 'Active',
    activate: 'Activate',
    trackedValue: 'Tracked value',
    // Ranked covers both phases of the 1v1 ranked ladder (steps in league 1-6, medals from
    // Ultimate Champion on) — one label on purpose, instead of switching between "Steps" and
    // "Medals" depending on the current league, so the option doesn't change its name.
    optRanked: 'Ranked',
    optTrophies: 'Trophies',
    opt2v2: '2v2 Ranked',
    titleTrophiesLifetime: 'Lifetime trophies from the profile',
    titleStepsLeague: 'Steps within this league — back to medals from Ultimate Champion on',
    titleMedalsSeason: 'Score of the current ranked season',
    // 2v2 Ranked (since September 2026, a time-limited season): its own medal-like score,
    // independent of 1v1 medals/trophies — 0 means either "never synced" or the seasonal
    // 2v2 Ranked window isn't currently running (see league2v2 in crApi.js).
    titleLeague2v2Season: "Score of the current 2v2 Ranked season — 0 when no 2v2 Ranked window is currently running",
    bestTrophiesLabel: (p) => `Trophies · Best ${p.n}`,
    medalsSeasonLabel: 'Medals (season)',
    league2v2Label: (p) => `2v2 Ranked · Best ${p.n}`,
    refreshNow: 'Refresh now',
    removeAccount: 'Remove account',
    confirmRemove: (p) => `Really remove account "${p.name}"?`,
    resetSessionBtn: 'Reset session',
    resetSessionTitle: 'Reset profit/win-loss/last 5 to right now, without waiting for the automatic 4h gap',
    confirmResetSession: 'Reset session stats now? Already played matches will no longer count for profit/win-loss/last 5 afterwards.',
    autoSwitchLabel: 'Auto-switch',
    autoSwitchDesc: "Switches the tracked value automatically to whatever mode you last played (ranked, trophies or 2v2) on every sync — the selection above is locked while this is on, since a manual choice would just get overwritten by the next sync anyway.",

    // ── LadderValue ────────────────────────────────────────────────────────
    stepsUnit: 'Steps',
    bonusTitle: 'Season-reset bonus: wins currently count for more than 1 step, drops by 1 with every win',
    bonusLabel: (p) => `Bonus +${p.n}`,
    stepCorrectTitle: 'Correct the step — crossing a league boundary automatically moves the league too',

    // ── Module definitions ─────────────────────────────────────────────────
    moduleDeckLabel: 'Current Deck',
    moduleDeckDesc: 'The 8 cards of the most recently played match — automatically the ranked or trophy-road deck. Sits in the stack on top/bottom, or as its own column to the left/right of everything else, exactly as tall as the rest.',
    moduleSessionLabel: 'Session & Recent Games',
    moduleSessionDesc: 'Profit, win/loss, win rate of the current session (resets after 4h without a ranked match), plus the last 5 matches — right below, no divider.',
    visible: 'Visible',
    hidden: 'Hidden',
    ariaHideModule: 'Hide module',
    ariaShowModule: 'Show module',
    profileHeadLabel: 'Profile Header',
    profileHeadDesc: 'Name, league/step and main value (medals/trophies) at the top of the card.',

    // ── SettingsTab ────────────────────────────────────────────────────────
    regenerateConfirm: 'Generate a new overlay link? The old link will stop working (OBS needs to be updated).',
    designerTitle: 'Overlay Designer',
    designerDesc: 'This is exactly the card that ends up in the overlay. Use the eye icon at the top right of a part to show/hide it directly — also works in the list below, which additionally has fine-tuning per part, including deck placement (top/bottom in the stack, or its own column to the left/right, exactly as tall as the rest). The header (name, league, main value) always stays in first place, but can be hidden just like deck and session.',
    // 100% means FULLY visible — "Transparency" would have read the opposite way (100%
    // transparency = invisible). "Opacity" matches the slider's actual direction.
    transparency: 'Opacity',
    // ── Colors card ──────────────────────────────────────────────────────────
    sectionColorsTitle: 'Colors',
    sectionColorsDesc: 'Background, gradient and border of the overlay card.',
    bgColorLabel: 'Background color',
    bgGradientLabel: 'Gradient',
    bgGradientDesc: 'A second color for a diagonal gradient instead of a flat fill.',
    bgColor2Label: 'Second color',
    borderColorLabel: 'Border color',
    borderColorAutoLabel: 'Automatic',
    borderColorAutoTitle: 'Subtle light line that follows the opacity — no custom color set',
    // ── Tracked value card ───────────────────────────────────────────────────
    sectionTrackedDesc: 'Which value shows in the card header — every mode has its own session stats and its own deck.',
    // ── Visuals card ─────────────────────────────────────────────────────────
    sectionVisualsTitle: 'Visuals',
    sectionVisualsDesc: 'Which parts the card shows, and how they’re displayed.',
    // ── ON/OFF button ────────────────────────────────────────────────────────
    onLabel: 'ON',
    offLabel: 'OFF',
    // ── Sidebar ──────────────────────────────────────────────────────────────
    livePreviewTitle: 'Live Preview',
    copiedLabel: 'Copied!',
    apiConnectedShort: 'API connected',
    apiNotConfiguredShort: 'API not configured',
    displayGroupLabel: 'Display',
    stepBarPill: 'Step bar',
    stepBarTitle: 'The filled bars under the step number (league 1-6 only) — hiding it makes the overlay a bit shorter, the number itself stays',
    dailyProfitPill: 'Daily Profit',
    dailyProfitTitle: 'Balance of the current session (+/-)',
    winLossNumbersPill: 'Win/Loss numbers',
    winLossNumbersTitle: 'e.g. 14W – 6L',
    winRatePctPill: 'Win rate %',
    winRatePctTitle: 'Win rate of the current session',
    last5Pill: 'Last 5 games',
    last5Title: 'Only matches from the current session',
    last5DisplayGroupLabel: 'Display of recent games',
    styleResultLabel: 'Win/Lose',
    styleResultTitle: 'Bubble with text',
    styleDeltaLabel: '+/-',
    styleDeltaTitle: 'Bubble with the change — medals/trophies, in league 1-6 instead +1/-1 step',
    styleDotLabel: 'Dots',
    styleDotTitle: 'Just small green/red circles, no text',
    orderGroupLabel: 'Order & Marker',
    newestLeftLabel: 'Newest on left',
    newestLeftTitle: 'A new game slides in on the left, pushing the others to the right',
    newestRightLabel: 'Newest on right',
    newestRightTitle: 'Chronological — a new game gets appended on the right',
    markNewestPill: 'Mark newest',
    markNewestTitle: "'NEWEST' under whichever bubble is the most recent",
    deckPlacementGroupLabel: 'Placement',
    placementTop: 'Top',
    placementTopTitle: 'Right under the profile header, above the session',
    placementBottom: 'Bottom',
    placementBottomTitle: 'Below the session, at the end of the stack',
    placementLeft: 'Left',
    placementLeftTitle: "Its own column to the left of everything — exactly as tall as the rest",
    placementRight: 'Right',
    placementRightTitle: "Its own column to the right of everything — exactly as tall as the rest",

    obsOverlayTitle: 'OBS Overlay',
    obsOverlayHint: 'Add this link as a browser source in OBS.',
    linkLoading: 'Loading…',
    copyTitle: 'Copy',
    showTitle: 'Show',
    hideTitle: 'Hide',
    regenLink: 'Regenerate link',

    chatCmdTitle: 'Twitch Chat Commands',
    chatCmdDescPre: 'Turn the command on in your own Twitch channel, so ',
    chatCmdDescMod: 'moderators',
    chatCmdDescMid: ' (and you) can control the overlay via chat — no additional Twitch connection needed, it runs through the site’s existing chat bot:',
    chatCmdList: [
      { code: '!tracker set #TAG', desc: 'shows this (already-linked) account in the overlay' },
      { code: '!tracker mode <ranked|trophy|2v2>', desc: 'switches the tracked value of the active account' },
      { code: '!tracker reset', desc: "resets the active account's session (profit/win-loss/last 5) in its currently tracked mode" },
      { code: '!tracker add #TAG', desc: 'links a new account' },
      { code: '!tracker list', desc: 'lists every linked account with its player name' },
    ],
    chatCmdDescPost: '"!tracker #TAG" (without "set") still works as a shorthand.',
    chatActiveLabel: 'Command active',
    chatActiveDesc: (p) => `Active in #${p.channel}`,
    chatActiveDescEmpty: 'Log in with Twitch to detect the channel',

    apiConnected: 'Clash Royale API connected',
    apiNotConfigured: 'Clash Royale API not configured',
    apiConnectedDesc: 'League, trophies and matches sync automatically via the player tag.',
    apiNotConfiguredDesc: 'Accounts can still be linked, but without automatic syncing. Set CLASH_ROYALE_API_TOKEN in the backend .env for that.',

    // ── Overlay content (WinTrackerOverlayPage.jsx + OverlayPreview.jsx) ────
    bestLabel: 'Best',
    stepSingular: 'Step',
    stepPlural: 'Steps',
    loadingPreview: 'Loading preview…',
    demoDataHint: "Sample data — once your active account has games, the preview shows your real values live.",
    eyeShow: 'Show',
    eyeHide: 'Hide',
  },
};

/** Wörterbuch zu einer Sprache; unbekannte Kürzel fallen auf Deutsch zurück. */
export const dictForWt = (lang) => WT_I18N[lang] || WT_I18N.de;

/** Text mit eingesetzten Werten auflösen — value ist entweder ein fertiger String oder eine
 *  Funktion (params) -> String (siehe resolveError() in ../i18n.js für dasselbe Muster). */
export function wt(t, key, params) {
  const entry = t[key];
  return typeof entry === 'function' ? entry(params || {}) : (entry ?? '');
}
