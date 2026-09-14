// winTrackerStore.js — Clash Royale Win Tracker Overlay: verknüpfte Accounts,
// gesammelter Battlelog-Verlauf (für Daily-Stats) und Overlay-Einstellungen.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'cr_wintracker.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS cr_wintracker_accounts (
    account_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    twitch_login TEXT DEFAULT '',
    player_tag TEXT NOT NULL,
    player_name TEXT DEFAULT '',
    trophies INTEGER NOT NULL DEFAULT 0,
    best_trophies INTEGER NOT NULL DEFAULT 0,
    season_medals INTEGER NOT NULL DEFAULT 0,
    league_number INTEGER NOT NULL DEFAULT 0,
    pol_rank INTEGER,
    is_active INTEGER NOT NULL DEFAULT 0,
    last_fetched INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, player_tag)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_wt_accounts_user ON cr_wintracker_accounts(user_id)`);

// Migration für bereits bestehende Installationen (Spalte kam nach dem ersten Release dazu).
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN season_medals INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
// Getrackter Wert pro Account ('medals' | 'trophies'). Leer = erbt die globale Voreinstellung
// aus cr_wintracker_settings.track_mode (so verhalten sich Accounts von vor dieser Spalte weiter wie bisher).
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN track_mode TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }

// Ankerpunkt der Ranked-Leiter (Ligen 1-6): unterhalb von Ultimate Champion gibt es keine
// Medaillen, sondern Stufen. Die API liefert die aktuelle Stufe nicht mit, deshalb zählen wir
// sie selbst aus dem Battlelog — ab ladder_anchor_ms, beginnend bei ladder_step in ladder_league.
// Der Anker wird neu gesetzt, wenn der Nutzer die Stufe korrigiert oder die Liga wechselt.
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN ladder_step INTEGER NOT NULL DEFAULT 1"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN ladder_league INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN ladder_anchor_ms INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
// Season-Reset-Bonus ab dem Anker: wer letzte Season eine höhere Liga erreicht hat, startet die
// neue Season (immer in Liga 1) mit diesem Bonus — jeder Sieg zählt so lange dieser Wert statt
// des normalen +1, dann sinkt der Bonus um 1 (siehe computeLadder in crWinTrackerRoutes.js).
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN ladder_bonus_start INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }

// Kumulativer Stufenzähler für die ganze Session, UNABHÄNGIG von ladder_anchor_ms: der Anker
// oben wird bei jedem Liga-Aufstieg neu gesetzt (Stufe 1 in der neuen Liga) — nötig für die
// "aktuelle Stufe"-Anzeige, wirft dabei aber die bereits erklommenen Stufen des Tages weg. Dieser
// Zähler bleibt über Liga-Wechsel hinweg erhalten und wird nur bei einer neuen Session (>4h Pause,
// siehe SESSION_GAP_MS) zurückgesetzt. Siehe updateSessionClimb in crWinTrackerRoutes.js.
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN session_climb INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN session_climb_anchor_ms INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }

// Deck des letzten Matches je Modus-Gruppe (Ranked1v1 vs. Ladder/Trophy Road) — die offizielle
// API kennt kein "aktuelles Deck pro Modus", deshalb wird es aus dem Battlelog abgeleitet
// (siehe extractDeckFromBattles in crWinTrackerRoutes.js). JSON-Array aus bis zu 8 Karten.
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN ranked_deck TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN ranked_deck_at INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN trophy_deck TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN trophy_deck_at INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }

// 2v2 Ranked (dritter trackMode neben Medaillen/Trophäen, seit September 2026): eigener
// Medaillen-Stand + eigenes zuletzt gespieltes Deck, unabhängig von den 1v1-Spalten oben —
// siehe extractLeague2v2Progress in crApi.js für die Herkunft der Werte.
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN league2v2_trophies INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN league2v2_best_trophies INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN league2v2_deck TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN league2v2_deck_at INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }

// Gesammelter Verlauf einzelner Spiele — wird bei jedem Sync um neue Battlelog-Einträge
// ergänzt (INSERT OR IGNORE via UNIQUE(account_id, battle_time)). Die offizielle API liefert
// nur die letzten ~25 Spiele, deshalb müssen wir selbst mitschreiben, um Tagesstatistiken über
// den ganzen Tag hinweg korrekt aufzusummieren.
db.exec(`CREATE TABLE IF NOT EXISTS cr_wintracker_battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    battle_time TEXT NOT NULL,
    battle_time_ms INTEGER NOT NULL,
    result TEXT NOT NULL,
    trophy_change INTEGER NOT NULL DEFAULT 0,
    crowns_for INTEGER NOT NULL DEFAULT 0,
    crowns_against INTEGER NOT NULL DEFAULT 0,
    opponent_name TEXT DEFAULT '',
    game_mode TEXT DEFAULT '',
    UNIQUE(account_id, battle_time)
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_wt_battles_account_time ON cr_wintracker_battles(account_id, battle_time_ms DESC)`);

// arena.rawName des Battles — braucht es nur für 2v2, um ein 2v2-Ranked-Match ("2v2League_...")
// von einem gewöhnlichen 2v2-Freundschaftsspiel zu unterscheiden (beide teilen denselben
// game_mode "TeamVsTeam"). Siehe is2v2RankedBattle in crWinTrackerRoutes.js.
try { db.exec("ALTER TABLE cr_wintracker_battles ADD COLUMN battle_arena TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }

db.exec(`CREATE TABLE IF NOT EXISTS cr_wintracker_settings (
    user_id TEXT PRIMARY KEY,
    overlay_key TEXT UNIQUE NOT NULL,
    show_daily_profit INTEGER NOT NULL DEFAULT 1,
    show_win_loss_numbers INTEGER NOT NULL DEFAULT 1,
    show_win_loss_percent INTEGER NOT NULL DEFAULT 1,
    show_last5 INTEGER NOT NULL DEFAULT 1,
    track_mode TEXT NOT NULL DEFAULT 'medals',
    bg_color TEXT NOT NULL DEFAULT '#0c0c12',
    bg_opacity INTEGER NOT NULL DEFAULT 88,
    last5_as_result INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
)`);
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN track_mode TEXT NOT NULL DEFAULT 'medals'"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN show_last5 INTEGER NOT NULL DEFAULT 1"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN bg_color TEXT NOT NULL DEFAULT '#0c0c12'"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN bg_opacity INTEGER NOT NULL DEFAULT 88"); } catch { /* Spalte existiert bereits */ }
// Letzte 5 Spiele als "Win"/"Lose" statt als Medaillen-Änderung — in den Stufen-Ligen ist die
// Änderung immer 0, dort erzwingt das Overlay die Text-Variante ohnehin. Default 0: sonst würde
// die Text-Variante auch dort erzwungen, wo tatsächlich Medaillen gutgeschrieben werden.
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN last5_as_result INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }

// Overlay-Designer: Sichtbarkeit + Reihenfolge der Module (Kopf bleibt fix an Position 1, der
// Rest ist sortierbar). module_order ist ein JSON-Array von Modul-Keys ("deck","daily","last5").
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN show_deck INTEGER NOT NULL DEFAULT 1"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN module_order TEXT NOT NULL DEFAULT '[\"deck\",\"daily\",\"last5\"]'"); } catch { /* Spalte existiert bereits */ }
// Der Kopfbereich (Name, Liga/Stufe, Hauptwert) ist zwar fix an Position 1 und nicht mit den
// drei Modulen sortierbar, aber genau wie sie ein-/ausblendbar.
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN show_profile INTEGER NOT NULL DEFAULT 1"); } catch { /* Spalte existiert bereits */ }

// Twitch-Chat-Befehl "!tracker #TAG": schaltet den aktiven Account um (nur Mods/Broadcaster).
// chat_channel ist der Kanal (ohne "#"), in dem der gemeinsame IRC-Bot mitliest.
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN chat_channel TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN chat_enabled INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
db.exec(`CREATE INDEX IF NOT EXISTS idx_wt_settings_chat_channel ON cr_wintracker_settings(chat_channel)`);

// Layout-Überarbeitung (Session+Letzte-5 zu einem Modul verschmolzen, Deck seitlich
// andockbar): last5_style ersetzt den alten Boolean last5_as_result um eine dritte
// Darstellung (nur Punkte) zu erlauben — einmalig direkt nach dem Anlegen der Spalte aus
// dem alten Boolean rückwirkend befüllt, damit eine bestehende Wahl (Text vs. Zahl) erhalten
// bleibt. Ein Restart danach überspringt den try-Block (Spalte existiert schon) und lässt
// eine spätere echte Nutzerwahl in Ruhe. deck_placement ersetzt die feste "deck"-Position in
// module_order (die Spalte bleibt ungenutzt in der Tabelle stehen statt sie per Migration zu
// entfernen — SQLite-DROP-COLUMN bräuchte einen Tabellen-Neubau, unnötiges Risiko für ein
// Feld, das niemand mehr liest).
try {
  db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN last5_style TEXT NOT NULL DEFAULT 'result'");
  db.exec("UPDATE cr_wintracker_settings SET last5_style = CASE WHEN last5_as_result = 1 THEN 'result' ELSE 'delta' END");
} catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN deck_placement TEXT NOT NULL DEFAULT 'top'"); } catch { /* Spalte existiert bereits */ }
// Stufenleiste (die gefüllten Balken unter Name/Liga in Liga 1-6) einzeln ausblendbar — spart
// vertikale Höhe im Overlay, die Stufenzahl selbst ("7/11 Stufe · Liga 3") bleibt davon unberührt.
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN show_ladder_bar INTEGER NOT NULL DEFAULT 1"); } catch { /* Spalte existiert bereits */ }
// Richtung der letzte-5-Spiele-Reihe: 'newestLeft' (Standard, neuestes ganz links, wie vor der
// Session-Scoping-Umstellung) oder 'newestRight' (neuestes rutscht rechts rein, chronologisch).
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN last5_direction TEXT NOT NULL DEFAULT 'newestLeft'"); } catch { /* Spalte existiert bereits */ }
// Kleine "NEU"-Markierung am jeweils neuesten Spiel der Reihe.
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN last5_new_badge INTEGER NOT NULL DEFAULT 1"); } catch { /* Spalte existiert bereits */ }
// Sprache von Editor-Seite UND Overlay-Inhalt ('de' | 'en') — eine einzige Einstellung für
// beides, weil wer sein Overlay auf Englisch stellt, in aller Regel auch die Editor-Seite
// selbst lieber auf Englisch bedient.
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN language TEXT NOT NULL DEFAULT 'de'"); } catch { /* Spalte existiert bereits */ }

// Editor-Redesign (Farben-Sektion): Verlauf statt einfarbigem Hintergrund + eigene Rahmenfarbe.
// bg_gradient ist nur ein Schalter — bg_color (schon vorhanden) bleibt der erste Farbton, bg_color_2
// ist NUR der zweite Verlaufston und wird ignoriert, solange bg_gradient aus ist (kein zusätzliches
// "welche Farbe gilt gerade"-Feld nötig). border_color leer ('') heißt "automatisch" — der bisherige,
// von bg_opacity abgeleitete dezente weiße Rand bleibt dann unverändert (siehe hexToRgba-Aufrufer in
// OverlayPreview.jsx/WinTrackerOverlayPage.jsx); erst ein gesetzter Hex-Wert ersetzt ihn.
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN bg_gradient INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN bg_color_2 TEXT NOT NULL DEFAULT '#1a1a2e'"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_settings ADD COLUMN border_color TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }

// Manueller Session-Reset (Button im Editor, siehe /accounts/:id/reset-session in
// crWinTrackerRoutes.js): hebt den Sessionbeginn auf "jetzt" an, ohne auf die automatische
// 4h-Lücken-Regel warten zu müssen — für wer vor Stream-Start schon ein paar Spiele gespielt hat
// und die nicht in Profit/Win-Loss/letzte 5 sehen will. Eigene Spalte für Ranked1v1 (deckt
// medals+trophies ab, die teilen sich dieselbe Session) und 2v2 Ranked (eigene Session).
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN session_reset_at INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN session_reset_2v2_at INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
// Trophäenmodus bekam ursprünglich keine eigene Session (lief fälschlich über die Ranked1v1-Spalte
// oben mit, siehe computeTrophySessionStartMs in crWinTrackerRoutes.js) — eigene Spalte dafür.
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN session_reset_trophy_at INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }

// Autoswitch (Checkbox pro Account, siehe autoSwitchTrackMode in crWinTrackerRoutes.js): schaltet
// track_mode bei jedem Sync automatisch auf den Modus des zuletzt gespielten Matches um (Ranked1v1
// -> medals, Ladder -> trophies, 2v2 League -> 2v2) — braucht keine eigene Spalte für "zuletzt
// gespielter Modus", das steckt schon implizit im Maximum aus ranked_deck_at/trophy_deck_at/
// league2v2_deck_at (jeweils der Zeitstempel des neuesten bekannten Matches dieser Gruppe).
try { db.exec("ALTER TABLE cr_wintracker_accounts ADD COLUMN auto_switch_mode INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }

// Beobachtungsliste für künftige Ranked-artige Event-Leiterboards (siehe recordDiscoveredModes
// in crWinTrackerRoutes.js): jeder progress-Eintrag, den ein Sync sieht und der noch keinem
// bekannten Modus zugeordnet ist, landet hier — rein informativ, ohne selbst Overlay-Verhalten
// auszulösen. So lässt sich künftig ohne manuelle API-Archäologie beantworten, ob/wann Supercell
// einen neuen Modus mit eigenem Leiterboard eingeführt hat (siehe project_cr_wintracker_2v2_ranked
// in der Projekt-Memory für die Vorgeschichte).
db.exec(`CREATE TABLE IF NOT EXISTS cr_wintracker_discovered_modes (
    prefix TEXT PRIMARY KEY,
    sample_key TEXT NOT NULL DEFAULT '',
    arena_name TEXT NOT NULL DEFAULT '',
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0
)`);

module.exports = db;
