// Weg-Planer: baut den Weg eines Levels ZUERST — Zug um Zug, jeder in der echten Sim gespielt — und erst danach die Welt
// um ihn herum (fuellung.js).
//
// Ein Schritt:
//   1. Richtung (aus dem Szenenplan) und Zug mit Stellgrößen würfeln
//   2. den Zug OHNE Ziel spielen: Die Flugbahn zeigt, wo man die gewünschte Höhe im Fallen kreuzt
//   3. dort eine Plattform setzen — nie im Korridor eines früheren Zugs, nie in der eigenen Flugbahn
//   4. alle Varianten (Ungenauigkeit eines Menschen, zuege.js) erneut spielen: Jede muss auf dieser Plattform landen
//   5. was die Varianten durchflogen haben, ist Korridor: Dort darf später nichts hin
//
// Weil jeder Zug so, wie er im Level steht, von der Sim gespielt wurde, ist der Weg nachweislich gangbar — mit der
// Ungenauigkeit eines Menschen. Die Füllung ändert daran nichts, sie setzt nur außerhalb des Korridors etwas.

import { TILE, PLAYER_W, PLAYER_H } from '../../../sim/config.js';
import { ausschnittWelt, spieleZug, beruehrteKacheln, standKachel } from './probe.js';
import { zugEingabe, zugFertig, varianten, mitVorlauf } from './zuege.js';
import { erreichbar, ohneMechanikErreichbar } from './regeln.js';
import { KOPFRAUM, ZIEL_BREITE } from '../gemeinsam/plattform.js';
import { motivFaehig, motivKopie, variiere } from './motive.js';
import { TEUER } from './szenen.js';

/** Versuche mit teuren Aufgaben je gemischtem Level (szenen.js TEUER; im Extrem-Level trägt gerade SIE das Level — dort kein
 *  Budget); danach nur noch günstige — hält die Bauzeit in Schach, ohne die
 *  Uhr zu fragen (gleicher Seed, gleiches Level auf jedem Rechner). Gemessen: ohne Deckel bis 20 s je Level. */
const TEUER_BUDGET = 400;

const ROCK = '#';
const AIR = '.';
const RAND = 4;                      // Kacheln Abstand zum Rasterrand
/** Die gemeinsame Zielplattform (gemeinsam/plattform.js) ist 9 breit und räumt 14 Zeilen Kopfraum frei — die letzte
 *  Plattform muss so breit sein, und darüber darf nichts vom Weg liegen, sonst verschwindet es. */
const ZIEL_W = 11;
/** Ticks von der Landung bis zum Stillstand auf einer Bröckelplattform (gemessen: Abbremsen ≤ 12, Stehen 3) */
const VORLAUF_BROECKEL = 16;
const ZIEL_KOPF = 16;
/** Höchste Zeile der letzten Plattform: Die gemeinsame Schicht hält über dem Ziel KOPFRAUM + 2 Zeilen frei und schiebt eine
 *  höhere Zielplattform nach unten — weg vom letzten Zug (gemessen: Ring-Zug auf Zeile 10, Ziel landete auf Zeile 15, der
 *  Graph fand es nicht mehr). Zeilen über dem Rasterrand zählen bei frei() als frei, die Kopfraum-Prüfung allein fängt das nicht. */
const ZIEL_ZEILE_MIN = KOPFRAUM + 3;

/**
 * Zug mit Stellgrößen für eine Richtung würfeln. dy: Zeilen (negativ = hinauf).
 * `mechanik`: was die Szene erlaubt ('feder' | 'ring' | 'greifen' | 'portal', mit + verbunden); `sperre`: feste Laufrichtung.
 */
function wuerfleZug(rng, richtungEin, d, limits, mechanik = '', sperre = null, zwang = false, eng = false) {
  // 'hochlinks' / 'hochrechts': hinauf mit fester Richtung (Zickzack auf der Stelle, etwa zwischen zwei Etagen)
  // …ebenso 'runterlinks' / 'runterrechts'
  const richtung = richtungEin.startsWith('hoch') ? 'hoch' : richtungEin.startsWith('runter') ? 'runter' : richtungEin;
  let dir = richtungEin.endsWith('links') ? -1 : richtungEin.endsWith('rechts') ? 1 : (rng.range(0, 1) < 0.5 ? -1 : 1);
  if (sperre) dir = sperre;
  const erlaubt = new Set(mechanik ? mechanik.split('+') : []);
  // Zwang: genau eine der Mechaniken der Szene, sicher (sonst gewann meist ein schlichter Sprung — Rückmeldung 26.09.2026:
  // „fast nur Sprünge mit Stachelgruben“; gemessen ~30 von 40 Zügen)
  // (Bröckel und Ring seltener: Sie gelingen fast immer und verdrängten sonst die anderen Teile einer Kombination — seit
  // den Ring-Ketten waren beim Windläufer 44 % der Züge Ringe, mehr als Böen)
  const teile = [...erlaubt];
  // (das Nadelöhr als Zusatz: In Kombinationen wird meist die andere Mechanik gewählt, die Röhren kommen dazu)
  const gewicht = (m) => (m === 'broeckel' ? 0.35 : m === 'ring' ? 0.5 : (m === 'nadeloehr' || m === 'schluesselsprung') && teile.length > 1 ? 0 : 1);
  const gewaehlt = zwang && teile.length ? rng.weighted(teile, teile.map(gewicht)) : null;
  const nimm = (m, p) => (gewaehlt ? m === gewaehlt : erlaubt.has(m) && rng.range(0, 1) < p);

  // Kristallkette (Rückmeldung 27.09.2026: „Chain-Kristalle“): Sprung, Doppelsprung, am Scheitel ein Kristall — Dash nach oben,
  // am nächsten Scheitel der nächste … der letzte Dash schräg zur Zielplattform, die kein Doppelsprung erreicht
  if (richtung === 'hoch' && nimm('kette', 0.7)) {
    const n = rng.intRange(2, 3);
    const zug = {
      art: 'doppel', dir, mechanik: 'kette', halte: rng.intRange(26, 32), kanteVersatz: -rng.intRange(4, 16),
      doppelNach: rng.intRange(18, 26), doppelHalte: 8, kette: n,
      kReaktion: Array.from({ length: n }, () => rng.intRange(0, 4)),
      kDiag: Array.from({ length: n }, (_, k) => k === n - 1),
    };
    // (10–13 Zeilen: mehr sprengte meist das Höhenbudget der noch folgenden Aufstiege)
    return { zug, dy: -rng.intRange(10, 13) };
  }
  // Kopfüber-Passage (Rückmeldung 27.09.2026: „Schwerkraft-Zonen, kombiniert mit bestehenden Aufgaben — kopfüber schwere
  // Sprünge“): hinauf in eine Zone, kopfüber an der Decke über Stachelstreifen springen, am Ende zurück auf den Boden
  if ((richtung === 'links' || richtung === 'rechts') && nimm('kopfueber', 0.7)) {
    const schnell = limits.maxGap > 10;
    // Schwer (ab Stufe 3, jede zweite): zwei Stachelstreifen mit einem winzigen Deckenblock dazwischen — ein Einzelblock kopfüber
    const schwer = d >= 3 && rng.range(0, 1) < 0.5;
    const luecke = () => (schnell ? rng.intRange(3, 5) : rng.intRange(2, 3));
    const anfang = schnell ? rng.intRange(7, 9) : rng.intRange(5, 7);
    const zug = {
      art: 'kopfueber', dir, mechanik: 'kopfueber', halte: rng.intRange(14, 22), kanteVersatz: -rng.intRange(0, 8),
      hz: rng.intRange(6, 8), schwer,
      // (erstes Deckenstück lang: Nach dem Kippen „landet“ man erst ~4 Kacheln hinter der Kante an der Decke — kürzer, und die
      // Landestelle lag vor oder in den Stacheln)
      plan: schwer ? [anfang, luecke(), 2, luecke(), rng.intRange(4, 6)] : [anfang, luecke(), rng.intRange(4, 7)],
      halteK: [rng.intRange(6, 10), rng.intRange(6, 10)],
    };
    return { zug, dy: rng.intRange(0, 2) };
  }
  // Brückenblock: eine zu lange Platte über einer Grube, zu breit für jeden Sprung — auslösen, ausweichen, hinüber
  if ((richtung === 'links' || richtung === 'rechts') && nimm('bruecke', 0.7)) {
    const zug = {
      art: 'bruecke', dir, mechanik: 'bruecke', reaktion: rng.intRange(4, 14), halte: rng.intRange(24, 32),
      sprungAbstand: rng.intRange(4, 16), luecke: rng.intRange(1, 3), hoehe: rng.intRange(5, 6),
    };
    return { zug, dy: 0 };
  }
  // Deckel: eine Platte verschließt ein Loch in der Decke, über der es weitergeht — auslösen, ausweichen, durch das Loch
  if (richtung === 'hoch' && nimm('deckel', 0.7)) {
    const zug = {
      art: 'deckel', dir, mechanik: 'deckel', reaktion: rng.intRange(4, 12), halte: rng.intRange(26, 32), doppelNach: rng.intRange(14, 22),
      abstand: rng.intRange(3, 5), breite: rng.intRange(3, 4), hoehe: rng.intRange(4, 5),
    };
    return { zug, dy: -(zug.hoehe + 1) };
  }
  if (nimm('portal', 0.25)) return { zug: { art: 'portal', dir, nachlauf: rng.intRange(10, 20), mechanik: 'portal' }, dy: 0 };
  // Mitfahrt: Fähre (waagerecht über eine Lücke) oder Aufzug (senkrecht hinauf) — warten, aufspringen, mitfahren, abspringen
  if (richtung !== 'runter' && nimm('mitfahrt', 0.8)) {
    const hoch = richtung === 'hoch';
    const zug = {
      art: 'mitfahrt', dir, mechanik: 'mitfahrt', moverArt: hoch ? 'hoch' : 'quer',
      moverLaenge: hoch ? rng.intRange(6, 11) : rng.intRange(6, 12), moverTempo: rng.intRange(5, 8) * 10,
      reaktion: rng.intRange(2, 12), reaktion2: rng.intRange(2, 10), halte: rng.intRange(10, 20), halte2: rng.intRange(14, 28),
      kanteVersatz: -rng.intRange(0, 10),
    };
    return { zug, dy: hoch ? -zug.moverLaenge : 0 };
  }
  // Wandschacht: 11–15 Zeilen hinauf — weit mehr, als ein Doppelsprung (7,5) schafft
  if (richtung !== 'runter' && nimm('wand', richtung === 'hoch' ? 0.7 : 0.45)) {
    const zug = {
      // Sprünge lange gehalten: Kurz gedrückt reicht ein Wandsprung nicht über den Schacht UND höher
      art: 'wand', dir, mechanik: 'wand', halte: rng.intRange(26, 34), kanteVersatz: -rng.intRange(2, 10),
      reaktion: rng.intRange(8, 20), wandHalte: rng.intRange(26, 34),
    };
    return { zug, dy: -rng.intRange(11, 15) };
  }
  if (nimm('feder', richtung === 'hoch' ? 0.65 : 0.35)) {
    // Doppelsprung im Flug: Die Feder füllt den Luftsprung auf, erst beides zusammen trägt über 7,5 Zeilen
    const zug = { art: 'feder', dir, mechanik: 'feder', doppelNach: rng.intRange(24, 44) };
    if (rng.range(0, 1) < (eng ? 0.9 : 0.4)) zug.loslassen = rng.intRange(eng ? 4 : 20, eng ? 20 : 40);
    // Nur Ziele, die ein Doppelsprung (7,5 Zeilen) NICHT schafft — sonst ist die Feder unnötig (regeln.js). Die Feder
    // füllt den Luftsprung auf: Feder + Doppelsprung trägt bis ~15 Zeilen.
    return { zug, dy: -rng.intRange(8, 12) };
  }

  let dy;
  let art;
  if (richtung === 'hoch') { dy = -rng.intRange(eng ? 4 : 3, Math.max(eng ? 4 : 3, limits.maxUp)); art = dy <= -4 ? 'doppel' : 'sprung'; }
  else if (richtung === 'runter') { dy = rng.intRange(3, 8); art = rng.range(0, 1) < 0.4 ? 'fall' : 'sprung'; }
  else { dy = rng.intRange(-2, 2); art = rng.range(0, 1) < (d >= 3 ? 0.45 : 0.3) ? 'doppel' : 'sprung'; }
  const zug = { art, dir, halte: rng.intRange(14, 30), kanteVersatz: -rng.intRange(10, 20) };
  if (art === 'doppel') zug.doppelNach = rng.intRange(16, 34);
  if (art === 'fall' && rng.range(0, 1) < 0.4) zug.doppelNach = rng.intRange(10, 24);
  // Kurzer Bogen: Richtung früh loslassen (bei hohen Stufen häufiger — eine Aufgabe für sich)
  if (rng.range(0, 1) < 0.15 + 0.05 * d) zug.loslassen = rng.intRange(16, 30);
  // Im Schlot meist früh loslassen: Mit voller Richtung trägt ein Sprung bei „super“ über den ganzen Schacht
  if (eng && rng.range(0, 1) < 0.8) zug.loslassen = rng.intRange(8, 24);

  if (art !== 'fall' && nimm('ring', 0.5)) {
    // Ring-Kette: Sprung → Doppelsprung → Ring am zweiten Scheitel → noch ein Luftsprung (den der Ring zurückgibt).
    // Gemessen (normal/super): so 18/20 Kacheln weit bzw. 11 Zeilen hoch — ein Doppelsprung schafft 8/13,5 bzw. 6,6. Mit dem
    // Ring am ersten Scheitel und ohne weiteren Luftsprung ging fast jeder Ring-Zug auch ohne Ring (Rückmeldung 26.09.2026).
    zug.art = 'doppel';
    zug.halte = rng.intRange(24, 30);
    zug.doppelNach = rng.intRange(24, 32);
    zug.ring = richtung === 'hoch' ? rng.pick(['up', dir > 0 ? 'upRight' : 'upLeft'])
      : (dir > 0 ? rng.pick(['right', 'right', 'upRight']) : rng.pick(['left', 'left', 'upLeft']));
    zug.mechanik = 'ring';
    delete zug.loslassen;
    dy = richtung === 'hoch' ? -rng.intRange(8, 11) : rng.intRange(-3, 4);
  } else if (art !== 'fall' && (richtung === 'links' || richtung === 'rechts') && nimm('flappy', 0.8)) {
    // Flappy-Seil (Rückmeldung 27.09.2026: „Flappy Bird mit den Grapplern, wo man perfekt durch Lücken schwingen muss“):
    // 2–3 Schwünge am Stück, zwischen den Ankern Röhren mit Lücke — erst am Ende landen
    // (Die Anker und die Griffe nach Lage setzt der Planer entlang der gespielten Bahn)
    zug.flappy = rng.intRange(2, 3);
    zug.halte = rng.intRange(20, 30);
    zug.mechanik = 'flappy';
    zug.roehren = 1;
    delete zug.loslassen;
    delete zug.doppelNach;
    zug.art = 'sprung';
    dy = rng.intRange(-3, 3);
  } else if (art !== 'fall' && nimm('greifen', 0.8)) {
    zug.greifNach = rng.intRange(12, 26);
    zug.greifHalte = rng.intRange(40, 70);   // lang gehalten: Erst ein weiter Schwung trägt über einen Doppelsprung hinaus (gemessen: Seil bis 22 Kacheln, Doppelsprung 8,4 bei „normal“)
    zug.mechanik = 'greifen';
    delete zug.loslassen;
    delete zug.doppelNach;
    zug.art = 'sprung';
    dy = rng.intRange(-4, 3);
  } else if (art !== 'fall' && nimm('tor', 0.6)) {
    // Zeittor: Ein Laser schneidet die Flugbahn — man wartet auf seine Pause (zuege.js)
    zug.tor = true;
    zug.torReaktion = rng.intRange(8, 20);
    zug.mechanik = 'tor';
  } else if (art !== 'fall' && nimm('einzelblock', 0.7)) {
    // Einzelblock: Die Landefläche ist nur so breit, wie die Varianten es zulassen — höchstens 2 Kacheln
    zug.praezise = true;
    zug.mechanik = 'einzelblock';
    // Ab Stufe 3 mit ±4 statt ±6 Ticks geprüft (±33 ms): Auf 1–2 Kacheln lässt ±50 ms kaum einen Sprung zu — und die
    // Aufgabe SOLL schwer sein (Rückmeldung: „Single-Block-Jumps, die schwer sind“)
    if (d >= 3) zug.toleranz = 4;
  } else if (art !== 'fall' && (richtung === 'links' || richtung === 'rechts') && nimm('dashsprung', 0.7)) {
    // Dash-Sprung (Rückmeldung 27.09.2026: „mehr movement-based, eigener Input statt Warten“): Kristall vor der Kante,
    // an der Absprunglinie dashen und 2–6 Ticks später springen — der Sprung im Dash (Tech-Fenster 70 ms) trägt mit
    // Doppelsprung ~24,5 statt 20 Kacheln (super). Geprüft mit ±25 ms: Das Fenster selbst ist die Aufgabe.
    zug.art = 'doppel';
    zug.dashSprung = true;
    zug.dashNach = 0;
    // (gemessen, super: lang gehalten und später Doppelsprung tragen bis ~22 Kacheln —
    // mit kürzeren Werten blieb er bei 18–20, innerhalb der Doppelsprung-Reichweite, und war „unnötig“)
    zug.sprungNach = rng.intRange(2, 6);
    zug.halte = rng.intRange(32, 36);
    zug.doppelNach = rng.intRange(42, 48);
    // (knapp VOR der Kante: Dashte eine Variante erst hinter ihr in der Luft, fehlte der Boden-Tech und sie landete Kacheln
    // kürzer — die Streuung sprengte jede Landefläche; die Weite kostet das nur ~0,5 Kacheln)
    zug.kanteVersatz = -rng.intRange(0, 6);
    zug.toleranz = 3;
    zug.mechanik = 'dashsprung';
    delete zug.loslassen;
    dy = rng.intRange(-1, 0);                                 // nicht tiefer: Ein Fall trägt ohnehin weiter (erreichbar() rechnet ihn ein)
    // Meist flach unter einer Stacheldecke: getippt statt gehalten, ohne Doppelsprung — mit dem Dash davor ~43 % schneller
    // und so viel weiter als jeder flache Sprung ohne Dash. Der weite Dash-Sprung gewinnt nur 1–2 Kacheln auf den
    // Doppelsprung und gelang selten.
    if (rng.range(0, 1) < 0.75) {
      zug.flach = true;
      zug.art = 'sprung';
      zug.halte = rng.intRange(4, 8);
      // …und ein zweiter getippter Sprung: Unter der Decke kommt man ohne Dash so nicht hin (mit einem Tipp schaffte ein
      // Doppel-Hüpfer ohne Dash oft dasselbe — gemessen: kein einziger Dash-Sprung gelang)
      zug.art = 'doppel';
      zug.doppelNach = rng.intRange(14, 20);
      zug.doppelHalte = rng.intRange(4, 8);
      dy = rng.intRange(0, 1);
    }
  } else if (art !== 'fall' && (richtung === 'links' || richtung === 'rechts') && nimm('flach', 0.7)) {
    // Flacher Sprung: kurz getippt unter einer Stacheldecke hindurch — jeder normale Sprung stößt hinein
    zug.art = 'sprung';
    zug.flach = true;
    zug.halte = rng.intRange(4, 8);
    zug.kanteVersatz = -rng.intRange(0, 10);
    zug.mechanik = 'flach';
    delete zug.loslassen;
    dy = rng.intRange(0, 2);
  } else if ((richtung === 'links' || richtung === 'rechts') && nimm('dash', 0.6)) {
    // Dash-Tunnel: über die Kante laufen und flach hinüberdashen — über der Lücke hängt eine niedrige Stachel-Decke, an
    // der jeder Sprung endet. Den Dash lädt ein Kristall am Plattformrand. (Gemessen: Als Weiten- oder Höhenhilfe taugt der
    // kurze Dash nicht — Doppelsprung + Dash kommt nur 1–2 Kacheln weiter als ein guter Doppelsprung.)
    zug.art = 'fall';
    zug.dashNach = rng.intRange(2, 8);
    zug.mechanik = 'dash';
    delete zug.loslassen;
    delete zug.doppelNach;
    // 2–4 Zeilen tiefer landen: Auf Standhöhe ist man nach dem Verlassen der Kante sofort unter der Zielzeile
    dy = rng.intRange(2, 4);
  } else if (art !== 'fall' && (richtung === 'links' || richtung === 'rechts') && nimm('wind', 0.6)) {
    // Rückenwind über der Lücke (gemessen: 1000–1500 px/s² tragen einen Sprung von 4 auf 10–13 Kacheln)
    zug.wind = 'ruecken';
    zug.mechanik = 'wind';
    delete zug.loslassen;
    dy = rng.intRange(-2, 3);
  } else if (art !== 'fall' && (richtung === 'links' || richtung === 'rechts') && nimm('boee', 0.6)) {
    // Böe im Takt: Rückenwind, der nur zeitweise weht — an der Kante warten, in die Böe springen (zuege.js)
    zug.wind = 'ruecken';
    zug.boee = true;
    zug.boeeReaktion = rng.intRange(2, 10);
    zug.mechanik = 'boee';
    delete zug.loslassen;
    dy = rng.intRange(-2, 3);
  } else if (art !== 'fall' && richtung === 'hoch' && nimm('aufwind', 0.7)) {
    // Aufwindsäule direkt vor der Kante: Beim Durchqueren hebt sie einen 7–13 Zeilen (gemessen: bis 24 bei 6 Kacheln Breite)
    zug.wind = 'auf';
    zug.mechanik = 'aufwind';
    zug.art = 'sprung';
    delete zug.loslassen;
    delete zug.doppelNach;
    dy = -rng.intRange(7, 12);
  } else if (art !== 'fall' && nimm('schalter', 0.5)) {
    // Schalter im Bogen: Erst er macht die Farbblock-Plattformen der nächsten Züge fest
    zug.schalter = true;
    zug.mechanik = 'schalter';
  } else if (art !== 'fall' && nimm('beschuss', 0.6)) {
    // Beschuss (Rückmeldung 01.10.2026: „Projektile, die fliegen und denen man ausweichen muss“): Kanonen schießen quer
    // durch den Sprung — man wartet auf einen Schuss und springt hinter der Kugel durch die Lücke im Strom
    zug.beschuss = true;
    zug.schussReaktion = rng.intRange(4, 16);
    zug.mechanik = 'beschuss';
  } else if (nimm('luftportal', 0.6)) {
    // Luftportal (Rückmeldung 01.10.2026: „besondere Ideen mit den Portalen … ziemlich eintönig“): Das Portal hängt IM
    // Sprungbogen über der Grube — man springt hinein und kommt mit demselben Schwung woanders heraus. `anteil`: wo im
    // Bogen (Zeit bis zum Scheitel), `ausgang`: wohin, relativ zum Eingang.
    zug.art = art === 'fall' ? 'sprung' : art;
    if (zug.art === 'sprung' && richtung === 'hoch') { zug.art = 'doppel'; zug.doppelNach = rng.intRange(16, 26); }
    zug.luftportal = true;
    zug.mechanik = 'luftportal';
    delete zug.loslassen;
    zug.halte = rng.intRange(20, 30);
    if (richtung === 'hoch') {
      zug.anteil = rng.intRange(40, 80) / 100;
      zug.ausgang = { dx: dir * rng.intRange(-3, 5), dy: -rng.intRange(9, 14) };
      zug.nachDy = rng.intRange(0, 2);
    } else if (richtung === 'runter') {
      zug.anteil = rng.intRange(80, 130) / 100;
      zug.ausgang = { dx: dir * rng.intRange(6, 14), dy: rng.intRange(6, 12) };
      zug.nachDy = rng.intRange(1, 4);
    } else {
      zug.anteil = rng.intRange(60, 125) / 100;
      zug.ausgang = { dx: dir * rng.intRange(12, 20), dy: rng.intRange(-7, 2) };
      zug.nachDy = rng.intRange(1, 4);
    }
    dy = 0;                                                     // die Zielzeile ergibt sich aus dem Ausgang (planer)
  }
  // Kristall-Tunnel (Rückmeldung 01.10.2026: „mehr Ideen mit den Dash-Kristallen“): flach unter der Stacheldecke dashen, am Ende
  // des Dashs hängt ein zweiter Kristall — gleich schräg hinauf dashen, auf eine Plattform HÖHER als der Start. (Zwei flache Dashes
  // trugen nur ~1 Kachel weiter als einer: Nach dem Dash fliegt man ohnehin mit Lauftempo weiter.)
  if ((richtung === 'links' || richtung === 'rechts') && !zug.mechanik && nimm('tunnelkette', 0.6)) {
    zug.art = 'fall';
    zug.dashNach = rng.intRange(2, 8);
    zug.dash2 = true;
    zug.dash2Reaktion = rng.intRange(0, 6);
    zug.mechanik = 'tunnelkette';
    delete zug.loslassen;
    delete zug.doppelNach;
    delete zug.halte;
    delete zug.kanteVersatz;
    dy = -rng.intRange(1, 2);
  }
  // Luftkristall: Sprung, Doppelsprung, im Fallen hängt ein Kristall — schnappen und dashen (flach oder schräg hinauf), der
  // Dash fängt den Fall ab und trägt über eine Grube, die kein Doppelsprung schafft
  if ((richtung === 'links' || richtung === 'rechts') && !zug.mechanik && art !== 'fall' && nimm('luftdash', 0.6)) {
    zug.art = 'doppel';
    zug.halte = rng.intRange(24, 32);
    zug.doppelNach = rng.intRange(20, 30);
    zug.luftdash = true;
    zug.luftdashReaktion = rng.intRange(0, 6);
    zug.luftdashHoch = rng.range(0, 1) < 0.5;
    zug.fallTicks = rng.intRange(4, 16);                      // wie weit nach dem zweiten Scheitel der Kristall hängt
    zug.mechanik = 'luftdash';
    delete zug.loslassen;
    dy = rng.intRange(-1, 3);
  }
  // Bröckelnde Landefläche: Man landet und muss sofort weiter (Verzögerung 0,28 s). Kein eigenes Ziel, deshalb kein
  // `mechanik`-Eintrag und keine Notwendigkeitsprüfung.
  if (art !== 'fall' && nimm('broeckel', 0.55)) zug.broeckel = true;
  // Fallblock über der Landefläche: Wer steht, bringt ihn zum Wackeln — gleich weiter, sonst fällt er einem auf den Kopf
  if (art !== 'fall' && !zug.broeckel && nimm('fallblock', 0.55)) { zug.fallblock = true; if (!zug.mechanik) zug.mechanik = 'fallblock'; }
  // Nadelöhr (Rückmeldung 27.09.2026: „eine Art Flappy Bird mit den Grapplern, wo man perfekt durch Lücken schwingen muss“):
  // Röhren quer durch die Flugbahn, die Lücke nur so groß wie nötig. Allein (ein Sprung durchs Nadelöhr) oder zu einer
  // anderen Mechanik der Szene (Schwung, Ring, Böe durchs Nadelöhr).
  // (zu einem Schwung, Ring oder einer Böe fast immer — sonst gewann meist der schlichte Sprung durchs Nadelöhr)
  const schwung = zug.greifNach != null || zug.ring || zug.wind;
  if (erlaubt.has('nadeloehr') && !zug.luftportal && (gewaehlt === 'nadeloehr' || (!gewaehlt && rng.range(0, 1) < 0.6) || (gewaehlt && zug.mechanik && rng.range(0, 1) < (schwung ? 0.9 : 0.6)))) {
    zug.roehren = zug.greifNach != null ? 2 : 1;
    if (!zug.mechanik) zug.mechanik = 'nadeloehr';
  }
  // Schlüsselsprung (Rückmeldung 01.10.2026: Schlüssel „ziemlich eintönig“): Der Schlüssel hängt am Scheitel dieses Sprungs,
  // die Tür steckt im Flugweg des NÄCHSTEN — wer ihn im Flug verpasst, prallt dort ab. Wie das Nadelöhr auch als Zusatz zu
  // einer anderen Aufgabe (Portal, Ring …), dann hängt er am letzten Scheitel.
  if (erlaubt.has('schluesselsprung') && art !== 'fall' && zug.art !== 'fall' && !zug.greifNach && !zug.flappy && !zug.kette
    && (gewaehlt === 'schluesselsprung' || (!gewaehlt && rng.range(0, 1) < 0.5) || (gewaehlt && zug.mechanik && rng.range(0, 1) < 0.6))) {
    zug.schluesselFlug = true;
    if (!zug.mechanik) zug.mechanik = 'schluesselsprung';
  }
  return { zug, dy };
}

/**
 * Liegt die Kachel (tx, ty) im Bild, wenn der Spieler bei `s` ist? Kamera (client/camera.js): 480×270 px um die Spielermitte,
 * bis 44 px Vorausschau in Laufrichtung — also ±15 × ±8,4 Kacheln. Mit Rand: ±13,5 × ±7, Vorausschau 2 Kacheln.
 */
function imBild(s, dir, tx, ty) {
  const cx = (s.x + PLAYER_W / 2) / TILE + dir * 2;
  const cy = (s.y + PLAYER_H / 2) / TILE;
  return Math.abs(tx + 0.5 - cx) <= 13.5 && Math.abs(ty + 0.5 - cy) <= 7;
}

const frei = (grid, x, y) => y >= 0 && y < grid.length && x >= 0 && x < grid[0].length && grid[y][x] === AIR;

/**
 * Einen Zug (mit allen Varianten) von `von` aus auf die Plattform `ziel` spielen.
 * @returns {{ ok: boolean, spuren: object[], landungen: {x,y}[], fehl?: object }}
 */
export function pruefeZug(grid, entities, cls, laufTempo, schritt) {
  const { von, zug, kanteX, ziel } = schritt;
  const spuren = [];
  const landungen = [];
  // Dazu zwei Starts ±4 px neben der Kachelmitte: Wer ankommt, steht nie exakt dort (Kettenlauf: 2 px daneben, und ein
  // Aufwind-Zug prallte seitlich gegen die Zielplattform)
  // …und von jeder anderen Kachel, auf der eine Variante des vorigen Zugs zum Stehen kam (`starts`): Dort steht ein Mensch,
  // der den vorigen Zug etwas anders gesprungen ist (Kettenlauf: eine Kachel daneben, und der Einzelblock-Sprung danach
  // fiel zu kurz)
  const laeufe = [...varianten(zug, laufTempo), { ...zug, startDx: -4 }, { ...zug, startDx: 4 }, ...(schritt.starts || []).map((sx) => ({ ...zug, startX: sx }))];
  for (const v of laeufe) {
    const st0 = v.startX != null ? { x: v.startX, y: von.y } : von;
    const aus = ausschnittWelt(grid, entities, st0, cls, { x: Math.round((von.x + ziel.x0) / 2), y: Math.round((von.y + ziel.row) / 2) });
    if (v.startDx) aus.welt.player.x += v.startDx;
    aus.welt.flags.keys = Number(schritt.schluessel) || 0;     // Schlüssel in der Tasche: Türen öffnen sich
    aus.welt.flags.sw = schritt.sw || 0;                        // geschaltete Kanäle: Farbblock-Brücken sind fest
    // (Mitfahrt: Warten auf die Plattform und Fahrt dauern — bis zu 20 s Sim-Zeit)
    const r = spieleZug(aus, ...mitVorlauf(zugEingabe(v, kanteX - aus.x0 * TILE), zugFertig, schritt.vorlauf), zug.art === 'mitfahrt' ? 2400 : zug.art === 'bruecke' || zug.art === 'deckel' || zug.art === 'kopfueber' ? 1400 : zug.boee || zug.beschuss ? 1100 : 700);
    const ende = r.spur[r.spur.length - 1];
    // Schon im ersten Tick gestorben (etwa ein Start von einer anderen Landekachel mitten in einer Stachel): leere Spur
    if (!ende) return { ok: false, spuren, landungen, fehl: { variante: v, st: null, tot: true, grund: r.grund } };
    const st = standKachel(ende);
    // Ein Schalter-Zug zählt nur, wenn JEDE Variante den Schalter trifft
    // (Die Sim hat nur 4 Kanäle: Ab dem fünften Schalter wird ein Kanal wiederverwendet, dessen Bit schon gesetzt sein kann —
    // dann schaltet der Schalter AUS. Entscheidend ist der Zustand nach dem Umschalten, `schalterZiel`.)
    const geschaltet = zug.schalterKanal == null || ((r.welt.flags.sw >> zug.schalterKanal) & 1) === zug.schalterZiel;
    // Schlüsselsprung und Tür: Jede Variante muss den Schlüssel im Flug schnappen bzw. die Tür wirklich öffnen
    const schluesselOk = schritt.schluesselEnde == null || r.welt.flags.keys === schritt.schluesselEnde;
    const aufZiel = !r.tot && geschaltet && schluesselOk && ende.boden && st.y === ziel.row - 1 && st.x >= ziel.x0 && st.x <= ziel.x1;
    spuren.push(r.spur);
    landungen.push({ ...st, boden: ende.boden, tot: r.tot });
    if (!aufZiel) return { ok: false, spuren, landungen, fehl: { variante: v, st, tot: r.tot, grund: r.grund } };
  }
  return { ok: true, spuren, landungen };
}

/**
 * @param {object} p
 * @param {object} p.rng
 * @param {string} p.cls              Tempo-Klasse
 * @param {number} p.d                Schwierigkeit 1–5
 * @param {object} p.limits           maxGap/maxUp … (wie überall)
 * @param {object} p.reach            reachForClass(cls)
 * @param {string[][]} p.grid         leeres Raster (Luft), wird bebaut
 * @param {{x,y}} p.start             Standkachel am Start
 * @param {(string|{r: string, szene: number})[]} p.richtungen  je Zug eine Richtung ('rechts' | 'links' | 'hoch' | 'runter'),
 *   wahlweise mit der Szene, zu der er gehört
 * @returns {{ schritte: object[], plattformen: object[], korridor: Set<string>, entities: object[], ende: {x,y} }}
 */
export function planePfad({ rng, cls, d, limits, reach, grid, start, richtungen: plan, portalBudget = 2, luftBudget = 3, ausweich = ['rechts', 'runter', 'hoch'], plattform = null, zielschalter = false, extrem = true }) {
  // Zwangsversuche je Zug: geplante Aufgabe, dann Ersatz. Im Extrem-Level (eine Aufgabe trägt das ganze Level) großzügig
  // 10+10; in der Mischung 8+8 — dort gibt es viele Aufgaben, und jeder gescheiterte Versuch kostet Bauzeit.
  const PHASE = extrem ? 10 : 8;
  // Eigene Kopie: Ein aufgegebener Abstecher schreibt seine Einträge um (typen/pfad.js plant mit demselben Plan erneut)
  const richtungen = plan.map((e) => (typeof e === 'string' ? e : { ...e }));
  const entities = [];
  const korridor = new Set();
  const strahlen = new Set();                                 // Laserstrahlen der Tore: kein anderer Zug darf sie kreuzen
  // Je Schritt: wie viele Aufstiege NACH ihm noch geplant sind (für das Höhenbudget)
  const istHoch = (e) => (typeof e === 'string' ? e : e.r).startsWith('hoch');
  // Zielschloss (Rückmeldung 26.09.2026: „wäre cool, wenn das Ziel versperrt gewesen wäre und durch den Button erst
  // erreichbar“): Nach dem letzten Zug noch ein Schritt, der den Schalter über der Zielplattform trifft; das Ziel sitzt in
  // einem Käfig aus Farbblöcken, die erst der Schalter verschwinden lässt.
  if (zielschalter && richtungen.length) richtungen.push({ r: 'zielschalter', abstecher: 'zielschalter', szene: richtungen[richtungen.length - 1].szene, mechanik: '' });
  const letzterIdx = richtungen.length - 1 - (zielschalter ? 1 : 0);
  let zielPunkt = null;
  const hochDanach = richtungen.map((_, i) => richtungen.slice(i + 1).filter(istHoch).length);
  const plattformen = [];
  const schritte = [];
  const W = grid[0].length;
  const H = grid.length;

  // Startplattform (die gemeinsame Schicht macht sie später noch eben und breit)
  let plat = { x0: start.x - 3, x1: start.x + 9, row: start.y + 1 };
  for (let x = plat.x0; x <= plat.x1; x++) grid[plat.row][x] = ROCK;
  plattformen.push(plat);
  let cur = { x: plat.x1 - 1, y: start.y };
  // Über dem Start bleibt der ganze Kopfraum frei, den die gemeinsame Startplattform verlangt (sonst legt ein späterer Zug
  // eine Plattform darüber — und die gemeinsame Schicht räumt sie wieder weg)
  for (let x = plat.x0 - 2; x <= plat.x1 + 2; x++) for (let y = plat.row - ZIEL_KOPF; y < plat.row; y++) korridor.add(`${x},${y}`);

  const gruende = {};
  const zaehle = (g) => { gruende[g] = (gruende[g] || 0) + 1; };
  let abbruch = null;
  // Rücknahme-Stapel: Findet ein Schritt keinen Platz (der Weg hat sich selbst eingekreist), wird der vorige Zug samt
  // Plattform und Korridor zurückgenommen und dort anders versucht. Ohne das endete jeder dritte Weg nach wenigen Zügen.
  const stapel = [];
  let rueckBudget = Math.max(20, richtungen.length);
  let sperre = null;
  let portale = 0;
  // Schlüssel-Abstecher: Plattform vor der Tür (Hub) und ob der Schlüssel schon eingesammelt ist
  let hub = null;
  // Schlüssel in der Tasche (Abstecher, Schlüsselsprung) — die Prüfwelten starten damit; eine Tür verbraucht einen
  let schluessel = 0;
  // Schlüsselsprung: Der nächste Zug muss die Tür bekommen
  let tuerFaellig = false;
  // Luftportale bisher (eigenes Budget neben den Boden-Portalen)
  let luftPortale = 0;
  // Schlot: Rahmen (Spalten) des engen Schachts, solange die Etappe läuft
  let rahmen = null;
  // Schalter-Brücken: geschaltete Kanäle (Bitmaske wie world.flags.sw), wie viele Schalter es gibt, und wie viele der
  // nächsten Landeplattformen noch aus Farbblöcken des letzten Kanals sind
  let swMaske = 0;
  let kanalZahl = 0;
  let farbe = null;
  // Motive (motive.js): die Züge jeder Vorstellung, „A:0“ → { zug, dy }
  const motive = new Map();
  let teureVersuche = 0;

  /** Einen Zug für Schritt i suchen; bei Erfolg eintragen und true */
  const versuche = (i) => {
    const eintrag = richtungen[i];
    const gewuenscht = typeof eintrag === 'string' ? eintrag : eintrag.r;
    const szene = typeof eintrag === 'string' ? 0 : eintrag.szene;
    const mechanikPlan = typeof eintrag === 'string' ? '' : (eintrag.mechanik || '');
    const ersatz = typeof eintrag === 'string' ? '' : (eintrag.ersatz || '');
    const abst = typeof eintrag === 'string' ? null : (eintrag.abstecher || null);
    // Schwierigkeit dieses Zugs: Die Akte einer Leitidee steigern sie (Einführung leichter, Finale schwerer)
    const dZug = Math.max(1, Math.min(5, d + ((typeof eintrag === 'object' && eintrag.dVersatz) || 0)));
    // Ausweichrichtungen gibt die Großform vor (Turm: lieber hoch als nach rechts)
    // (Ein Abstecher weicht nicht aus: Sonst landete der Schlüssel etwa UNTER dem Hub)
    const wunsch = abst ? [gewuenscht] : [gewuenscht, gewuenscht, gewuenscht, ...((typeof eintrag === 'object' && eintrag.ausweich) || ausweich)];
    // Schlot (Rückmeldung 01.10.2026: „noch keinen Turm, der relativ eng ist und viele Hindernisse beim Klettern hat“): Beim
    // ersten Zug der Etappe wird der Schacht festgelegt — so breit wie ein Sprung plus 10 Kacheln; alle Plattformen, Bahnen und
    // Bauteile der Etappe bleiben darin, die Füllung zieht links und rechts Eiswände hoch
    const rahmenVorher = rahmen;
    if (typeof eintrag === 'object' && eintrag.schlot) {
      if (!rahmen) {
        const wi = Math.ceil(reach.gap.jump) + 14;
        // (Vom Start aus: gleich rechts neben dessen reserviertem Kopfraum — darin darf keine Plattform liegen)
        const x0 = plattformen.length === 1 ? plat.x1 + 3 : Math.max(RAND + 3, Math.min(W - RAND - 3 - wi, cur.x - rng.intRange(3, wi - 4)));
        rahmen = { x0, x1: x0 + wi - 1, ab: i };
      }
    } else rahmen = null;
    // (Im Schlot mehr Versuche: Im engen Schacht findet eine Landefläche seltener Platz)
    const VERSUCHE = rahmen ? 64 : 40;
    for (let versuch = 0; versuch < VERSUCHE; versuch++) {
      const richtung = wunsch[Math.min(wunsch.length - 1, Math.floor(versuch / 7))];
      // In den letzten Versuchen ohne Mechanik: lieber ein schlichter Sprung als eine Sackgasse
      const letzter = i === letzterIdx;
      // Der letzte Zug ohne Portal: Er soll auf der Zielplattform enden, nicht irgendwo anders
      // Auf einer Bröckelplattform weder Feder noch Portal: beide stünden auf einem Block, der gleich verschwindet
      // Nie zwei Wandschächte hintereinander: Eine Szene aus lauter Schächten ist eintönig und verbraucht die ganze Höhe
      const wandDavor = schritte.length && schritte[schritte.length - 1].zug.art === 'wand';
      // Dosierung beim Bauen: Waren die letzten zwei gebauten Züge dieselbe Aufgabe, nicht noch einmal (bei Kombinationen wie
      // „schalter+tor“ wählte der Zufall sonst dreimal denselben Teil — im Plan lässt sich das nicht festlegen)
      const z1 = schritte[schritte.length - 1];
      const z2 = schritte[schritte.length - 2];
      const zweimal = z1 && z2 && z1.mechanik !== 'sprung' && z1.mechanik === z2.mechanik ? z1.mechanik : null;
      // Geplante Aufgabe in den ersten PHASE Versuchen, danach (falls vorhanden) PHASE mit dem Ersatz — erst zuletzt schlicht
      // (Nach einem Schlüsselsprung ein schlichter Sprung: In SEINEM Flugweg steckt die Tür)
      const mechanik = tuerFaellig ? '' : ersatz && versuch >= (rahmen ? 2 : 1) * PHASE ? ersatz : mechanikPlan;
      // Motiv-Vorstellung: nur Aufgaben ohne eigenen Zustand (motive.js) — sonst ließe sich die Phrase nicht wiederholen
      const motivSetzen = typeof eintrag === 'object' && eintrag.motiv && eintrag.motiv.rolle === 'setzen';
      // Schlüsselsprung nur, wenn danach noch ein gewöhnlicher Zug kommt (dort steckt die Tür)
      const naechster = richtungen[i + 1];
      const tuerMoeglich = i + 1 <= letzterIdx && !(typeof naechster === 'object' && naechster.abstecher);
      // (…und kein Brückenblock: Man wartet dort auf den Aufprall — Bröckel- und Farbblöcke tragen einen so lange nicht)
      // (Beschuss nicht von Bröckeln: Man wartet dort auf den Schuss)
      const mech = mechanik.split('+').filter((m) => !(plat.broeckel && (m === 'feder' || m === 'portal' || m === 'beschuss')) && !((plat.broeckel || plat.farbe != null) && m === 'bruecke') && !(wandDavor && m === 'wand')
        && !(motivSetzen && ['schalter', 'tor', 'mitfahrt', 'wand', 'portal', 'beschuss', 'luftportal', 'schluesselsprung'].includes(m))
        && !(m === 'schluesselsprung' && !tuerMoeglich) && !(m === 'luftportal' && luftPortale >= luftBudget)
        && m !== zweimal && !(!extrem && TEUER.has(m) && teureVersuche >= TEUER_BUDGET)).join('+');
      if (mech.split('+').some((m) => TEUER.has(m))) teureVersuche++;
      // Die ersten 20 Versuche MIT der Mechanik der Szene; passt sie nicht (etwa Aufwind bei einem waagerechten Zug), neu
      // würfeln statt einen schlichten Sprung zu nehmen. Danach frei, ab Versuch 28 ohne — lieber schlicht als Sackgasse.
      const zwang = versuch < (rahmen ? 4 : 2) * PHASE && !letzter && !!mech;
      // Schlot: dorthin, wo neben der Plattform mehr Platz ist (an der Wand geht es nur zur anderen Seite); ist beidseits Platz, frei
      const schlotDir = rahmen && !sperre ? (Math.min(plat.x0 - rahmen.x0, rahmen.x1 - plat.x1) >= 7 ? null : plat.x0 - rahmen.x0 > rahmen.x1 - plat.x1 ? -1 : 1) : null;
      let { zug, dy } = wuerfleZug(rng, richtung, dZug, limits, versuch < (rahmen ? 4 : 2) * PHASE + 6 && !letzter ? mech : '', sperre || schlotDir, zwang, !!rahmen);
      // Motiv-Wiederholung: der gemerkte Zug der Vorstellung, abgewandelt — ersetzt die Aufgabe der Szene. Passt er nach
      // 6 Versuchen nicht (Wand, Höhenbudget, Abkürzung …), würfelt der Zug normal weiter: Lösbarkeit geht vor.
      const mm = typeof eintrag === 'object' ? eintrag.motiv : null;
      let motivGenutzt = null;
      // (Rückfall-Kette: 3 Versuche die Abwandlung, 3 Versuche unverändert — gespiegelt lief die Phrase im Strom oft zurück
      // über den eigenen Weg — dann normal)
      if (mm && mm.rolle === 'wiederholen' && !letzter && !abst && !tuerFaellig && versuch < 6 && motive.has(`${mm.id}:${mm.teil}`)) {
        motivGenutzt = versuch < 3 ? mm : { ...mm, variante: 'gleich', statt: mm.variante };
        ({ zug, dy } = variiere(motive.get(`${mm.id}:${mm.teil}`), motivGenutzt));
      }
      if (!motivGenutzt && zwang && !zug.mechanik && !zug.broeckel) { zaehle('zwang'); continue; }
      // Die Tür eines Schlüsselsprungs kommt in einen schlichten Bogen (Sprung, Doppelsprung, Fall)
      if (tuerFaellig && !abst && (!['sprung', 'doppel', 'fall'].includes(zug.art) || zug.greifNach != null || zug.flappy || zug.ring)) { zaehle('tuer-art'); continue; }
      // Hinab zum Schlüssel: Erst die Nische bauen — 4–6 Kacheln vor dem Hub (je nach Tempo) (näher prallte der Rücksprung seitlich gegen
      // die Hubkante), 3–6 Zeilen tiefer, 4–7 breit (Anlauf für den Rücksprung) —, dann einen Sprung suchen, dessen
      // Varianten alle darauf landen. Nach vorn, weil dort noch nichts gebaut ist: Nach oben fand der Abstecher kaum Platz
      // (links der Anflugbogen, rechts die Tür), nach hinten landete man auf der vorigen Plattform.
      let nische = null;
      if (abst === 'start') {
        const dir = eintrag.hauptDir;
        // Nach Tempo: Über Nische und Wand muss der nächste Zug noch hinwegkommen (bei „normal“ reicht ein Doppelsprung ~12)
        const schnell = reach.runSpeed > 200;
        const g = rng.intRange(4, schnell ? 6 : 4);
        const w = rng.intRange(4, schnell ? 7 : 5);
        const nx0 = dir > 0 ? plat.x1 + g : plat.x0 - g - w + 1;
        nische = { x0: nx0, x1: nx0 + w - 1, row: plat.row + rng.intRange(3, 6) };
        zug = { art: 'sprung', dir, halte: rng.intRange(6, 28), kanteVersatz: -rng.intRange(0, 12) };
        if (rng.range(0, 1) < 0.5) zug.loslassen = rng.intRange(15, 45);
        dy = 0;
      }
      // Rückweg vom Schlüssel: ein schlichter Sprung zurück auf den Hub
      if (abst === 'zurueck' && hub) {
        // Der Schlüssel liegt tiefer als der Hub (szenen.js): hinauf per Sprung oder Doppelsprung
        const art = rng.range(0, 1) < 0.6 ? 'doppel' : 'sprung';
        zug = { art, dir: Math.sign((hub.x0 + hub.x1) / 2 - cur.x) || 1, halte: rng.intRange(14, 30), kanteVersatz: -rng.intRange(4, 20) };
        if (art === 'doppel') zug.doppelNach = rng.intRange(14, 34);
        if (rng.range(0, 1) < 0.3) zug.loslassen = rng.intRange(20, 50);
        dy = 0;
      }
      // Durch die Tür: ein Sprung oder Doppelsprung vom Hub über die Nische auf die Schwelle
      if (abst === 'zielschalter') {
        // Ein Bogen Richtung Käfig, der davor wieder landet — der Schalter sitzt in seinem Scheitel. (Senkrecht flog man
        // zweimal hindurch, hinauf und hinunter: Er schaltete ein und gleich wieder aus.)
        const zdir = schritte.length ? schritte[schritte.length - 1].zug.dir || 1 : 1;
        const art = rng.range(0, 1) < 0.6 ? 'doppel' : 'sprung';
        zug = { art, dir: zdir, sofort: true, halte: rng.intRange(20, 30) };
        if (art === 'doppel') zug.doppelNach = rng.intRange(16, 28);
        if (rng.range(0, 1) < 0.5) zug.loslassen = rng.intRange(12, 30);
        dy = 0;
      }
      if (abst === 'tuer' && hub) {
        const art = rng.range(0, 1) < 0.6 ? 'doppel' : 'sprung';
        zug = { art, dir: hub.dir, halte: rng.intRange(14, 30), kanteVersatz: -rng.intRange(0, 16) };
        if (art === 'doppel') zug.doppelNach = rng.intRange(14, 34);
        dy = 0;
      }
      // Rückgängig-Liste: alles, was dieser Versuch setzt, lässt sich wieder entfernen
      const extra = [];
      const aenderungen = [];                                     // wo dieser Versuch etwas gesetzt hat (für die Störprüfung)
      const neueEnts = [];
      let anker = null;
      let ankerAlle = [];                                         // Flappy-Seil: alle Anker (für die Notwendigkeit)
      let seilDecke = 0;                                          // Spalten der Seilgang-Stacheldecke
      let eigenerStrahl = null;
      let polster = null;                                         // Luft um eine Windzone, die die Füllung frei lassen muss
      let lift = null;
      let fallZone = null;
      const setzeEntity = (e) => { entities.push(e); neueEnts.push(e); aenderungen.push([e.tx, e.ty]); extra.push(() => entities.splice(entities.indexOf(e), 1)); };
      const setzeKachel = (x, y, ch) => { const alt = grid[y][x]; grid[y][x] = ch; aenderungen.push([x, y]); extra.push(() => { grid[y][x] = alt; }); };
      const verwerfen = (grund) => { zaehle(motivGenutzt ? `motiv-${grund}` : zug.flappy ? `flappy-${grund}` : zug.dashSprung && !grund.startsWith(`dashsprung`) ? `dashsprung:${grund}` : grund); while (extra.length) extra.pop()(); };
      const von = { ...cur };
      // Von einer Bröckelplattform: In der Prüfung erst nach Landen und Abbremsen los (mitVorlauf in zuege.js)
      // (Fallblock: so lange, wie er beim Landen schon wackelt — er löst schon im Anflug aus, wenn man unter ihm durchfliegt)
      const vorlauf = plat.fallblock ? Math.max(VORLAUF_BROECKEL, plat.fallVorlauf || 0) : plat.broeckel ? VORLAUF_BROECKEL : 0;
      // Feder und Portal-Eingang HINTER die Landestellen aller Varianten des vorigen Zugs: Eine Variante, die ein Stück
      // weiterrutscht, liefe sonst über die Feder oder ins Portal (gemessen: 6 % der Züge wurden so gestört)
      const landeXs = schritte.length ? schritte[schritte.length - 1].landungen.map((l) => l.x) : [cur.x];
      // Feder: in die Richtung, in der hinter den Landestellen Platz ist (bei Aufstiegen ist die Richtung sonst gewürfelt)
      if (zug.art === 'feder') {
        const minL = Math.min(cur.x, ...landeXs);
        const maxL = Math.max(cur.x, ...landeXs);
        const raum = zug.dir > 0 ? plat.x1 - maxL : minL - plat.x0;
        const gegen = zug.dir > 0 ? minL - plat.x0 : plat.x1 - maxL;
        if (raum < 2 && gegen >= 2) zug.dir = -zug.dir;
      }
      const kanteX = zug.dir > 0 ? (plat.x1 + 1) * TILE : plat.x0 * TILE;
      let ziel = null;
      let R = plat.row + dy;                                     // Felszeile der neuen Plattform
      // Höhenbudget: Über dem Ziel müssen die noch geplanten Aufstiege Platz haben (je mindestens 3 Zeilen). Sonst
      // verbrauchte ein Wandschacht (11–15 Zeilen) früh die Höhe, und der Turm endete lange vor seinem Plan. Ein
      // schlichter Sprung wird gekürzt; Wandschacht und Feder brauchen ihre Höhe (sonst wären sie unnötig) — verworfen.
      const maxHub = plat.row - (RAND + 6) - 3 * hochDanach[i];
      if (dy < 0 && -dy > maxHub) {
        if (zug.art === 'wand' || zug.art === 'feder' || zug.art === 'deckel' || zug.kette || maxHub < 3) { verwerfen('hoehe'); continue; }
        R = plat.row - maxHub;
      }

      if (abst === 'zurueck') {
        if (!hub) { verwerfen('abstecher'); continue; }
        // Der Schlüssel liegt dort, wo man auf der Plattform am Ende des Abstechers steht
        setzeEntity({ type: 'key', tx: von.x, ty: von.y });
        // Ziel: der Teil des Hubs auf der Tür-Seite der Feder — landete man zurück auf ihr, flöge man wieder hinauf
        const federn = entities.filter((e) => e.type === 'spring' && e.ty === hub.row - 1 && e.tx >= hub.x0 && e.tx <= hub.x1).map((e) => e.tx);
        ziel = { x0: hub.x0, x1: hub.x1, row: hub.row };
        for (const fx of federn) {
          if (hub.dir > 0) ziel.x0 = Math.max(ziel.x0, fx + 2);
          else ziel.x1 = Math.min(ziel.x1, fx - 2);
        }
        if (ziel.x1 - ziel.x0 < 1) { verwerfen('abstecher-platz'); continue; }
      } else if (abst === 'zielschalter') {
        // Schalter an den höchsten Punkt des Sprungs; Käfig um das Ziel am fernen Ende der Zielplattform
        const zdir = zug.dir;
        const aus = ausschnittWelt(grid, entities, von, cls, { x: von.x + zdir * 4, y: von.y - 5 });
        aus.welt.flags.sw = swMaske;
        const probeZ = spieleZug(aus, zugEingabe(zug, kanteX - aus.x0 * TILE), zugFertig, 600);
        if (probeZ.tot || !probeZ.spur.length) { verwerfen('zielschalter-probe'); continue; }
        const sp = probeZ.spur.reduce((a, b) => (b.y < a.y ? b : a));
        const ex = Math.floor((sp.x + PLAYER_W / 2) / TILE);
        const ey = Math.floor((sp.y + PLAYER_H / 2) / TILE);
        const gx = zdir > 0 ? plat.x1 - 4 : plat.x0 + 4;
        const yS = plat.row - 1;
        const kaefig = [];
        for (let y = yS - 3; y <= yS; y++) kaefig.push([gx - 2, y], [gx + 2, y]);
        for (let x = gx - 2; x <= gx + 2; x++) kaefig.push([x, yS - 4]);
        const kaefigFrei = kaefig.every(([x, y]) => frei(grid, x, y));
        if (von.x >= gx - 3 && von.x <= gx + 3) { verwerfen('zielschalter-kaefig'); continue; }
        if (!kaefigFrei || !frei(grid, ex, ey) || (ex >= gx - 3 && ex <= gx + 3)) { verwerfen('zielschalter-platz'); continue; }
        zug.schalterKanal = kanalZahl % 4;
        zug.schalterZiel = ((swMaske >> zug.schalterKanal) & 1) ^ 1;
        setzeEntity({ type: 'switch', tx: ex, ty: ey, channel: zug.schalterKanal });
        strahlen.add(`${ex},${ey}`); extra.push(() => strahlen.delete(`${ex},${ey}`));
        eigenerStrahl = new Set([`${ex},${ey}`]);
        // fest im JETZIGEN Zustand des Kanals, weg nach dem Umschalten
        for (const [x, y] of kaefig) setzeEntity({ type: 'colorBlock', tx: x, ty: y, channel: zug.schalterKanal, solidWhen: zug.schalterZiel ^ 1 });
        zug.zielPunkt = { x: gx, y: yS };
        // landen muss man vor dem Käfig
        ziel = zdir > 0 ? { x0: plat.x0, x1: gx - 3, row: plat.row } : { x0: gx + 3, x1: plat.x1, row: plat.row };
      } else if (abst === 'tuer') {
        const schwelle = schritte.length ? schritte[schritte.length - 1].zug.schwelle : null;
        if (!schwelle) { verwerfen('abstecher'); continue; }
        ziel = schwelle;
      } else if (abst === 'start') {
        let passt = nische.x0 >= RAND && nische.x1 < W - RAND && nische.row < H - RAND - 2;
        for (let x = nische.x0; x <= nische.x1 && passt; x++) for (let y = nische.row - 3; y <= nische.row; y++) if (!frei(grid, x, y) || korridor.has(`${x},${y}`)) passt = false;
        if (!passt) { verwerfen('nische'); continue; }
        for (let x = nische.x0; x <= nische.x1; x++) setzeKachel(x, nische.row, ROCK);
        ziel = nische;
      } else if (zug.art === 'portal' && portale >= portalBudget) { verwerfen('portalBudget'); continue; }
      else if (zug.art === 'portal') {
        // Portal: Eingang zwei Kacheln vor einem her auf der Plattform, Ausgang irgendwo anders, darunter die neue Plattform
        // (3 Kacheln hinter den Landestellen: Mit 2 rutschte man im Kettenlauf nach der Landung hinein)
        const px = (zug.dir > 0 ? Math.max(cur.x, ...landeXs) : Math.min(cur.x, ...landeXs)) + zug.dir * 3;
        if (px < plat.x0 || px > plat.x1) { verwerfen('portal-platz'); continue; }
        // Weit weg — in einen anderen Bereich (Rückmeldung: „nicht 5 Teleporter, die einen 3 Felder weiter teleportieren“)
        const ax = cur.x + zug.dir * rng.intRange(20, 36) * (rng.range(0, 1) < 0.25 ? -1 : 1);
        const ay = plat.row - 1 + rng.intRange(-16, 10);
        const pw = rng.intRange(4, 7);
        const qx0 = zug.dir > 0 ? ax - 1 : ax - pw + 1;
        const qx1 = qx0 + pw;
        R = ay + 1;
        if (R < RAND + 6 || R > H - RAND - 2 || qx0 < RAND || qx1 >= W - RAND) { verwerfen('rand'); continue; }
        let passt = true;
        for (let x = qx0; x <= qx1 && passt; x++) for (let y = R - 3; y <= R; y++) if (!frei(grid, x, y) || korridor.has(`${x},${y}`)) passt = false;
        if (!passt) { verwerfen('platzBelegt'); continue; }
        for (let x = qx0; x <= qx1; x++) setzeKachel(x, R, ROCK);
        const pid = `pf${i}v${versuch}`;
        setzeEntity({ type: 'portal', tx: px, ty: von.y, id: `${pid}a`, pair: `${pid}b` });
        setzeEntity({ type: 'portal', tx: ax, ty: ay, id: `${pid}b`, pair: `${pid}a` });
        ziel = { x0: qx0, x1: qx1, row: R };
      } else if (zug.art === 'mitfahrt') {
        // Bewegte Plattform (3 breit) mit dem nahen Ende eine Kachel neben der Kante, Oberseite auf Plattformhöhe. Die ganze
        // überstrichene Fläche samt Kopfraum ist danach für andere Züge gesperrt (wie ein Laserstrahl): Wer dort liefe,
        // würde geschoben oder zerquetscht.
        const dir = zug.dir;
        const kante = dir > 0 ? plat.x1 : plat.x0;
        const mw = 3;
        const mx = dir > 0 ? kante + 2 : kante - 1 - mw;
        const my = plat.row;
        const weg = zug.moverArt === 'hoch' ? [0, -zug.moverLaenge] : [dir * zug.moverLaenge, 0];
        zug.moverWeg = weg;
        const zone = new Set();
        for (let x = Math.min(mx, mx + weg[0]); x <= Math.max(mx, mx + weg[0]) + mw - 1; x++) {
          for (let y = Math.min(my, my + weg[1]) - 3; y <= my; y++) zone.add(`${x},${y}`);
        }
        const inRaster = (key) => { const [x, y] = key.split(',').map(Number); return x >= RAND && x < W - RAND && y >= RAND && y < H - RAND; };
        if ([...zone].some((key) => !inRaster(key) || korridor.has(key) || strahlen.has(key) || !frei(grid, ...key.split(',').map(Number)))) { verwerfen('mover-platz'); continue; }
        setzeEntity({ type: 'mover', tx: mx, ty: my, path: [[0, 0], weg], speed: zug.moverTempo, width: mw });
        zug.moverRel = { dx: mx - von.x, dy: my - von.y };
        for (const key of zone) { strahlen.add(key); extra.push(() => strahlen.delete(key)); }
        eigenerStrahl = zone;
        // Probe: fahren, abspringen — wo fällt man nach dem Absprung durch die Zielzeile?
        const aus = ausschnittWelt(grid, entities, von, cls, { x: mx + Math.round(weg[0] / 2), y: my + Math.round(weg[1] / 2) });
        aus.welt.flags.keys = schluessel;
        aus.welt.flags.sw = swMaske;
        let zRef = null;
        const basis = zugEingabe(zug, kanteX - aus.x0 * TILE);
        const probe = spieleZug(aus, ...mitVorlauf((w2, t, z) => { zRef = z; return basis(w2, t, z); }, zugFertig, vorlauf), 2400);
        if (!zRef || zRef.abTick === undefined) { verwerfen('mitfahrt-probe'); continue; }
        R = zug.moverArt === 'hoch' ? my + weg[1] + rng.intRange(-1, 2) : plat.row + rng.intRange(-2, 2);
        let L = -1;
        let abgehoben = false;
        for (let k = zRef.abTick + vorlauf; k < probe.spur.length; k++) {
          const sp = probe.spur[k];
          if (!sp.boden) abgehoben = true;
          if (abgehoben && sp.boden) break;
          if (abgehoben && sp.vy > 0 && sp.y + PLAYER_H >= R * TILE) { L = k; break; }
        }
        if (L < 0) { verwerfen('keineLandung'); continue; }
        const lande = standKachel(probe.spur[L]);
        const rutsch = Math.ceil((probe.spur[L].vx * probe.spur[L].vx) / (2 * 1900) / TILE);
        let x0 = letzter ? lande.x - Math.floor(ZIEL_W / 2) : dir > 0 ? lande.x - 2 : lande.x - 2 - rutsch - rng.intRange(1, 3);
        let x1 = letzter ? lande.x + Math.floor(ZIEL_W / 2) : dir > 0 ? lande.x + 2 + rutsch + rng.intRange(1, 3) : lande.x + 2;
        // Mit Zielschloss: Platz für den Käfig (wie im allgemeinen Zweig)
        if (letzter && zielschalter) { if (dir > 0) x1 += 9; else x0 -= 9; }
        const flug = beruehrteKacheln(probe.spur.slice(0, L));
        let passt = x0 >= RAND && x1 < W - RAND && R > RAND + 3 && R < H - RAND && (!letzter || R >= ZIEL_ZEILE_MIN);
        for (let x = x0; x <= x1 && passt; x++) {
          if (!frei(grid, x, R) || korridor.has(`${x},${R}`) || flug.has(`${x},${R}`)) passt = false;
          for (let y = R - (letzter ? ZIEL_KOPF : 3); y <= R && passt; y++) if (!frei(grid, x, y) || strahlen.has(`${x},${y}`) || (letzter && korridor.has(`${x},${y}`))) passt = false;
        }
        if (!passt) { verwerfen('platzBelegt'); continue; }
        for (let x = x0; x <= x1; x++) setzeKachel(x, R, ROCK);
        ziel = { x0, x1, row: R };
      } else if (zug.art === 'bruecke') {
        // Brückenblock (Rückmeldung 26.09.2026): Die Grube ist breiter als jeder Doppelsprung; über ihr hängt eine Platte,
        // die auf beiden Seiten 2 Kacheln übersteht („zu lang“). Löst man sie am Rand aus, fällt sie und liegt auf beiden
        // Kanten — eine Brücke, bis sie nach `reset` Sekunden zurückfährt. Die Platte ist 3 dick und hängt 5–6 Zeilen hoch:
        // Ihre Oberseite (8–9 Zeilen) erreicht kein Doppelsprung (7,5), sonst liefe man einfach oben darüber.
        const dir = zug.dir;
        const G = Math.ceil(reach.gap.double) + zug.luecke;
        const ue = 2;                                             // Überstand je Seite
        // Anlauf: Zwischen der Landestelle des vorigen Zugs und dem Überstand liegen mindestens 2 freie Kacheln — sonst
        // löste man die Platte schon beim Ankommen aus. Reicht die Plattform nicht, wird sie in Laufrichtung verlängert.
        // (gemessen: ohne Verlängerung scheiterte fast jeder Versuch daran, die Plattformen sind oft schmal)
        const aeusserst = dir > 0 ? Math.max(cur.x, ...landeXs) : Math.min(cur.x, ...landeXs);
        const noetig = aeusserst + dir * (ue + 3);
        const kante = dir > 0 ? Math.max(plat.x1, noetig) : Math.min(plat.x0, noetig);
        const verl = [];
        for (let x = dir > 0 ? plat.x1 + 1 : kante; dir > 0 ? x <= kante : x < plat.x0; x++) verl.push(x);
        if (verl.some((x) => !frei(grid, x, plat.row) || korridor.has(`${x},${plat.row}`) || strahlen.has(`${x},${plat.row}`))) { verwerfen('bruecke-anlauf'); continue; }
        const hb = 3;
        const rest = rng.intRange(6, 8);                          // Zielplattform hinter der Platte (Rutschweg bei „super“ ~3)
        const bx0 = dir > 0 ? kante - ue + 1 : kante - G - ue;
        const bx1 = dir > 0 ? kante + G + ue : kante + ue - 1;
        const zx0 = dir > 0 ? kante + G + 1 : kante - G - ue - rest;
        const zx1 = dir > 0 ? kante + G + ue + rest : kante - G - 1;
        const unten = plat.row - 1 - zug.hoehe;                   // unterste Zeile der hängenden Platte
        const oben = unten - hb + 1;
        R = plat.row;
        if (bx0 < RAND || bx1 >= W - RAND || zx0 < RAND || zx1 >= W - RAND || oben < RAND) { verwerfen('rand-x'); continue; }
        // Keine Landung des vorigen Zugs unter dem Überstand: Sie löste die Platte schon beim Ankommen aus
        const ueberstand = (x) => x >= bx0 - 1 && x <= bx1 + 1;
        if ([cur.x, ...landeXs].some(ueberstand)) { verwerfen('bruecke-anlauf'); continue; }
        // Hängend, im Fall und liegend: alles frei und von keinem anderen Zug berührt
        const zone = new Set();
        for (let x = bx0; x <= bx1; x++) for (let y = oben; y < plat.row; y++) zone.add(`${x},${y}`);
        const fremd = (key) => korridor.has(key) || strahlen.has(key);
        let passt = true;
        for (const key of zone) {
          const [x, y] = key.split(',').map(Number);
          // (Über der eigenen Plattform liegt deren Kopfraum im Korridor — dort darf die Platte hängen)
          const eigen = x >= plat.x0 && x <= plat.x1 && y >= plat.row - 3;
          if (!frei(grid, x, y) || (fremd(key) && !eigen)) { passt = false; break; }
        }
        for (let x = zx0; x <= zx1 && passt; x++) for (let y = R - 3; y <= R; y++) if (!frei(grid, x, y) || fremd(`${x},${y}`)) passt = false;
        // Unter dem Block liegt nur die eigene Plattform (sonst läge er auf etwas anderem auf)
        for (let x = bx0; x <= bx1 && passt; x++) {
          const aufPlat = x >= plat.x0 && x <= plat.x1;
          const aufZiel = x >= zx0 && x <= zx1;
          if (!aufPlat && !aufZiel && !frei(grid, x, plat.row)) passt = false;
        }
        // Früher schon durch die Auslösezone geflogen? Dann fiele sie vorzeitig
        for (let x = bx0 - 1; x <= bx1 + 1 && passt; x++) {
          for (let y = unten + 1; y < plat.row && passt; y++) if (schritte.some((s2) => s2.beruehrt && s2.beruehrt.has(`${x},${y}`))) passt = false;
        }
        if (!passt) { verwerfen('bruecke-platz'); continue; }
        for (const x of verl) setzeKachel(x, plat.row, ROCK);
        if (verl.length) {
          const alt0 = plat.x0;
          const alt1 = plat.x1;
          if (dir > 0) plat.x1 = kante; else plat.x0 = kante;
          extra.push(() => { plat.x0 = alt0; plat.x1 = alt1; });
        }
        for (let x = zx0; x <= zx1; x++) setzeKachel(x, R, ROCK);
        // Wackeln nach Tempo: Man muss nach dem Auslösen aus der Spalte zurück
        const wackeln = reach.runSpeed > 200 ? rng.intRange(45, 60) / 100 : rng.intRange(60, 80) / 100;
        const block = { type: 'fallingBlock', tx: bx0, ty: oben, width: bx1 - bx0 + 1, height: hb, range: zug.hoehe + 2, shake: wackeln, reset: 30 };
        setzeEntity(block);
        zug.blockRel = { dx: bx0 - von.x, dy: oben - von.y };
        for (const key of zone) { strahlen.add(key); extra.push(() => strahlen.delete(key)); }
        eigenerStrahl = zone;
        // Probe (mit langem Liegen): Wie lange braucht man vom Aufprall bis hinüber? Das plus 1,5 s Puffer ist die Liegezeit.
        const aus = ausschnittWelt(grid, entities, von, cls, { x: Math.round((bx0 + bx1) / 2), y: plat.row - 4 });
        aus.welt.flags.keys = schluessel;
        aus.welt.flags.sw = swMaske;
        let zRef = null;
        const basis = zugEingabe(zug, kanteX - aus.x0 * TILE);
        const probe = spieleZug(aus, ...mitVorlauf((w2, t2, z) => { zRef = z; return basis(w2, t2, z); }, zugFertig, vorlauf), 1400);
        const ende = probe.spur[probe.spur.length - 1];
        const st = ende ? standKachel(ende) : null;
        if (probe.tot || !zRef || zRef.liegtSeit === undefined || !zRef.fertig || !st || st.y !== R - 1 || st.x < zx0 || st.x > zx1) { verwerfen('bruecke-probe'); continue; }
        const dauer = (zRef.druebenT - zRef.liegtSeit) / 120;
        block.reset = Math.ceil((dauer + 1.5) * 2) / 2;
        // Auf die HÄNGENDE Platte (als Fels) darf kein schlichter Sprung kommen — sonst liefe man oben darüber
        const alt = [];
        for (let x = bx0; x <= bx1; x++) for (let y = oben; y <= unten; y++) { alt.push([x, y, grid[y][x]]); grid[y][x] = ROCK; }
        const oberDrueber = ohneMechanikErreichbar({ grid, entities, ohne: [block], anker: null, cls, von, plat, ziel: { x0: bx0, x1: bx1, row: oben }, gruendlich: true });
        for (const [x, y, c] of alt) grid[y][x] = c;
        if (oberDrueber) { verwerfen('bruecke-oben'); continue; }
        ziel = { x0: zx0, x1: zx1, row: R, bruecke: true };
      } else if (zug.art === 'kopfueber') {
        // Kopfüber-Passage: Decke hz Zeilen über der Plattform (darüber eine Zeile Fels, an der die Stacheln der Lücken
        // hängen), darunter die Schwerkraft-Zone von der Kante bis zum Ende der Decke. Die Zone reicht bis 3 Zeilen über den
        // Boden: Ein Sprung an der Kante trägt die Spielermitte hinein. `plan`: Längen im Wechsel Deckenstück / Lücke.
        const dir = zug.dir;
        const kante = dir > 0 ? plat.x1 : plat.x0;
        const C = plat.row - 1 - zug.hz;
        const spalte = (k) => kante + dir * (1 + k);             // k-te Spalte hinter der Kante
        const L = zug.plan.reduce((a, b) => a + b, 0);
        const xs = [spalte(0), spalte(L - 1)];
        const zx0 = Math.min(...xs);
        const zx1 = Math.max(...xs);
        if (zx0 < RAND + 1 || zx1 >= W - RAND - 1 || C - 2 < RAND) { verwerfen('rand-x'); continue; }
        const fremd = (key) => korridor.has(key) || strahlen.has(key);
        const zone = new Set();
        for (let x = zx0; x <= zx1; x++) for (let y = C - 1; y < plat.row; y++) zone.add(`${x},${y}`);
        let passt = true;
        for (const key of zone) {
          const [x, y] = key.split(',').map(Number);
          if (!frei(grid, x, y) || fremd(key)) { passt = false; break; }
        }
        if (!passt) { verwerfen('kopfueber-platz'); continue; }
        // Decke: Fels in Zeile C-1 über die ganze Länge, Zeile C nur auf den Deckenstücken; in den Lücken Stacheln nach unten
        let pos = 0;
        const luecken = [];
        zug.plan.forEach((len, k) => {
          const istLuecke = k % 2 === 1;
          for (let j = 0; j < len; j++) {
            const x = spalte(pos + j);
            setzeKachel(x, C - 1, ROCK);
            if (istLuecke) setzeEntity({ type: 'spike', tx: x, ty: C, dir: 'down' });
            else setzeKachel(x, C, ROCK);
          }
          // Absprung vor der Lücke: Abstand der Lückenkante zur Absprunglinie an der Plattformkante (Pixel), 6–12 davor
          if (istLuecke) luecken.push({ kante: pos * TILE - rng.intRange(8, 14), halte: zug.halteK[luecken.length] });
          pos += len;
        });
        zug.luecken = luecken;
        setzeEntity({ type: 'gravityZone', tx: zx0, ty: C + 1, w: zx1 - zx0 + 1, h: plat.row - 3 - C });
        for (const key of zone) { strahlen.add(key); extra.push(() => strahlen.delete(key)); }
        eigenerStrahl = zone;
        // Probe: Wo landet man nach dem Zurückkippen? Dort kommt die Zielplattform hin.
        R = plat.row + dy;
        const aus = ausschnittWelt(grid, entities, von, cls, { x: Math.round((zx0 + zx1) / 2) + dir * 6, y: C + 4 });
        aus.welt.flags.keys = schluessel;
        aus.welt.flags.sw = swMaske;
        let zRef = null;
        const basis = zugEingabe(zug, kanteX - aus.x0 * TILE);
        const probe = spieleZug(aus, ...mitVorlauf((w2, t2, z) => { zRef = z; return basis(w2, t2, z); }, zugFertig, vorlauf), 900);
        // (Ein Tod erst nach dem Zurückkippen zählt nicht: Die Probe läuft vor der Zielplattform, man fällt in die Tiefe — die
        // Bahn bis zur Zielzeile reicht)
        const durch = zRef && (zRef.mf === 'fall' || zRef.mf === 'aus') && zRef.k === luecken.length;
        if (!durch || (probe.tot && zRef.mf !== 'fall')) { verwerfen(`kopfueber-probe:${probe.tot ? probe.grund : 'lebt'}:${zRef ? `${zRef.mf}${zRef.k ?? ''}` : '-'}`); continue; }
        // erste Stelle nach dem Zurückkippen, an der man fallend die Zielzeile erreicht
        let Lf = -1;
        const zurueckX = (dir > 0 ? zx1 + 1 : zx0) * TILE;
        for (let k = 0; k < probe.spur.length; k++) {
          const s = probe.spur[k];
          if ((s.x - zurueckX) * dir < 0) continue;
          if (s.vy > 0 && s.y + PLAYER_H >= R * TILE) { Lf = k; break; }
        }
        if (Lf < 0) { verwerfen('keineLandung'); continue; }
        const lande = standKachel(probe.spur[Lf]);
        const rutsch = Math.ceil((probe.spur[Lf].vx * probe.spur[Lf].vx) / (2 * 1900) / TILE);
        let x0 = letzter ? lande.x - Math.floor(ZIEL_W / 2) : dir > 0 ? lande.x - 2 : lande.x - 3 - rutsch - rng.intRange(1, 3);
        let x1 = letzter ? lande.x + Math.floor(ZIEL_W / 2) : dir > 0 ? lande.x + 3 + rutsch + rng.intRange(1, 3) : lande.x + 2;
        if (letzter && zielschalter) { if (dir > 0) x1 += 9; else x0 -= 9; }
        const flug = beruehrteKacheln(probe.spur.slice(0, Lf));
        passt = x0 >= RAND && x1 < W - RAND && R > RAND + 3 && R < H - RAND && (!letzter || R >= ZIEL_ZEILE_MIN);
        for (let x = x0; x <= x1 && passt; x++) {
          if (!frei(grid, x, R) || korridor.has(`${x},${R}`) || flug.has(`${x},${R}`)) passt = false;
          for (let y = R - (letzter ? ZIEL_KOPF : 3); y <= R && passt; y++) if (!frei(grid, x, y) || strahlen.has(`${x},${y}`) || (letzter && korridor.has(`${x},${y}`))) passt = false;
        }
        if (!passt) { verwerfen('platzBelegt'); continue; }
        for (let x = x0; x <= x1; x++) setzeKachel(x, R, ROCK);
        ziel = { x0, x1, row: R };
      } else if (zug.art === 'deckel') {
        // Deckel (Rückmeldung 26.09.2026, zweite Lesart von „auslösen, damit sie den Weg frei machen“): Über der Plattform
        // eine Decke (4–5 Zeilen Luft), darin ein Loch, das eine Platte verschließt. Man löst sie von unten aus, weicht aus,
        // sie fällt auf den Boden — nun ist das Loch offen und die Platte eine Stufe darunter. Neben dem Loch, oben auf der
        // Decke, geht es weiter. Wer zu lange braucht, dem fährt der Deckel zurück (`reset` = gemessene Zeit + 1,5 s).
        const dir = zug.dir;
        const hx0 = dir > 0 ? cur.x + zug.abstand : cur.x - zug.abstand - zug.breite + 1;
        const hx1 = hx0 + zug.breite - 1;
        const C = plat.row - 1 - zug.hoehe;
        R = C;
        const zb = rng.intRange(4, 6);                            // Zielfläche auf der Decke, jenseits des Lochs
        const zx0 = dir > 0 ? hx1 + 1 : hx0 - zb;
        const zx1 = dir > 0 ? hx1 + zb : hx0 - 1;
        if (zx0 < RAND || zx1 >= W - RAND || hx0 < RAND || hx1 >= W - RAND || C - 4 < RAND) { verwerfen('rand-x'); continue; }
        const fremd = (key) => korridor.has(key) || strahlen.has(key);
        // Decke diesseits des Lochs: so weit, wie Platz ist (bis 12, mindestens 3) — ob man außen herum hinaufkommt, prüft
        // die Probe unten; jenseits noch bis 4 hinter dem Ziel. (Mit fester Länge 8–12 schnitt die Decke fast immer den
        // Anflug des vorigen Zugs.)
        const deckeFrei = (x) => x >= RAND && x < W - RAND && frei(grid, x, C) && !fremd(`${x},${C}`);
        let diesseits = 0;
        while (diesseits < 12 && deckeFrei(dir > 0 ? hx0 - 1 - diesseits : hx1 + 1 + diesseits)) diesseits++;
        let jenseits = 0;
        while (jenseits < 4 && deckeFrei(dir > 0 ? zx1 + 1 + jenseits : zx0 - 1 - jenseits)) jenseits++;
        if (diesseits < 3) { verwerfen('deckel-decke'); continue; }
        const cx0 = dir > 0 ? hx0 - diesseits : zx0 - jenseits;
        const cx1 = dir > 0 ? zx1 + jenseits : hx1 + diesseits;
        // Keine Landung des vorigen Zugs unter oder neben dem Loch: Sie löste den Deckel schon beim Ankommen aus
        if ([cur.x, ...landeXs].some((x) => x >= hx0 - 1 && x <= hx1 + 1)) { verwerfen('deckel-anlauf'); continue; }
        let passt = true;
        let grund = 'deckel-decke';
        // Decke und Kopfraum über dem Ziel: frei; der Raum unter dem Loch bis zum Boden ebenso (dort fällt der Deckel)
        for (let x = cx0; x <= cx1 && passt; x++) if (!frei(grid, x, C) || fremd(`${x},${C}`)) passt = false;
        if (passt) grund = 'deckel-kopf';
        for (let x = zx0; x <= zx1 && passt; x++) for (let y = C - 3; y < C; y++) if (!frei(grid, x, y) || fremd(`${x},${y}`)) passt = false;
        const zone = new Set();
        for (let x = hx0; x <= hx1; x++) for (let y = C; y < plat.row; y++) zone.add(`${x},${y}`);
        if (passt) grund = 'deckel-schacht';
        for (const key of zone) {
          const [x, y] = key.split(',').map(Number);
          const eigen = x >= plat.x0 && x <= plat.x1 && y >= plat.row - 3;
          if (!frei(grid, x, y) || (fremd(key) && !eigen)) { passt = false; break; }
        }
        // Boden unter dem Loch (±1): fehlende Kacheln ergänzen — der Deckel soll auf dem Boden liegen, nicht in die Tiefe fallen
        const boden = [];
        if (passt) grund = 'deckel-boden';
        for (let x = hx0 - 1; x <= hx1 + 1 && passt; x++) {
          if (grid[plat.row][x] === ROCK) continue;
          if (!frei(grid, x, plat.row) || fremd(`${x},${plat.row}`)) passt = false; else boden.push(x);
        }
        if (passt) grund = 'deckel-frueh';
        // Früher schon durch die Auslösezone geflogen? Dann fiele er vorzeitig
        for (let x = hx0 - 1; x <= hx1 + 1 && passt; x++) {
          for (let y = C + 1; y < plat.row && passt; y++) if (schritte.some((s2) => s2.beruehrt && s2.beruehrt.has(`${x},${y}`))) passt = false;
        }
        if (!passt) { verwerfen(grund); continue; }
        for (const x of boden) setzeKachel(x, plat.row, ROCK);
        if (boden.length) {
          const alt0 = plat.x0;
          const alt1 = plat.x1;
          plat.x0 = Math.min(plat.x0, ...boden);
          plat.x1 = Math.max(plat.x1, ...boden);
          extra.push(() => { plat.x0 = alt0; plat.x1 = alt1; });
        }
        for (let x = cx0; x <= cx1; x++) if (x < hx0 || x > hx1) setzeKachel(x, C, ROCK);
        const wackeln = reach.runSpeed > 200 ? rng.intRange(45, 60) / 100 : rng.intRange(60, 80) / 100;
        const block = { type: 'fallingBlock', tx: hx0, ty: C, width: zug.breite, height: 1, range: zug.hoehe + 1, shake: wackeln, reset: 30 };
        setzeEntity(block);
        zug.blockRel = { dx: hx0 - von.x, dy: C - von.y };
        for (const key of zone) { strahlen.add(key); extra.push(() => strahlen.delete(key)); }
        eigenerStrahl = zone;
        const aus = ausschnittWelt(grid, entities, von, cls, { x: Math.round((hx0 + hx1) / 2), y: C });
        aus.welt.flags.keys = schluessel;
        aus.welt.flags.sw = swMaske;
        let zRef = null;
        const basis = zugEingabe(zug, kanteX - aus.x0 * TILE);
        const probe = spieleZug(aus, ...mitVorlauf((w2, t2, z) => { zRef = z; return basis(w2, t2, z); }, zugFertig, vorlauf), 1400);
        const ende = probe.spur[probe.spur.length - 1];
        const st = ende ? standKachel(ende) : null;
        if (probe.tot || !zRef || zRef.obenT === undefined || !zRef.fertig || !st || st.y !== C - 1 || st.x < zx0 || st.x > zx1) { verwerfen('deckel-probe'); continue; }
        block.reset = Math.ceil(((zRef.obenT - zRef.liegtSeit) / 120 + 1.5) * 2) / 2;
        // Außen herum: Mit geschlossenem Deckel (als Fels) darf kein schlichter Sprung auf die Decke kommen
        const alt = [];
        for (let x = hx0; x <= hx1; x++) { alt.push([x, grid[C][x]]); grid[C][x] = ROCK; }
        const aussen = ohneMechanikErreichbar({ grid, entities, ohne: [block], anker: null, cls, von, plat, ziel: { x0: cx0, x1: cx1, row: C }, gruendlich: true });
        for (const [x, c] of alt) grid[C][x] = c;
        if (aussen) { verwerfen('deckel-aussen'); continue; }
        // (Der Überhang der Decke jenseits der Zielfläche ist begehbar — er gehört zur Plattform; als Rest daneben lag er sonst
        // als freie Standfläche im Korridor, ohne Sicherheits-Stachel)
        ziel = { x0: dir > 0 ? zx0 : cx0, x1: dir > 0 ? cx1 : zx1, row: C, deckel: true };
      } else if (zug.art === 'wand') {
        // Wandschacht: Wand A über der Plattformkante (unten offen — darunter springt man hinein), Wand B jenseits des
        // Schachts, oben auf B die neue Plattform. A ragt höher als B und trägt oben eine Stachel: Hinaus kommt man nur
        // über B. Die Schachtbreite folgt dem Tempo (gemessen mit allen Varianten: normal 2–3, schnell 3–4, super 4–5 —
        // enger prallt „super“ ab, breiter kommt „normal“ nicht mehr hinüber).
        const dir = zug.dir;
        const kante = dir > 0 ? plat.x1 : plat.x0;
        const xa = kante;
        const xb = xa + dir * (Math.round(reach.runSpeed / 58) + rng.intRange(0, 1) + 1);
        const xe = xb + dir * rng.intRange(4, 6);
        const aUnten = plat.row - rng.intRange(6, 7);
        const lo = Math.min(xa, xe);
        const hi = Math.max(xa, xe);
        if (R < RAND + 8 || lo < RAND || hi >= W - RAND) { verwerfen('rand-x'); continue; }
        let passt = true;
        const pruefe = (x, y0, y1) => { for (let y = y0; y <= y1 && passt; y++) if (!frei(grid, x, y) || korridor.has(`${x},${y}`)) passt = false; };
        pruefe(xa, R - 6, aUnten);
        for (let x = xa + dir; x !== xe + dir && passt; x += dir) pruefe(x, R - 6, plat.row + 2);
        if (!passt) { verwerfen('platzBelegt'); continue; }
        for (let y = R - 4; y <= aUnten; y++) setzeKachel(xa, y, ROCK);
        setzeEntity({ type: 'spike', tx: xa, ty: R - 5, dir: 'up', kappe: true });
        for (let y = R + 1; y <= plat.row + 2; y++) setzeKachel(xb, y, ROCK);
        for (let x = Math.min(xb, xe); x <= Math.max(xb, xe); x++) setzeKachel(x, R, ROCK);
        const aus = ausschnittWelt(grid, entities, von, cls, { x: Math.round((kante + xe) / 2), y: Math.round((von.y + R) / 2) });
        aus.welt.flags.keys = schluessel;
        aus.welt.flags.sw = swMaske;
        const probe = spieleZug(aus, ...mitVorlauf(zugEingabe(zug, kanteX - aus.x0 * TILE), zugFertig, vorlauf), 900);
        const ende = probe.spur[probe.spur.length - 1];
        const st = ende ? standKachel(ende) : null;
        if (probe.tot || !ende || !ende.boden || st.y !== R - 1 || st.x < Math.min(xb, xe) || st.x > Math.max(xb, xe)) { verwerfen('wandOben'); continue; }
        ziel = { x0: Math.min(xb, xe), x1: Math.max(xb, xe), row: R };
      } else {
        if (R < RAND + 6 || R > H - RAND - 2) { verwerfen('rand-y'); continue; }
        if (zug.art === 'feder') {
          // Feder ein bis zwei Kacheln vor einem her auf der Plattform — man läuft darüber
          const fx = (zug.dir > 0 ? Math.max(cur.x, ...landeXs) : Math.min(cur.x, ...landeXs)) + zug.dir * rng.intRange(1, 2);
          if (fx < plat.x0 || fx > plat.x1) { verwerfen('feder-platz'); continue; }
          setzeEntity({ type: 'spring', tx: fx, ty: von.y, dir: 'up' });
        }
        // Ohne Ziel spielen
        // (Luftportal: Ausschnitt zwischen Absprung und Ausgang, sonst läge der Ausgang außerhalb)
        let mitte = null;
        const probeSpielen = (z2 = zug) => {
          const aus = ausschnittWelt(grid, entities, von, cls, mitte || { x: von.x + zug.dir * 10, y: von.y + Math.round(dy / 2) });
          aus.welt.flags.keys = schluessel;
          aus.welt.flags.sw = swMaske;
          if (z2.startDx) aus.welt.player.x += z2.startDx;
          return spieleZug(aus, ...mitVorlauf(zugEingabe(z2, kanteX - aus.x0 * TILE), zugFertig, vorlauf), zug.flappy ? 800 : zug.beschuss ? 1000 : 500);
        };
        // Windzone vor der Probe: Sie formt den Flug. Ihre Kacheln darf danach kein anderer Zug berühren (wie ein
        // Laserstrahl) — wer hindurchfiele, würde unerwartet weggeweht.
        if (zug.wind) {
          const kante = zug.dir > 0 ? plat.x1 : plat.x0;
          const auf = zug.wind === 'auf';
          // (kleiner als früher: Aufwind gelang nur zu 10 %, Böen zu 30 % — die Zone fand keinen Platz)
          const w = auf ? rng.intRange(3, 4) : rng.intRange(5, 8);
          const h = auf ? -dy + 6 : 8;
          const zx0 = zug.dir > 0 ? kante + 1 : kante - w;
          const zy0 = auf ? plat.row + 2 - h : plat.row - 8;
          const zone = new Set();
          for (let x = zx0; x < zx0 + w; x++) for (let y = zy0; y < zy0 + h; y++) zone.add(`${x},${y}`);
          if (zx0 < RAND || zx0 + w >= W - RAND || zy0 < RAND || [...zone].some((key) => korridor.has(key) || strahlen.has(key) || !frei(grid, ...key.split(',').map(Number)))) { verwerfen('wind-platz'); continue; }
          // Rückenwind nach Tempo: Bei „normal“ streuten ±50 ms im starken Wind so sehr, dass kaum ein Zug alle Varianten trug
          const schnell = reach.runSpeed > 200;
          const staerke = auf ? -rng.intRange(12, 17) * 100 : zug.dir * (schnell ? rng.intRange(8, 13) : rng.intRange(5, 9)) * 100;
          // (Böe: 2,4–3,2 s Takt, davon 1,0–1,4 s Wind — lang genug für einen Sprung, kurz genug, dass man warten muss)
          const takt = zug.boee ? { period: rng.intRange(24, 32) / 10, on: rng.intRange(10, 14) / 10, phase: rng.intRange(0, 9) / 10 } : {};
          setzeEntity({ type: 'wind', tx: zx0, ty: zy0, w, h, ax: auf ? 0 : staerke, ay: auf ? staerke : 0, ...takt });
          if (zug.boee) zug.boeeRel = { dx: zx0 - von.x, dy: zy0 - von.y };
          // Die Säule bleibt stehen: Wer später wieder hineinspringt, fährt bis oben — ihre Oberkante zählt für die
          // Abkürzungsregel wie eine Plattform mit Feder (welt-88169: von einer alten Säule direkt nach links zum Ziel)
          if (auf) lift = { x0: zx0 - 1, x1: zx0 + w, row: zy0, feder: true };
          for (const key of zone) { strahlen.add(key); extra.push(() => strahlen.delete(key)); }
          eigenerStrahl = zone;
          // Polster: 2 Zeilen über und 1 Spalte neben der Zone bleibt Luft (Rückmeldung 27.09.2026, welt-78594: „mit einer Böe in
          // einer Decke stuck“ — die Grotten-Decke der Füllung lag mit Stufen und Taschen direkt am Zonenrand, der Wind drückte
          // einen hinein)
          polster = new Set();
          for (let x = zx0 - 1; x <= zx0 + w; x++) for (let y = zy0 - 2; y < zy0 + h; y++) {
            const key = `${x},${y}`;
            if (!zone.has(key) && frei(grid, x, y)) polster.add(key);
          }
        }
        let probe = probeSpielen();
        const abflug = probe.spur.findIndex((s) => !s.boden);
        // Luftportal: Eingang an der gewählten Stelle des Bogens, Ausgang versetzt; die Zielzeile folgt aus dem Ausgang
        if (zug.luftportal) {
          if (abflug < 0) { verwerfen('keinAbflug'); continue; }
          const scheitel0 = probe.spur.findIndex((s, k) => k > abflug && s.vy >= 0);
          if (scheitel0 < 0) { verwerfen('keinScheitel'); continue; }
          // Um beide Portale ein Feld Luft, das kein anderer Zug berührt — sonst zöge es ihn hinein. Der Eingang: die erste
          // Stelle ab `anteil` der Zeit bis zum Scheitel, an der das geht (direkt über der Absprungkante liegt der Kopfraum der
          // Plattform); der Ausgang: der gewürfelte Versatz, sonst etwas daneben.
          const rund = (x, y) => [-1, 0, 1].flatMap((ddx) => [-1, 0, 1].map((ddy) => [x + ddx, y + ddy]));
          const luft = (x, y) => rund(x, y).every(([x2, y2]) => x2 >= RAND && x2 < W - RAND && y2 >= RAND + 2 && y2 < H - RAND - 2 && frei(grid, x2, y2) && !korridor.has(`${x2},${y2}`) && !strahlen.has(`${x2},${y2}`)
            && (!rahmen || (x2 >= rahmen.x0 && x2 <= rahmen.x1)));
          let px = -1;
          let py = -1;
          for (let k = abflug + Math.max(4, Math.round((scheitel0 - abflug) * zug.anteil)); k < probe.spur.length && px < 0; k += 2) {
            const s = probe.spur[k];
            if (s.boden) break;
            const qx = Math.floor((s.x + PLAYER_W / 2) / TILE);
            const qy = Math.floor((s.y + PLAYER_H / 2) / TILE);
            if (luft(qx, qy)) { px = qx; py = qy; }
          }
          if (px < 0) { verwerfen('luftportal-eingang'); continue; }
          const aus = [[0, 0], [zug.dir * 3, -2], [-zug.dir * 3, 2], [0, -4], [0, 4]].map(([ddx, ddy]) => [px + zug.ausgang.dx + ddx, py + zug.ausgang.dy + ddy]).find(([x, y]) => luft(x, y));
          if (!aus) { verwerfen('luftportal-ausgang'); continue; }
          const [ax, ay] = aus;
          const pid = `lp${i}v${versuch}`;
          // (Fangradius 14 statt 8 px: Mitten im Sprung trifft man ein Portal nicht so genau wie im Laufen — ±50 ms verschieben den Bogen)
          setzeEntity({ type: 'portal', tx: px, ty: py, id: `${pid}a`, pair: `${pid}b`, radius: 14 });
          setzeEntity({ type: 'portal', tx: ax, ty: ay, id: `${pid}b`, pair: `${pid}a`, radius: 14 });
          const zone = new Set([...rund(px, py), ...rund(ax, ay)].map(([x, y]) => `${x},${y}`));
          for (const key of zone) { strahlen.add(key); extra.push(() => strahlen.delete(key)); }
          eigenerStrahl = new Set([...(eigenerStrahl || []), ...zone]);
          R = ay + 1 + zug.nachDy;
          mitte = { x: Math.round((von.x + ax) / 2), y: Math.round((von.y + ay) / 2) };
          probe = probeSpielen();
          // Wirklich hindurch? (Sprung der Lage um mehr als 3 Kacheln in einem Tick)
          if (!probe.spur.some((q, j) => j > 0 && Math.abs(q.x - probe.spur[j - 1].x) + Math.abs(q.y - probe.spur[j - 1].y) > 48)) { verwerfen('luftportal-verfehlt'); continue; }
          if (R < RAND + 6 || R > H - RAND - 2) { verwerfen('rand-y'); continue; }
          // Höhenbudget wie bei jedem Aufstieg
          if (R < plat.row && plat.row - R > plat.row - (RAND + 6) - 3 * hochDanach[i]) { verwerfen('hoehe'); continue; }
        }
        // Dash-Kristall und Schalter: in den Bogen, dort, wo man einige Ticks vor dem Dash bzw. am Scheitel ist
        if (zug.dashNach != null) {
          // Kristall auf der Kante, über die man läuft (im eigenen Kopfraum — nur dieser Zug geht hier los)
          // (Dash-Sprung: 2–3 Kacheln vor der Kante, auf dem Anlauf — dort, wo man ihn vor der Absprunglinie einsammelt)
          // (…steht man schon näher an der Kante, eine Kachel davor bzw. auf ihr)
          const kante0 = zug.dir > 0 ? plat.x1 : plat.x0;
          const kx = zug.dashSprung ? [2, 1, 0].map((k) => kante0 - zug.dir * k).find((x) => (x - von.x) * zug.dir > 0 && frei(grid, x, von.y)) : kante0;
          if (kx === undefined || !frei(grid, kx, von.y) || kx === von.x) { verwerfen('element-platz'); continue; }
          setzeEntity({ type: 'crystal', tx: kx, ty: von.y });
          probe = probeSpielen();
        }
        // Kristall-Tunnel: der zweite Kristall dort, wo der erste Dash ausläuft (Dash 0,14 s = 17 Ticks, dann 1–4 Ticks weiter)
        // Luftkristall: nach dem zweiten Scheitel, `fallTicks` ins Fallen hinein
        if (zug.dash2 || zug.luftdash) {
          if (abflug < 0) { verwerfen('keinAbflug'); continue; }
          let k2;
          if (zug.dash2) k2 = abflug + zug.dashNach + 17 + rng.intRange(1, 4);
          else {
            const a2 = probe.spur.findIndex((s, k) => k > abflug + zug.doppelNach + 2 && s.vy >= 0);
            k2 = a2 < 0 ? -1 : a2 + zug.fallTicks;
          }
          const s2 = probe.spur[k2];
          if (!s2 || s2.boden) { verwerfen('kristall-platz'); continue; }
          const kx2 = Math.floor((s2.x + PLAYER_W / 2) / TILE);
          const ky2 = Math.floor((s2.y + PLAYER_H / 2) / TILE);
          if (kx2 < RAND || kx2 >= W - RAND || ky2 < RAND || !frei(grid, kx2, ky2) || korridor.has(`${kx2},${ky2}`) || strahlen.has(`${kx2},${ky2}`)) { verwerfen('kristall-platz'); continue; }
          const kristall2 = { type: 'crystal', tx: kx2, ty: ky2 };
          setzeEntity(kristall2);
          zug.kristall2 = kristall2;
          zug.kristallRel = { dx: kx2 - von.x, dy: ky2 - von.y };
          probe = probeSpielen();
        }
        if (zug.schalter) {
          if (abflug < 0) { verwerfen('keinAbflug'); continue; }
          const a = probe.spur.findIndex((s, k) => k > abflug && s.vy >= 0);
          if (a < 0 || a >= probe.spur.length) { verwerfen('keinScheitel'); continue; }
          const s = probe.spur[a];
          const ex = Math.floor((s.x + PLAYER_W / 2) / TILE);
          const ey = Math.floor((s.y + PLAYER_H / 2) / TILE);
          if (!frei(grid, ex, ey) || korridor.has(`${ex},${ey}`)) { verwerfen('element-platz'); continue; }
          {
            // Wechselschalter: Innerhalb einer Szene bleibt es derselbe Kanal — jeder weitere Schalter lässt die Brücke hinter
            // einem verschwinden und die nächste erscheinen
            zug.wechsel = !!(farbe && farbe.szene === szene);
            zug.schalterKanal = zug.wechsel ? farbe.kanal : kanalZahl % 4;
            zug.schalterZiel = ((swMaske >> zug.schalterKanal) & 1) ^ 1;
            setzeEntity({ type: 'switch', tx: ex, ty: ey, channel: zug.schalterKanal });
            // Den Schalter darf kein anderer Zug berühren — er schaltete die Brücke wieder aus
            strahlen.add(`${ex},${ey}`); extra.push(() => strahlen.delete(`${ex},${ey}`));
            eigenerStrahl = new Set([...(eigenerStrahl || []), `${ex},${ey}`]);
          }
          probe = probeSpielen();
        }
        if (zug.ring || zug.greifNach != null) {
          if (abflug < 0) { verwerfen('keinAbflug'); continue; }
          if (zug.ring) {
            // Ring in den zweiten Scheitel (nach dem Doppelsprung), eine Kachel voraus: Er lenkt den Flug um und gibt den
            // Luftsprung zurück — den nimmt der Zug kurz danach (doppelNach2)
            const a = probe.spur.findIndex((s, k) => k > abflug + (zug.doppelNach ?? 0) && s.vy >= 0);
            if (a < 0) { verwerfen('keinScheitel'); continue; }
            const s = probe.spur[a];
            const rx = Math.floor((s.x + 5) / TILE) + zug.dir;
            const ry = Math.floor((s.y + 7) / TILE);
            if (!frei(grid, rx, ry)) { verwerfen('ring-platz'); continue; }
            setzeEntity({ type: 'ring', tx: rx, ty: ry, dir: zug.ring, radius: 18 });
            zug.doppelNach2 = a - abflug + rng.intRange(10, 20);
          } else {
            // Anker schräg voraus über der Stelle, an der man zugreift
            const g = Math.min(probe.spur.length - 1, abflug + zug.greifNach);
            const s = probe.spur[g];
            const gx = Math.floor((s.x + 5) / TILE) + zug.dir * rng.intRange(4, 7);
            // …aber höchstens 6 Zeilen über der Standfläche: Den Anker muss man schon beim Absprung sehen (Sichtregel unten)
            const gy = Math.max(Math.floor((s.y + 7) / TILE) - rng.intRange(4, 7), von.y - 6);
            if (!frei(grid, gx, gy) || korridor.has(`${gx},${gy}`)) { verwerfen('anker-platz'); continue; }
            setzeKachel(gx, gy, 'G');
            anker = { x: gx, y: gy };
          }
          probe = probeSpielen();
          if (anker) {
            // Seilgang: eine Stacheldecke knapp über dem Anker, über die ganze Breite des Schwungs. Ohne sie reichte ein
            // Doppelsprung fast immer genauso weit wie der Schwung (Rückmeldung: „die Grappler sind alle nutzlos“, gemessen:
            // fast jeder Ankerzug war unnötig). Mit ihr endet jeder hohe Bogen an den Stacheln — nur darunter trägt das Seil.
            const bahn = beruehrteKacheln(probe.spur);
            const xs = [...bahn].map((key) => Number(key.split(',')[0]));
            const C = anker.y - 2;                               // Felszeile; Stacheln darunter (C+1) und darauf (C-1)
            const kx0 = Math.min(...xs);
            const kx1 = Math.max(...xs);
            if (C - 1 < RAND) { verwerfen('seilgang-platz'); continue; }
            for (let x = kx0; x <= kx1; x++) {
              if (x < RAND || x >= W - RAND) continue;
              const ok = [C - 1, C, C + 1].every((y) => frei(grid, x, y) && !korridor.has(`${x},${y}`) && !bahn.has(`${x},${y}`));
              if (!ok) continue;
              setzeKachel(x, C, ROCK);
              seilDecke++;
              setzeEntity({ type: 'spike', tx: x, ty: C - 1, dir: 'up', kappe: true });
              setzeEntity({ type: 'spike', tx: x, ty: C + 1, dir: 'down' });
            }
            probe = probeSpielen();
          }
        }
        // Kristallkette: Kristalle der Reihe nach auf der gespielten Bahn — jeweils dort, wo man nach dem Doppelsprung bzw. nach dem
        // vorigen Dash den Scheitel erreicht (dort sammelt man ihn ein und dasht gleich weiter)
        if (zug.kette) {
          if (abflug < 0) { verwerfen('keinAbflug'); continue; }
          let ab = abflug + (zug.doppelNach ?? 0) + 3;
          let ok = true;
          for (let k = 0; k < zug.kette && ok; k++) {
            const a = probe.spur.findIndex((s, i) => i > ab && s.vy >= -40);
            if (a < 0 || probe.spur[a].boden) { ok = false; break; }
            const s = probe.spur[a];
            const kx = Math.floor((s.x + PLAYER_W / 2) / TILE);
            const ky = Math.floor((s.y + PLAYER_H / 2) / TILE);
            if (kx < RAND || kx >= W - RAND || ky < RAND || !frei(grid, kx, ky) || korridor.has(`${kx},${ky}`) || strahlen.has(`${kx},${ky}`)) { ok = false; break; }
            setzeEntity({ type: 'crystal', tx: kx, ty: ky });
            probe = probeSpielen();
            ab = a + 12;                                       // nach dem Dash erst wieder steigen, dann der nächste Scheitel
          }
          if (!ok) { verwerfen('kette-platz'); continue; }
        }
        // Flappy-Seil: Anker der Reihe nach auf der gespielten Bahn — schräg voraus über der Stelle, an der man zugreift (der
        // erste im Steigflug, jeder weitere 16–24 Ticks nach dem Loslassen des vorigen); gegriffen wird nach Lage (zuege.js).
        // Zwischen zwei Ankern kommt später eine Röhre (Nadelöhr).
        if (zug.flappy) {
          if (abflug < 0) { verwerfen('keinAbflug'); continue; }
          zug.greif = [];
          zug.seilRel = [];
          ankerAlle = [];
          let ok = true;
          let idx = abflug + rng.intRange(8, 16);
          for (let k = 0; k < zug.flappy && ok; k++) {
            const s = probe.spur[idx];
            if (!s || s.boden) { ok = false; break; }
            const cx = s.x + PLAYER_W / 2;
            const gx = Math.floor(cx / TILE) + zug.dir * rng.intRange(3, 6);
            // (der erste höchstens 6 Zeilen über der Standfläche: Den Anker muss man beim Absprung sehen)
            const gy = k === 0 ? Math.max(Math.floor((s.y + 7) / TILE) - rng.intRange(3, 5), von.y - 6) : Math.floor((s.y + 7) / TILE) - rng.intRange(3, 5);
            if (gx < RAND || gx >= W - RAND || gy < RAND || !frei(grid, gx, gy) || korridor.has(`${gx},${gy}`) || strahlen.has(`${gx},${gy}`)) { ok = false; break; }
            setzeKachel(gx, gy, 'G');
            ankerAlle.push({ x: gx, y: gy });
            zug.seilRel.push({ dx: gx - von.x, dy: gy - von.y });
            zug.greif.push({ vor: Math.round(((gx + 0.5) * TILE - cx) * zug.dir), los: rng.intRange(8, 40), r1: rng.intRange(2, 8), r2: rng.intRange(2, 8) });
            probe = probeSpielen();
            // Loslassen: letzter Tick am Seil
            let losIdx = -1;
            for (let q = idx; q < probe.spur.length; q++) { if (probe.spur[q].seil) losIdx = q; else if (losIdx >= 0) break; }
            if (losIdx < 0) { ok = false; break; }
            idx = losIdx + rng.intRange(16, 24);
          }
          if (!ok) { verwerfen('anker'); continue; }
          anker = ankerAlle[0];
          const xs = ankerAlle.map((a) => a.x);
          zug.roehrenX = xs.slice(1).map((x, k) => Math.round((xs[k] + x) / 2));
        }
        // Schlüsselsprung: der Schlüssel am letzten Scheitel, bevor man zur Zielzeile hinabfällt (beim Luftportal nach dem
        // Austritt, beim Ring nach dem Umlenken) — jede Variante muss ihn im Flug schnappen (pruefeZug)
        if (zug.schluesselFlug) {
          if (abflug < 0) { verwerfen('keinAbflug'); continue; }
          let letzterScheitel = -1;
          for (let k = abflug + 1; k < probe.spur.length; k++) {
            const q = probe.spur[k];
            if (q.boden || (q.vy > 0 && q.y + PLAYER_H >= Math.max(R, von.y + 1) * TILE)) break;
            if (probe.spur[k - 1].vy < 0 && q.vy >= 0) letzterScheitel = k;
          }
          const sk = letzterScheitel >= 0 ? probe.spur[letzterScheitel] : null;
          const kx = sk ? Math.floor((sk.x + PLAYER_W / 2) / TILE) : -1;
          const ky = sk ? Math.floor((sk.y + PLAYER_H / 2) / TILE) : -1;
          if (!sk || kx < RAND || kx >= W - RAND || ky < RAND || !frei(grid, kx, ky) || korridor.has(`${kx},${ky}`) || strahlen.has(`${kx},${ky}`)) { verwerfen('schluessel-platz'); continue; }
          setzeEntity({ type: 'key', tx: kx, ty: ky });
          strahlen.add(`${kx},${ky}`); extra.push(() => strahlen.delete(`${kx},${ky}`));
          eigenerStrahl = new Set([...(eigenerStrahl || []), `${kx},${ky}`]);
        }
        // Landestelle: der erste Tick, in dem man nach dem Abheben fallend die Zielzeile erreicht
        // (Luftportal: erst nach dem Austritt — vorher kreuzt der Bogen die Zielzeile womöglich schon; ohne Austritt keine Landung)
        const landeIndex = (spur) => {
          let abgehoben = false;
          let k0 = 0;
          if (zug.luftportal) {
            k0 = spur.findIndex((q, j) => j > 0 && Math.abs(q.x - spur[j - 1].x) + Math.abs(q.y - spur[j - 1].y) > 48);
            if (k0 < 0) return -1;
            abgehoben = true;
          }
          // (Gelandet wird von oben: Liegt das Ziel höher als der Start, zählt die Zielzeile erst, wenn man über ihr war —
          // sonst galt beim Kristall-Tunnel schon das Absinken unter der Decke als Landung)
          let ueber = false;
          for (let k = k0; k < spur.length; k++) {
            const s = spur[k];
            if (!s.boden) abgehoben = true;
            if (abgehoben && s.boden) return -1;                 // vorher auf etwas anderem gelandet
            if (s.y + PLAYER_H < R * TILE) ueber = true;
            if (abgehoben && ueber && s.vy > 0 && s.y + PLAYER_H >= R * TILE) return k;
          }
          return -1;
        };
        // Bremsweg nach dem Loslassen: v²/(2·1900 px/s²), die langsamste Bremsung aller Klassen
        const bremsweg = (vx) => Math.ceil((vx * vx) / (2 * 1900) / TILE);
        const L = landeIndex(probe.spur);
        if (L < 3) { verwerfen('keineLandung'); continue; }
        const lande = standKachel(probe.spur[L]);
        // Seil und Ring streuen stark: Wer 50 ms früher loslässt, landet Kacheln weiter. Alle Varianten schon hier spielen
        // und die Plattform über ihre ganze Landestreuung legen, samt Bremsweg — sonst trug nur der Mittelwert, und die
        // Varianten flogen darüber hinweg in die Grube.
        let streuX0 = lande.x;
        let streuX1 = lande.x;
        const broeckelSchmal = zug.broeckel && !letzter;
        if (zug.greifNach != null || zug.flappy || zug.ring || zug.praezise || zug.knapp || zug.dashSprung || zug.luftportal || zug.luftdash || zug.dash2 || broeckelSchmal) {
          let gut = true;
          // (Flappy-Seil: auch die Starts ±4 px der Menschen-Prüfung — nach mehreren Schwüngen streuen sie am weitesten)
          const streuLaeufe = [...varianten(zug, reach.runSpeed).slice(1), ...(zug.flappy ? [{ ...zug, startDx: -4 }, { ...zug, startDx: 4 }] : [])];
          for (const v of streuLaeufe) {
            const sp = probeSpielen(v).spur;
            const Lv = landeIndex(sp);
            if (Lv < 3) { gut = false; break; }
            const lx = standKachel(sp[Lv]).x;
            streuX0 = Math.min(streuX0, lx - (sp[Lv].vx < 0 ? bremsweg(sp[Lv].vx) : 0));
            streuX1 = Math.max(streuX1, lx + (sp[Lv].vx > 0 ? bremsweg(sp[Lv].vx) : 0));
          }
          if (!gut) { verwerfen('keineLandung'); continue; }
          // (Einzelblock höchstens 2 Kacheln, Bröckel höchstens 3 — „zielgenauer landen, nur kurz Zeit abzuspringen“)
          // (Motiv „knapp“: ohne Sicherheitsfläche, aber bis 3 Kacheln — mit 1–2 scheiterten fast alle Doppelsprünge)
          // (Flappy-Seil: bis 18 — nach 2–3 Schwüngen streut die Landung weit; die Aufgabe sind die Lücken, nicht die Landung)
          const maxStreu = zug.praezise ? 1 : broeckelSchmal || zug.knapp ? 2 : zug.flappy ? 18 : 10;
          if (streuX1 - streuX0 > maxStreu) { verwerfen(zug.praezise ? 'praezise' : broeckelSchmal ? 'broeckel-streuung' : zug.knapp ? 'knapp-streuung' : 'streuung'); continue; }
        }
        // Plattform um die Landestelle — nach vorn mit Anlauf für den nächsten Zug
        // In Szenen mit Feder braucht die Plattform Platz HINTER der Landestelle: Dort kommt die Feder hin (vor ihr landen
        // die Varianten des vorigen Zugs; lag sie im Landebereich, lief man versehentlich darüber)
        // Bröckelplattform schmal: Man soll nicht auf ihr herumlaufen, sondern sofort weiter
        // (Plattformbreite nach Handschrift: schmal, normal oder breit)
        // (im Schlot schmal: Breite Plattformen füllten den halben Schacht)
        const [vornMin, vornMax] = rahmen ? [0, 2] : plattform ? plattform.vorn : [1, 4];
        const vorn = zug.broeckel && !letzter ? rng.intRange(0, 1) : mechanik.includes('feder') ? rng.intRange(4, 6) : rng.intRange(vornMin, vornMax);
        const rand = rahmen ? 1 : plattform?.rand ?? (dZug >= 4 ? 1 : 2);
        // Wer schnell landet (Schwung am Seil, Ring), rutscht nach dem Loslassen noch: Bremsweg v²/(2·1900 px/s²) — die
        // langsamste Bremsung aller Klassen. Um so viel wird die Plattform in Rutschrichtung länger (sonst rutschte man
        // über die Kante; bis die Prüfung auf den Stillstand wartete, fiel das nicht auf).
        const vL = probe.spur[L].vx;
        const rutsch = bremsweg(vL);
        let x0 = letzter ? lande.x - Math.floor(ZIEL_W / 2) : zug.dir > 0 ? lande.x - rand : lande.x - rand - vorn;
        let x1 = letzter ? lande.x + Math.floor(ZIEL_W / 2) : zug.dir > 0 ? lande.x + rand + vorn : lande.x + rand;
        if (vL > 0) x1 = Math.max(x1, lande.x + rand + rutsch);
        else if (vL < 0) x0 = Math.min(x0, lande.x - rand - rutsch);
        x0 = Math.min(x0, streuX0 - rand);
        x1 = Math.max(x1, streuX1 + rand);
        // Dash-Tunnel: Die Plattform beginnt erst an der Landestelle — reichte sie zurück in die Lücke, käme man auch per
        // schlichtem Fall hinüber (gemessen: bei „normal“ war fast jeder Tunnel „unnötig“)
        if (zug.dashNach != null && !zug.dashSprung) { if (zug.dir > 0) x0 = Math.max(x0, lande.x - 1); else x1 = Math.min(x1, lande.x + 1); }
        // Dash-Sprung: Die Plattform beginnt genau dort, wo die kürzeste Variante landet — die Weite IST die Aufgabe (mit dem
        // üblichen Rand davor wirkte die Lücke kürzer, und fast jeder Dash-Sprung galt als „mit Doppelsprung erreichbar“)
        if (zug.dashSprung && !letzter) { if (zug.dir > 0) x0 = streuX0; else x1 = streuX1; }
        // Einzelblock: genau die Landestreuung, kein Rand, kein Anlauf
        if ((zug.praezise || zug.knapp) && !letzter) { x0 = streuX0; x1 = streuX1; }
        // Mit Zielschloss: die Zielplattform 9 Kacheln länger — am fernen Ende sitzt das Ziel im Käfig
        if (letzter && zielschalter) { if (zug.dir > 0) x1 += 9; else x0 -= 9; }
        // Bröckel: genau die Landestreuung (höchstens 3 Kacheln) — Rückmeldung 26.09.2026: schmal, damit man zielgenau
        // landen muss und nur kurz Zeit zum Absprung hat
        if (broeckelSchmal) { x0 = streuX0; x1 = streuX1; }
        // Schlot: Die Plattform endet an den Schachtwänden (die Landestelle muss drin liegen)
        if (rahmen) {
          x0 = Math.max(x0, rahmen.x0);
          x1 = Math.min(x1, rahmen.x1);
          if (lande.x < x0 || lande.x > x1 || streuX0 < rahmen.x0 || streuX1 > rahmen.x1) { verwerfen('schlot-landung'); continue; }
        }
        if (x0 < RAND || x1 >= W - RAND) { verwerfen('rand-x'); continue; }
        const flug = beruehrteKacheln(probe.spur.slice(0, Math.max(0, L - 1)));
        const spalteFrei = (x) => {
          if (!frei(grid, x, R) || korridor.has(`${x},${R}`) || flug.has(`${x},${R}`)) return false;
          for (let y = R - 3; y <= R; y++) if (!frei(grid, x, y) || strahlen.has(`${x},${y}`)) return false;   // Kopfraum; nicht in Wind oder Strahl
          return true;
        };
        // Blockierte Enden kürzen, solange die Landestelle ±1 bleibt (etwa direkt hinter einer Wand) — die Varianten prüft
        // die Sim danach ohnehin. Vorher scheiterte hier jede Plattform, deren Rand eine Kachel zu weit reichte.
        if (!letzter) {
          // (im Schlot bis an die Landestelle: Beim steilen Aufstieg kreuzt man die Zielzeile dicht daneben)
          // (…ebenso nach dem schrägen Dash im Kristall-Tunnel)
          const rest = rahmen || zug.dash2 ? 0 : 1;
          while (x0 < lande.x - rest && !spalteFrei(x0)) x0++;
          while (x1 > lande.x + rest && !spalteFrei(x1)) x1--;
        }
        let passt = !letzter || R >= ZIEL_ZEILE_MIN;
        for (let x = x0; x <= x1 && passt; x++) {
          if (!spalteFrei(x)) passt = false;
          // Ziel: der ganze Kopfraum der gemeinsamen Zielplattform frei und von keinem früheren Zug berührt
          if (letzter) for (let y = R - ZIEL_KOPF; y < R && passt; y++) if (!frei(grid, x, y) || korridor.has(`${x},${y}`)) passt = false;
        }
        if (!passt) { verwerfen('platzBelegt'); continue; }
        const broeckel = zug.broeckel && !letzter;
        // Nach einem Schalter: die nächsten Landeplattformen aus Farbblöcken seines Kanals — fest erst, wenn geschaltet
        // Die Landefläche eines Schalter-Zugs selbst: Farbblöcke des NEUEN Zustands — sie erscheint erst, wenn man den
        // Schalter im Flug trifft (Rückmeldung 26.09.2026: „die Idee, dass Plattformen per Schalter eine Landefläche statt Tür
        // bieten, ist genial“). Mehrere hintereinander auf demselben Kanal: Die Plattform hinter einem verschwindet, die vor
        // einem erscheint — Rot/Blau im Wechsel.
        const eigen = zug.schalter && zug.schalterKanal != null && !letzter && !broeckel;
        // (Unter einem Fallblock nie Farbblöcke: Der Block fällt durch sie hindurch — die Sim prüft beim Sturz nur Kacheln — und
        // bleibt erst auf der nächsten Felsplattform darunter liegen, mitten im Weg eines späteren Zugs)
        const farbig = !broeckel && !letzter && !zug.fallblock && (eigen || (!zug.schalter && farbe && farbe.rest > 0));
        const fKanal = eigen ? zug.schalterKanal : farbe?.kanal;
        const fWann = eigen ? zug.schalterZiel : farbe?.solidWhen;
        // Zerfallszeit nach Stufe: 0,30 s (Stufe 1) bis 0,22 s (Stufe 5) statt fest 0,28 s
        if (broeckel) for (let x = x0; x <= x1; x++) setzeEntity({ type: 'crumble', tx: x, ty: R, delay: [0.3, 0.28, 0.26, 0.24, 0.22][dZug - 1] });
        else if (farbig) for (let x = x0; x <= x1; x++) setzeEntity({ type: 'colorBlock', tx: x, ty: R, channel: fKanal, solidWhen: fWann });
        else for (let x = x0; x <= x1; x++) setzeKachel(x, R, ROCK);
        ziel = { x0, x1, row: R, ...(broeckel ? { broeckel: true } : {}), ...(farbig ? { farbe: fKanal } : {}) };
        if (zug.fallblock && !letzter) {
          // Block 9 Zeilen über der Plattform (tiefer stieß man sich beim Absprung den Kopf), so breit wie sie (höchstens 12);
          // wackelt 0,3–0,45 s, sobald man darunter steht, dann fällt er
          const by = R - 9;
          let passt2 = by > RAND && x1 - x0 + 1 <= 12;
          for (let x = x0; x <= x1 && passt2; x++) if (!frei(grid, x, by) || korridor.has(`${x},${by}`) || strahlen.has(`${x},${by}`)) passt2 = false;
          if (!passt2) { verwerfen('fallblock-platz'); continue; }
          // (Wackelzeit nach Tempo: bei „normal“ kam man in 0,3–0,45 s nicht unter dem Block weg)
          const wackeln = reach.runSpeed > 200 ? rng.intRange(30, 45) / 100 : rng.intRange(55, 75) / 100;
          setzeEntity({ type: 'fallingBlock', tx: x0, ty: by, width: x1 - x0 + 1, height: 1, range: 10, shake: wackeln, reset: 3 });
          ziel.fallblock = true;
        }

        if (zug.flach) {
          // Flacher Sprung: Stacheldecke über der Lücke, eine Kachel über der höchsten Stelle, die IRGENDEINE Variante erreicht —
          // der getippte Sprung passt darunter, jeder normale stößt hinein
          const kante = zug.dir > 0 ? plat.x1 : plat.x0;
          const ende = zug.dir > 0 ? x0 - 1 : x1 + 1;
          const flugAlle = new Set();
          for (const v of varianten(zug, reach.runSpeed)) beruehrteKacheln(probeSpielen(v).spur, flugAlle);
          let oben = Infinity;
          for (const key of flugAlle) { const [x, y] = key.split(',').map(Number); if ((x - kante) * zug.dir > 0 && (ende - x) * zug.dir >= 0) oben = Math.min(oben, y); }
          const C = oben - 2;                                    // Felszeile; Stacheln darunter (C+1) direkt über der Bahn
          let ok = Number.isFinite(oben) && C - 1 >= RAND && (ende - kante) * zug.dir >= 3 && oben >= von.y - 3;
          for (let x = kante + zug.dir; ok && x !== ende + zug.dir; x += zug.dir) {
            for (const y of [C - 1, C, C + 1]) if (!frei(grid, x, y) || korridor.has(`${x},${y}`) || flugAlle.has(`${x},${y}`)) ok = false;
          }
          if (!ok) { verwerfen('flach-platz'); continue; }
          for (let x = kante + zug.dir; x !== ende + zug.dir; x += zug.dir) {
            setzeKachel(x, C, ROCK);
            setzeEntity({ type: 'spike', tx: x, ty: C - 1, dir: 'up', kappe: true });
            setzeEntity({ type: 'spike', tx: x, ty: C + 1, dir: 'down' });
          }
        }

        if (zug.dashNach != null && !zug.dashSprung) {
          // Dash-Tunnel: niedrige Stachel-Decke über der ganzen Lücke, Stacheln direkt über Kopfhöhe — der flache Dash passt
          // darunter, jeder Sprung stößt hinein (eine Zeile höher passte noch ein kurzer Hüpfer durch). Oben Fels mit Kappe (die Füllung lässt ihn nach oben wachsen).
          const kante = zug.dir > 0 ? plat.x1 : plat.x0;
          // (Kristall-Tunnel: Die Decke endet vor dem zweiten Kristall — dort geht es schräg hinauf)
          const ende = zug.dash2 ? zug.kristall2.tx - zug.dir : zug.dir > 0 ? x0 - 1 : x1 + 1;
          const C = von.y - 2;                                   // Felszeile; Stacheln darunter (C+1) und darauf (C-1)
          let ok = C - 1 >= RAND && (ende - kante) * zug.dir >= 2;
          const flugAlle = beruehrteKacheln(probe.spur);
          for (let x = kante + zug.dir; ok && x !== ende + zug.dir; x += zug.dir) {
            for (const y of [C - 1, C, C + 1]) if (!frei(grid, x, y) || korridor.has(`${x},${y}`) || flugAlle.has(`${x},${y}`)) ok = false;
          }
          if (!ok) { verwerfen('tunnel-platz'); continue; }
          for (let x = kante + zug.dir; x !== ende + zug.dir; x += zug.dir) {
            setzeKachel(x, C, ROCK);
            setzeEntity({ type: 'spike', tx: x, ty: C - 1, dir: 'up', kappe: true });
            setzeEntity({ type: 'spike', tx: x, ty: C + 1, dir: 'down' });
          }
          // Kristall-Tunnel: Ein Dash allein darf nicht reichen — ohne den zweiten Kristall landet man nicht auf der Plattform
          if (zug.dash2) {
            const idx = entities.indexOf(zug.kristall2);
            entities.splice(idx, 1);
            const r1 = probeSpielen();
            entities.splice(idx, 0, zug.kristall2);
            const e1 = r1.spur[r1.spur.length - 1];
            const st1 = e1 ? standKachel(e1) : null;
            if (!r1.tot && e1 && e1.boden && st1.y === R - 1 && st1.x >= x0 && st1.x <= x1) { verwerfen('tunnelkette-unnoetig'); continue; }
          }
        }

        if (zug.tor) {
          // Laser von oben durch die Mitte der Flugbahn; der Sender trägt oben eine Stachel (kein Stehplatz)
          const sm = probe.spur[Math.round((Math.max(0, abflug) + L) / 2)];
          const cx = Math.floor((sm.x + 5) / TILE);
          let oben = Infinity;
          let unten = -1;
          for (const key of flug) {
            const [x, y] = key.split(',').map(Number);
            if (x === cx) { oben = Math.min(oben, y); unten = Math.max(unten, y); }
          }
          const ey = oben - rng.intRange(3, 5);
          const frage = (x, y) => frei(grid, x, y) && !korridor.has(`${x},${y}`);
          if (!Number.isFinite(oben) || ey < 2 || !frage(cx, ey) || !frage(cx, ey - 1)) { verwerfen('tor-platz'); continue; }
          // Der Strahl endet an einem eigenen Fänger unter der Bahn — sonst reichte er bis zum nächsten Fels weit unten
          // und kreuzte womöglich einen anderen Zug
          const yFang = unten + 4;
          const strahl = [];
          for (let y = ey + 1; y < yFang; y++) strahl.push(`${cx},${y}`);
          if (!frage(cx, yFang) || !frage(cx, yFang - 1) || strahl.some((key) => korridor.has(key) || !frei(grid, cx, Number(key.split(',')[1])))) { verwerfen('tor-kreuzt'); continue; }
          setzeKachel(cx, ey, ROCK);
          setzeKachel(cx, yFang, ROCK);
          setzeEntity({ type: 'spike', tx: cx, ty: ey - 1, dir: 'up', kappe: true });
          setzeEntity({ type: 'spike', tx: cx, ty: yFang - 1, dir: 'up', sockel: true });
          const period = rng.intRange(20, 28) / 10;
          setzeEntity({ type: 'laser', tx: cx, ty: ey, dir: 'down', period, on: rng.intRange(6, 9) / 10, warn: 0.4 });
          zug.torRel = { dx: cx - von.x, dy: ey - von.y };
          for (const key of strahl) { strahlen.add(key); extra.push(() => strahlen.delete(key)); }
          eigenerStrahl = new Set(strahl);
        }

        if (zug.beschuss) {
          // Beschuss: 1–2 Kanonen, deren Kugelbahn den Flug kreuzt — bei waagerechten Zügen von oben (Tropfen) oder von unten
          // (Fontäne), bei Auf- und Abstiegen von der Seite (im Schlot aus der Schachtwand). Die Bahn endet an einem eigenen
          // Fänger; kein anderer Zug kreuzt sie (wie beim Tor), und sie meidet Start- und Landeplattform samt Kopfraum — dort
          // wartet man auf den Schuss. Langsame Kugeln (60–100 px/s): Sie bleiben lange in der Bahn, man muss die Lücke abpassen.
          const period = rng.intRange(8, 13) / 10;
          const tempo = rng.intRange(6, 10) * 10;
          const zwei = dZug >= 3 && rng.range(0, 1) < 0.4;
          const flugK = [...flug].map((key) => key.split(',').map(Number));
          // Flacher Flug → Bahn von oben/unten; steiler Flug → von der Seite (nach der Form der Bahn, nicht nach dem Namen der Richtung)
          const fxs = flugK.map((q) => q[0]);
          const fys = flugK.map((q) => q[1]);
          const quer = Math.max(...fxs) - Math.min(...fxs) >= 1.5 * (Math.max(...fys) - Math.min(...fys));
          const frage = (x, y) => x >= RAND - 2 && x < W - RAND + 2 && y >= 2 && y < H - 2 && frei(grid, x, y) && !korridor.has(`${x},${y}`) && !strahlen.has(`${x},${y}`)
            && !(x >= x0 - 1 && x <= x1 + 1 && y >= R - 3 && y <= R);
          // Kandidaten: waagerecht die Spalten über der Lücke (nicht über den Plattformen), sonst die Zeilen der Bahn zwischen den
          // Kopfräumen von Start und Ziel — der Reihe nach ab einer zufälligen Stelle, die erste, an der alles frei ist
          const spalten = [...new Set(flugK.map((q) => q[0]))].filter((x) => (x < plat.x0 || x > plat.x1) && (x < x0 - 1 || x > x1 + 1)).sort((a, b) => a - b);
          // (Zeilen: alle der Bahn — ob die Bahn einen Kopfraum schneidet, prüft frage(); sie reicht nur knapp über den Flug hinaus)
          const zeilen = [...new Set(flugK.map((q) => q[1]))].filter((y) => y < von.y - 1).sort((a, b) => a - b);
          const kandidaten = quer ? spalten : zeilen;
          /** Kanone samt Bahn an Kandidat c — oder der Grund, warum nicht */
          const baueKanone = (c) => {
            let kx; let ky; let fx; let fy; let dirK;
            if (quer) {
              const ys = flugK.filter((q) => q[0] === c).map((q) => q[1]);
              const [oben, unten] = [Math.min(...ys), Math.max(...ys)];
              kx = c; fx = c;
              if (rng.range(0, 1) < 0.7) { ky = oben - rng.intRange(3, 5); fy = unten + rng.intRange(2, 3); dirK = 'down'; }
              else { ky = unten + rng.intRange(2, 3); fy = oben - rng.intRange(3, 5); dirK = 'up'; }
            } else {
              const xs = flugK.filter((q) => q[1] === c).map((q) => q[0]);
              ky = c; fy = c;
              const links = rng.range(0, 1) < 0.5;
              // (im Schlot sitzt die Kanone in der Wand, wenn die nah ist)
              const lx = Math.max(rahmen ? rahmen.x0 - 1 : 0, Math.min(...xs) - rng.intRange(2, 4));
              const rx = Math.min(rahmen ? rahmen.x1 + 1 : W - 1, Math.max(...xs) + rng.intRange(2, 4));
              kx = links ? lx : rx; fx = links ? rx : lx; dirK = links ? 'right' : 'left';
            }
            const sx = Math.sign(fx - kx);
            const sy = Math.sign(fy - ky);
            const bahn = [];
            for (let x = kx + sx, y = ky + sy; x !== fx || y !== fy; x += sx, y += sy) bahn.push([x, y]);
            // Oben auf Kanone und Fänger eine Stachel (keine Standfläche) — außer, die Kugeln fliegen dort ohnehin durch
            const kappeK = dirK !== 'up';
            const kappeF = dirK !== 'down';
            if (!frage(kx, ky) || (kappeK && !frage(kx, ky - 1))) return 'beschuss-platz-kanone';
            if (!frage(fx, fy) || (kappeF && !frage(fx, fy - 1))) return 'beschuss-platz-faenger';
            if (bahn.some(([x, y]) => !frage(x, y))) return 'beschuss-kreuzt';
            setzeKachel(kx, ky, ROCK);
            setzeKachel(fx, fy, ROCK);
            if (kappeK) setzeEntity({ type: 'spike', tx: kx, ty: ky - 1, dir: 'up', kappe: true });
            if (kappeF) setzeEntity({ type: 'spike', tx: fx, ty: fy - 1, dir: 'up', ...(dirK === 'down' ? { sockel: true } : { kappe: true }) });
            setzeEntity({ type: 'cannon', tx: kx, ty: ky, dir: dirK, period, speed: tempo, phase: rng.intRange(0, 9) / 10 });
            kanonen.push({ kx, ky, c });
            for (const [x, y] of bahn) { strahlen.add(`${x},${y}`); extra.push(() => strahlen.delete(`${x},${y}`)); }
            eigenerStrahl = new Set([...(eigenerStrahl || []), ...bahn.map(([x, y]) => `${x},${y}`)]);
            return null;
          };
          const kanonen = [];
          let grund = kandidaten.length ? null : 'beschuss-bahn';
          for (let n = 0; n < (zwei ? 2 : 1) && kandidaten.length; n++) {
            const ab = rng.intRange(0, kandidaten.length - 1);
            grund = 'beschuss-bahn';
            for (let j = 0; j < kandidaten.length; j++) {
              const c = kandidaten[(ab + j) % kandidaten.length];
              // (die zweite Bahn mindestens 3 Kacheln neben der ersten)
              if (kanonen.some((k2) => Math.abs(k2.c - c) < 3)) continue;
              grund = baueKanone(c);
              if (!grund) break;
            }
            if (grund) break;
          }
          if (grund) { verwerfen(grund); continue; }
          zug.kanoneRel = { dx: kanonen[0].kx - von.x, dy: kanonen[0].ky - von.y };
          // Muss man die Lücke wirklich abpassen? Derselbe Zug zu 6 anderen Zeitpunkten im Takt — mindestens 2 davon treffen
          // die Kugeln (sonst wäre der Beschuss Kulisse)
          let tote = 0;
          for (let k = 1; k <= 6; k++) if (probeSpielen({ ...zug, schussReaktion: zug.schussReaktion + Math.round((k * period * 120) / 7) }).tot) tote++;
          if (tote < 2) { verwerfen('beschuss-harmlos'); continue; }
        }

        // Sichtfeld: Man muss sehen, wohin man springt — die Landestelle spätestens am Scheitel (danach lässt sich kaum
        // noch lenken), einen Anker schon beim Absprung (Rückmeldung 25.09.2026: „manchmal sieht man Grappler oder Wege
        // nicht")
        const scheitel = probe.spur.findIndex((s, k) => k > abflug && s.vy >= 0);
        // (Bei einem Fall schaut die Kamera mit nach unten, und im Fallen lenkt man noch: dort bis zur Landung)
        // (…ebenso im Wind und nach einem Ring: Sie tragen einen erst nach dem Scheitel dorthin, das sieht man im Flug)
        // (…und beim Flappy-Seil: Die Landung liegt mehrere Schwünge voraus)
        const bis = scheitel < 0 || zug.art === 'fall' || zug.wind || zug.ring || zug.flappy || zug.dashSprung || zug.kette || zug.luftportal || zug.luftdash ? L : scheitel;
        let gesehen = false;
        for (let k = 0; k <= bis && !gesehen; k++) gesehen = imBild(probe.spur[k], zug.dir, lande.x, R - 1);
        if (!gesehen || (anker && !imBild(probe.spur[0], zug.dir, anker.x, anker.y))) { verwerfen('sicht'); continue; }
      }

      // Keine Abkürzung: Die neue Plattform darf von keiner Plattform erreichbar sein, die 3 oder mehr Schritte zurückliegt
      // (eine zu überspringen ist in einer Folge natürlich; quer über die Karte zu springen nicht)
      // (Der Rückweg vom Schlüssel landet absichtlich auf einer alten Plattform, dem Hub; eine Plattform, die unter den
      // letzten drei noch einmal vorkommt, zählt nicht als alt)
      const juengste = plattformen.slice(-3);
      // (Die Schlüssel-Nische ist eine Sackgasse — von ihr geht es nur zurück auf den Hub: dort nur gegen ältere Plattformen)
      // (Hinter der Tür nicht: Die Wand schließt jede Abkürzung aus, die grobe Schätzung kennt keine Wände)
      if (abst !== 'zurueck' && abst !== 'tuer' && abst !== 'zielschalter' && plattformen.slice(0, abst === 'start' ? -5 : -3).some((q) => !juengste.includes(q) && q !== hub && erreichbar(q, ziel, reach))) { verwerfen('abkuerzung'); continue; }
      // …ebenso von der Oberkante einer Aufwindsäule, die 3 oder mehr Schritte zurückliegt
      if (abst !== 'zurueck' && abst !== 'tuer' && abst !== 'zielschalter' && schritte.slice(0, -2).some((s2) => s2.lift && erreichbar(s2.lift, ziel, reach))) { verwerfen('abkuerzung-wind'); continue; }
      // Seil (Rückmeldung 27.09.2026: „die Seilsprünge kann man zu 90 % auch mit einem Doppelsprung schaffen“): nur, wenn das
      // Ziel außerhalb dessen liegt, was ein Doppelsprung bei bestem Timing schafft — großzügig geschätzt wie bei der
      // Abkürzungsregel. Die Sim-Proben unten hielten die Richtung immer bis zur Landung; ein Mensch lässt los und bremst auf
      // die Plattform (gemessen: 23 von 52 Seil-Zügen gingen so auch ohne Seil).
      // (Mit Seilgang-Decke über dem größten Teil des Schwungs entscheidet die gründliche Sim-Probe unten: Unter der Decke gibt
      // es keine hohen Bögen, mit denen ein Mensch sie schlagen könnte — gemessen: mit der Schätzung gelang kein einziger
      // Einzelschwung mehr, denn ein Schwung trägt kaum weiter als ein Doppelsprung.)
      const unterDecke = zug.greifNach != null && seilDecke >= 6;
      if ((zug.greifNach != null || zug.flappy) && !unterDecke && erreichbar(plat, ziel, reach)) { verwerfen('seil-unnoetig'); continue; }
      // Dash-Sprung: Die Lücke muss breiter sein als der beste Doppelsprung (reach.gap.double, gemessen) — ohne den
      // Sicherheitsrand der Abkürzungsregel: Die Aufgabe ist das Tech-Fenster, und das Ziel liegt nie tiefer (dy ≤ 0)
      // Kristallkette ebenso: Das Ziel liegt über der Reichweite eines Doppelsprungs
      if (zug.kette && erreichbar(plat, ziel, reach)) { verwerfen('kette-unnoetig'); continue; }
      if (zug.dashSprung && !zug.flach && Math.max(0, Math.max(plat.x0, ziel.x0) - Math.min(plat.x1, ziel.x1) - 1) <= Math.ceil(reach.gap.double)) { verwerfen('dashsprung-unnoetig'); continue; }
      // Notwendigkeit: Eine Mechanik muss gebraucht werden
      // (Das Tor nicht: Sein Ziel erreicht man auch ohne Laser — seine Aufgabe ist das Warten, belegt durch den Strahl in der Bahn)
      // (Tor und Einzelblock nicht: Ihr Ziel erreicht man auch schlicht — ihre Aufgabe ist das Warten bzw. die Genauigkeit)
      if (zug.mechanik && zug.mechanik !== 'tor' && zug.mechanik !== 'einzelblock' && zug.mechanik !== 'schalter' && zug.mechanik !== 'nadeloehr' && zug.mechanik !== 'fallblock' && zug.mechanik !== 'deckel' && zug.mechanik !== 'flach' && zug.mechanik !== 'beschuss' && zug.mechanik !== 'schluesselsprung' && !zug.roehren && ohneMechanikErreichbar({ grid, entities, ohne: neueEnts.filter((e) => e.type !== 'spike'), anker: ankerAlle.length ? ankerAlle : anker, cls, von, plat, ziel, gruendlich: !!zug.ring || zug.greifNach != null, reach })) { verwerfen('unnoetig'); continue; }
      // (Ring: gründliche Probe mit ~50 schlichten Sprüngen — die 21 Standard-Proben waren zu schwach, Rückmeldung
      // 26.09.2026: „viele Boost-Ring-Sprünge gehen auch einfach mit einem Doppelsprung“)

      // Alle Varianten
      // Startkacheln aller Varianten des vorigen Zugs (außer der eigenen) — dort kann man tatsächlich stehen
      // …und eine Kachel links und rechts davon, soweit die Plattform reicht: Kleinste Unterschiede beim Anlauf verschieben
      // die Landung um eine Kachel (Kettenlauf: Landung eine Kachel weiter, der nächste Sprung fiel zu kurz)
      const starts = [];
      if (schritte.length) {
        const vor = schritte[schritte.length - 1];
        const xs = vor.landungen.filter((l) => !l.tot && l.y === von.y).map((l) => l.x);
        if (xs.length) {
          for (let x = Math.max(vor.ziel.x0, Math.min(...xs) - 1); x <= Math.min(vor.ziel.x1, Math.max(...xs) + 1); x++) if (x !== von.x) starts.push(x);
        }
      }
      const schritt = { von, zug, kanteX, ziel, vorlauf, schluessel: schluessel + (abst === 'zurueck' ? 1 : 0), sw: swMaske, starts, ...(zug.schluesselFlug ? { schluesselEnde: schluessel + 1 } : {}) };
      let p = pruefeZug(grid, entities, cls, reach.runSpeed, schritt);
      if (!p.ok) { verwerfen('variante'); continue; }
      // Rückweg geschafft — jetzt erst die Sperre: eine Eiswand vom oberen bis zum unteren Rand gleich hinter der Nische, in
      // Höhe des Hubs eine Tür. Der nächste Zug springt vom Hub über die Nische durch die Tür (sie öffnet sich bei Berührung).
      // Ohne Schlüssel kommt man weder darüber, darunter noch außen herum weiter.
      if (abst === 'zurueck') {
        const dir = hub.dir;
        const bahnAb = new Set();
        for (const s2 of schritte.slice(hub.abSchritt)) for (const key of s2.beruehrt) bahnAb.add(key);
        for (const sp of p.spuren) for (const key of beruehrteKacheln(sp)) bahnAb.add(key);
        const xs = [...bahnAb].map((key) => Number(key.split(',')[0]));
        // …und rechts von den Plattformen des Abstechers samt Kopfraum (die Nische reicht weiter als die berührten Kacheln)
        for (const s2 of schritte.slice(hub.abSchritt)) xs.push(s2.ziel.x0, s2.ziel.x1);
        const kante = dir > 0 ? hub.x1 : hub.x0;
        const xd = dir > 0 ? Math.max(kante, ...xs) + 1 : Math.min(kante, ...xs) - 1;
        const frage = (x, y) => frei(grid, x, y) && !bahnAb.has(`${x},${y}`) && !korridor.has(`${x},${y}`);
        // (höchstens 14 Kacheln vom Hub: so weit, wie man mit der Vorausschau der Kamera sieht — die Tür soll man vom Hub aus erkennen)
        let passt = xd >= RAND && xd < W - RAND && Math.abs(xd - kante) <= 14;
        for (let y = 0; y < H && passt; y++) if (!frage(xd, y)) passt = false;
        // Schwelle hinter der Tür: 4 Kacheln in Hub-Höhe mit Kopfraum — dort landet der Zug durch die Tür (eine zufällig
        // gesuchte Landefläche scheiterte fast immer an der Wand)
        const schwelle = { x0: dir > 0 ? xd + 1 : xd - 4, x1: dir > 0 ? xd + 4 : xd - 1, row: hub.row };
        for (let x = schwelle.x0; x <= schwelle.x1 && passt; x++) for (let y = hub.row - 3; y <= hub.row; y++) if (!frage(x, y) || strahlen.has(`${x},${y}`)) passt = false;
        if (!passt) { verwerfen('abstecher-wand'); continue; }
        for (let x = schwelle.x0; x <= schwelle.x1; x++) setzeKachel(x, hub.row, ROCK);
        zug.schwelle = schwelle;
        for (let y = 0; y < H; y++) {
          // 7 Zeilen hoch: Über Nische und Wand hinweg braucht der nächste Zug oft einen Doppelsprung, dessen Bogen höher liegt
          if (y >= hub.row - 7 && y < hub.row) setzeEntity({ type: 'door', tx: xd, ty: y });
          else setzeKachel(xd, y, 'I');
        }
      }
      // Nadelöhr: Röhren aus Eis quer durch die Flugbahn, je 8 Kacheln über und unter der Lücke (bis zum Kartenrand zerschnitten
      // sie in Türmen den weiteren Weg; 8 Kacheln höher trägt kein Bogen). Die Lücke umfasst genau die Kacheln, die irgendeine
      // Variante an dieser Spalte berührt, plus eine Kachel Luft. Beim Schwung zwei Röhren hintereinander. Oben auf der Röhre
      // setzt das Sicherheitsnetz der Füllung Stacheln.
      if (zug.roehren) {
        const alle = p.spuren.map((sp) => beruehrteKacheln(sp));
        const eigen = new Set(alle.flatMap((set) => [...set]));
        const xs = [...eigen].map((key) => Number(key.split(',')[0]));
        const xa = Math.min(...xs);
        const xb = Math.max(...xs);
        let gesetzt = 0;
        // (Beim Seilschwung erst hinten, nach dem Loslassen: Eine Röhre zwischen Spieler und Anker kappte das Seil)
        const anteile = zug.greifNach != null ? [0.7, 0.88] : zug.roehren === 2 ? [0.35, 0.65] : [0.5];
        // (Flappy-Seil: an den gemerkten Stellen zwischen den Ankern)
        const spalten = zug.roehrenX || anteile.map((anteil) => Math.round(xa + (xb - xa) * anteil));
        for (const cx of spalten) {
          let ya = Infinity;
          let yb = -1;
          for (const key of eigen) { const [x, y] = key.split(',').map(Number); if (x === cx || x === cx + 1) { ya = Math.min(ya, y); yb = Math.max(yb, y); } }
          if (!Number.isFinite(ya)) continue;
          const lueckeOben = ya - 1;
          const lueckeUnten = yb + 1;
          const spalteFreiVon = (x, y0, y1) => { for (let y = y0; y <= y1; y++) if (!frei(grid, x, y) || korridor.has(`${x},${y}`) || strahlen.has(`${x},${y}`) || eigen.has(`${x},${y}`)) return false; return true; };
          const oben = Math.max(1, lueckeOben - 8);
          const unten = Math.min(H - 1, lueckeUnten + 8);
          if (lueckeOben < 3 || lueckeUnten > H - 3) continue;
          if (![cx, cx + 1].every((x) => spalteFreiVon(x, oben, lueckeOben - 1) && spalteFreiVon(x, lueckeUnten + 1, unten))) continue;
          for (const x of [cx, cx + 1]) {
            for (let y = oben; y < lueckeOben; y++) setzeKachel(x, y, 'I');
            for (let y = lueckeUnten + 1; y <= unten; y++) setzeKachel(x, y, 'I');
          }
          gesetzt++;
        }
        if (!gesetzt) { verwerfen('roehre-platz'); continue; }
        p = pruefeZug(grid, entities, cls, reach.runSpeed, schritt);
        if (!p.ok) { verwerfen('roehre-variante'); continue; }
        // Notwendigkeit erst MIT den Röhren: Ein schlichter Doppelsprung, der ohne sie reichte, prallt jetzt dagegen —
        // erst so wird ein Schwung durchs Nadelöhr wirklich nötig
        if (zug.mechanik && zug.mechanik !== 'nadeloehr' && zug.mechanik !== 'fallblock' && ohneMechanikErreichbar({ grid, entities, ohne: neueEnts.filter((e) => e.type !== 'spike'), anker: ankerAlle.length ? ankerAlle : anker, cls, von, plat, ziel, gruendlich: !!zug.ring, reach })) { verwerfen('unnoetig'); continue; }
        zug.roehrenGesetzt = gesetzt;
      }
      // Tür des Schlüsselsprungs davor: quer durch die Flugbahn DIESES Zugs, darüber und darunter Eis (wie beim Nadelöhr) —
      // offen nur mit Schlüssel. Wer ihn im Flug davor verpasst hat, prallt ab. Waagerechter Flug: eine Türspalte; steiler
      // Flug (Schlot, Aufstieg): eine Türluke.
      let tuerGesetzt = false;
      // (Findet die Tür nach 60 % der Versuche keinen Platz, geht es ohne — der Schlüssel bleibt dann ein Sammelstück; sonst
      // nahm der Planer den Schlüsselsprung so oft zurück, bis der ganze Weg abbrach)
      if (tuerFaellig && !abst && versuch < VERSUCHE * 0.6) {
        const alle = new Set(p.spuren.flatMap((sp) => [...beruehrteKacheln(sp)]));
        const aufPlat = (x, y, q) => x >= q.x0 - 1 && x <= q.x1 + 1 && y >= q.row - 4 && y <= q.row;
        const flugK = [...alle].map((key) => key.split(',').map(Number)).filter(([x, y]) => !aufPlat(x, y, plat) && !aufPlat(x, y, ziel));
        if (flugK.length < 3) { verwerfen('tuer-platz'); continue; }
        const xs = flugK.map((q) => q[0]);
        const ys = flugK.map((q) => q[1]);
        const spalte = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
        const besetzt = (x, y) => !frei(grid, x, y) || korridor.has(`${x},${y}`) || strahlen.has(`${x},${y}`);
        // Eis über/unter der Türspalte bzw. links/rechts der Luke, bis 7 Kacheln (im Schlot schließt die Schachtwand an)
        const eisLauf = (x, y, sx, sy, eis) => {
          for (let k = 0; k < 7; k++) {
            const [ex, ey] = [x + sx * k, y + sy * k];
            if (rahmen && (ex < rahmen.x0 || ex > rahmen.x1)) return 7;
            if (besetzt(ex, ey) || alle.has(`${ex},${ey}`)) return k;
            eis.push([ex, ey]);
          }
          return 7;
        };
        /** Tür an Spalte bzw. Zeile c — oder null */
        const tuerBei = (c) => {
          const tuer = [];
          const eis = [];
          let lang;
          if (spalte) {
            const zeilen = [...alle].map((key) => key.split(',').map(Number)).filter(([x]) => x === c).map((q) => q[1]);
            const [ya, yb] = [Math.min(...zeilen) - 1, Math.max(...zeilen) + 1];
            // (eine Kachel dick: Die Tür zählt je Kachel als Element — zwei Spalten fraßen bis zu 200 vom Elemente-Limit)
            for (let y = ya; y <= yb; y++) tuer.push([c, y]);
            lang = Math.min(eisLauf(c, ya - 1, 0, -1, eis), eisLauf(c, yb + 1, 0, 1, eis));
          } else {
            const spalten = [...alle].map((key) => key.split(',').map(Number)).filter(([, y]) => y === c).map((q) => q[0]);
            const [xa, xb] = [Math.min(...spalten) - 1, Math.max(...spalten) + 1];
            for (let x = xa; x <= xb; x++) tuer.push([x, c]);
            lang = Math.min(eisLauf(xa - 1, c, -1, 0, eis), eisLauf(xb + 1, c, 1, 0, eis));
          }
          // (Ob man außen herum käme, prüft unten die Probe ohne Schlüssel — hier reicht ein Ansatz von 3 Kacheln Eis)
          return lang >= 3 && !tuer.some(([x, y]) => besetzt(x, y)) ? { tuer, eis } : null;
        };
        // Kandidaten von der Mitte des Flugs nach außen
        const werte = [...new Set(spalte ? xs : ys)].sort((a, b) => a - b);
        const mitteW = werte[Math.floor(werte.length / 2)];
        werte.sort((a, b) => Math.abs(a - mitteW) - Math.abs(b - mitteW) || a - b);
        let gefunden = null;
        for (const c of werte) { gefunden = tuerBei(c); if (gefunden) break; }
        if (!gefunden) { verwerfen('tuer-platz'); continue; }
        const { tuer, eis } = gefunden;
        for (const [x, y] of eis) setzeKachel(x, y, 'I');
        for (const [x, y] of tuer) setzeEntity({ type: 'door', tx: x, ty: y });
        schritt.schluesselEnde = schritt.schluessel - 1;
        p = pruefeZug(grid, entities, cls, reach.runSpeed, schritt);
        if (!p.ok) { verwerfen('tuer-variante'); continue; }
        // Ohne Schlüssel kein Durchkommen: weder dieser Zug noch ein schlichter Sprung außen herum
        const aus0 = ausschnittWelt(grid, entities, von, cls, { x: Math.round((von.x + ziel.x0) / 2), y: Math.round((von.y + ziel.row) / 2) });
        aus0.welt.flags.sw = swMaske;
        const r0 = spieleZug(aus0, ...mitVorlauf(zugEingabe(zug, kanteX - aus0.x0 * TILE), zugFertig, vorlauf), 700);
        const e0 = r0.spur[r0.spur.length - 1];
        const st0 = e0 ? standKachel(e0) : null;
        if (!r0.tot && e0 && e0.boden && st0.y === ziel.row - 1 && st0.x >= ziel.x0 && st0.x <= ziel.x1) { verwerfen('tuer-offen'); continue; }
        if (ohneMechanikErreichbar({ grid, entities, ohne: [], anker: null, cls, von, plat, ziel, gruendlich: true, reach })) { verwerfen('tuer-aussen'); continue; }
        tuerGesetzt = true;
      }
      // Schlot: Plattform, Bahnen aller Varianten und Bauteile bleiben im Schacht (Kanonen dürfen in der Wand sitzen). Beim
      // ersten Zug der Etappe zählt, was über der alten Plattform liegt, nicht mit (dort ist der Eingang in den Schacht).
      if (rahmen) {
        const raus = (x) => (x < rahmen.x0 || x > rahmen.x1) && !(rahmen.ab === i && x >= plat.x0 - 2 && x <= plat.x1 + 2);
        if (ziel.x0 < rahmen.x0 || ziel.x1 > rahmen.x1 || aenderungen.some(([x]) => x < rahmen.x0 - 1 || x > rahmen.x1 + 1)) { verwerfen('schlot-bau'); continue; }
        if (p.spuren.some((sp) => [...beruehrteKacheln(sp)].some((key) => raus(Number(key.split(',')[0]))))) { verwerfen('schlot-bahn'); continue; }
      }
      // Fallblock: Ab wann ist man im Anflug unter ihm (in seiner Breite, höchstens 10 Zeilen darunter)? Die Zeit von dort bis
      // zum Stillstand ist der Vorlauf des nächsten Zugs — im ungünstigsten Fall über alle Varianten
      if (ziel.fallblock) {
        const by = ziel.row - 9;
        let laengste = 0;
        for (const sp of p.spuren) {
          const k = sp.findIndex((q) => q.x + PLAYER_W > ziel.x0 * TILE && q.x < (ziel.x1 + 1) * TILE && q.y >= by * TILE && q.y <= (by + 11) * TILE);
          if (k >= 0) laengste = Math.max(laengste, sp.length - k);
        }
        ziel.fallVorlauf = laengste;
        // …und umgekehrt: Flog schon ein FRÜHERER Zug durch die Auslösezone, fällt der Block zu früh und liegt beim Landen
        // auf der Plattform (gemessen: Kettenlauf-Fehler an 3 von 12 Leveln, Landung eine Kachel zu hoch)
        let frueh = false;
        for (let x = ziel.x0; x <= ziel.x1 && !frueh; x++) {
          for (let y = by; y <= by + 11 && !frueh; y++) frueh = schritte.some((s2) => s2.beruehrt && s2.beruehrt.has(`${x},${y}`));
        }
        if (frueh) { verwerfen('fallblock-frueh'); continue; }
        // Die Fallzone (Blockbreite, vom Block bis zur Plattform) darf später kein anderer Zug mehr berühren
        fallZone = new Set();
        for (let x = ziel.x0; x <= ziel.x1; x++) for (let y = by; y < ziel.row; y++) fallZone.add(`${x},${y}`);
      }
      // Wer unter einem ALTEN Fallblock durchfliegt, löst ihn aus und wird erschlagen: nur der Zug, der auf seiner Plattform
      // landet, und der, der von ihr abspringt, dürfen in seine Zone
      const fremdeZonen = schritte.slice(0, -1).filter((s2) => s2.fallZone);
      if (fremdeZonen.length && p.spuren.some((sp) => [...beruehrteKacheln(sp)].some((key) => fremdeZonen.some((s2) => s2.fallZone.has(key))))) { verwerfen('fallzone'); continue; }
      // Kein Zug kreuzt den Strahl eines fremden Tors: Wer dort ankommt, wartet nicht — er stürbe je nach Takt zufällig
      if (strahlen.size && p.spuren.some((sp) => [...beruehrteKacheln(sp)].some((key) => strahlen.has(key) && !eigenerStrahl?.has(key)))) { verwerfen('strahl'); continue; }

      // Stört dieser Zug einen früheren? Neue Plattform, Feder, Ring, Anker oder Portal könnten in dessen Flugbahn liegen
      // oder sie verändern (Wandkontakt). Geprüft werden nur frühere Züge, deren Flugbahn nahe an den Änderungen liegt.
      const ax0 = Math.min(...aenderungen.map((a) => a[0])) - 3;
      const ax1 = Math.max(...aenderungen.map((a) => a[0])) + 3;
      const ay0 = Math.min(...aenderungen.map((a) => a[1])) - 3;
      const ay1 = Math.max(...aenderungen.map((a) => a[1])) + 3;
      // Trägt ein früherer Zug noch, kann sich seine Flugbahn trotzdem geändert haben (etwa ein Kopfstoß am neuen Fels):
      // Dann gilt ab jetzt seine NEUE Flugbahn als Korridor — sonst setzt die Füllung genau dorthin eine Stachel.
      const nachgeprueft = [];
      let gestoert = false;
      for (const alt of schritte) {
        if (alt.box.x1 < ax0 || alt.box.x0 > ax1 || alt.box.y1 < ay0 || alt.box.y0 > ay1) continue;
        const q = pruefeZug(grid, entities, cls, reach.runSpeed, alt);
        // Gestört ist er auch, wenn er noch trägt, aber woanders zum Stehen kommt — etwa weil er jetzt auf der Feder des
        // nächsten Zugs landet und weiterspringt (Kettenlauf: 7 Kacheln daneben, der nächste Zug lief an seiner Feder vorbei)
        if (!q.ok || q.landungen.some((l, j) => l.x !== alt.landungen[j]?.x || l.y !== alt.landungen[j]?.y)) { gestoert = true; break; }
        nachgeprueft.push({ alt, q });
      }
      if (gestoert) { verwerfen('stoertFrueheren'); continue; }

      // Korridor (nur die NEUEN Kacheln merken — für die Rücknahme); Elemente des Zugs liegen darin
      const neu = [];
      const merke = (key) => { if (!korridor.has(key)) { korridor.add(key); neu.push(key); } };
      for (const sp of p.spuren) for (const key of beruehrteKacheln(sp)) merke(key);
      for (const { alt, q } of nachgeprueft) {
        for (const sp of q.spuren) {
          for (const key of beruehrteKacheln(sp)) {
            merke(key);
            alt.beruehrt.add(key);
            const [x, y] = key.split(',').map(Number);
            alt.box = { x0: Math.min(alt.box.x0, x), x1: Math.max(alt.box.x1, x), y0: Math.min(alt.box.y0, y), y1: Math.max(alt.box.y1, y) };
          }
        }
      }
      // Über der ganzen Plattform bleiben 3 Zeilen frei (Kopfraum: der Bewegungsgraph verlangt ihn, und ein niedriger Deckel
      // über einer Landefläche fühlt sich wie ein Fehler an)
      // Bröckelblöcke und Laserstrahlen sind keine Kacheln im Raster — als Korridor bleiben sie von Füllung und Plattformen frei
      if (ziel.broeckel || ziel.farbe != null) for (let x = ziel.x0; x <= ziel.x1; x++) merke(`${x},${ziel.row}`);
      for (const key of eigenerStrahl || []) merke(key);
      for (const key of polster || []) merke(key);
      const kopf = i === letzterIdx ? ZIEL_KOPF : 3;
      for (let x = ziel.x0; x <= ziel.x1; x++) for (let y = ziel.row - kopf; y < ziel.row; y++) merke(`${x},${y}`);
      stapel.push({ plat, cur, neu, ziel, extra, sperre, federVorher: !!plat.feder, portal: zug.art === 'portal', hub, schluessel, tuerFaellig, luftPortale, rahmen: rahmenVorher, swMaske, kanalZahl, farbe });
      // Ein Schalter KIPPT das Bit seines Kanals (auch zurück auf 0, wenn der Kanal schon einmal geschaltet war)
      if (abst === 'zielschalter') { swMaske ^= 1 << zug.schalterKanal; kanalZahl++; zielPunkt = zug.zielPunkt; }
      if (zug.schalter) {
        swMaske ^= 1 << zug.schalterKanal;
        if (!zug.wechsel) kanalZahl++;
        farbe = { kanal: zug.schalterKanal, solidWhen: zug.schalterZiel, rest: rng.intRange(1, 2), szene };
      }
      else if (ziel.farbe != null && farbe) farbe = { ...farbe, rest: farbe.rest - 1 };
      if (abst === 'start') { hub = plat; hub.dir = eintrag.hauptDir; hub.abSchritt = schritte.length; }
      if (abst === 'zurueck') schluessel++;
      if (abst === 'tuer') schluessel = Math.max(0, schluessel - 1);
      // Schlüsselsprung: Schlüssel in der Tasche, der nächste Zug bekommt die Tür; die Tür verbraucht ihn wieder
      if (zug.schluesselFlug) { schluessel++; tuerFaellig = true; } else if (tuerGesetzt) { schluessel = Math.max(0, schluessel - 1); tuerFaellig = false; } else if (tuerFaellig && !abst) tuerFaellig = false;
      if (zug.luftportal) luftPortale++;
      if (zug.art === 'feder') plat.feder = true;                // für die Abkürzungsprüfung: von hier kommt man höher
      if (zug.art === 'portal') portale++;
      // Tatsächlich berührte Kacheln (ohne reservierten Kopfraum): Die Füllung setzt Stacheln UNTER und ÜBER diese Bahn
      const beruehrt = beruehrteKacheln(p.spuren.flat());
      const kacheln = [...beruehrt].map((key) => key.split(',').map(Number));
      const box = {
        x0: Math.min(...kacheln.map((q) => q[0])), x1: Math.max(...kacheln.map((q) => q[0])),
        y0: Math.min(...kacheln.map((q) => q[1])), y1: Math.max(...kacheln.map((q) => q[1])),
      };
      // Die Zielplattform kennzeichnen: Die Füllung setzt auf ihr keine Landekanten-Stacheln (dort liegt das Ziel)
      if (letzter) ziel.zielPlattform = true;
      // Motiv-Vorstellung: den Zug merken (nur Eingaben; dy so, wie er wirklich gebaut wurde)
      let motivKey = null;
      if (mm && mm.rolle === 'setzen' && !abst && motivFaehig(zug)) {
        motivKey = `${mm.id}:${mm.teil}`;
        motive.set(motivKey, { zug: motivKopie(zug), dy: ziel.row - (von.y + 1) });
      }
      // (`geplant`: die Aufgabe laut Szenenplan — Diagnose, wie oft sie gelingt)
      schritte.push({ ...schritt, geplant: mechanikPlan, motiv: motivGenutzt || (motivKey ? mm : null), motivKey, abstecher: abst, anker, lift, fallZone, schlot: rahmen, landungen: p.landungen, richtung, szene, mechanik: abst === 'zurueck' ? 'schluessel' : zug.mechanik || (zug.broeckel ? 'broeckel' : 'sprung'), box, beruehrt });
      plattformen.push(ziel);
      plat = ziel;
      cur = { x: p.landungen[0].x, y: ziel.row - 1 };
      // Nach einem Portal nicht umdrehen: Der nächste Zug liefe sonst zurück durch den Ausgang
      sperre = zug.art === 'portal' ? zug.dir : null;
      return true;
    }
    return false;
  };

  /** Den letzten Zug zurücknehmen */
  const zuruecknehmen = () => {
    const letzt = stapel.pop();
    while (letzt.extra.length) letzt.extra.pop()();          // Plattform, Federn, Ringe, Anker, Portale
    for (const key of letzt.neu) korridor.delete(key);
    const entfernt = schritte.pop();
    if (entfernt.motivKey) motive.delete(entfernt.motivKey);
    plattformen.pop();
    plat = letzt.plat;
    cur = letzt.cur;
    sperre = letzt.sperre;
    hub = letzt.hub;
    schluessel = letzt.schluessel;
    tuerFaellig = letzt.tuerFaellig;
    luftPortale = letzt.luftPortale;
    rahmen = letzt.rahmen;
    swMaske = letzt.swMaske;
    kanalZahl = letzt.kanalZahl;
    farbe = letzt.farbe;
    letzt.plat.feder = letzt.federVorher;
    if (letzt.portal) portale--;
    zaehle('ruecknahme');
  };

  let i = 0;
  while (i < richtungen.length) {
    if (versuche(i)) { i++; continue; }
    // Ein Schlüssel-Abstecher, der hier keinen Platz findet, wird aufgegeben statt den ganzen Weg abzubrechen: bis zu
    // seinem Anfang zurück, dort schlichte Züge in Hauptrichtung (gemessen: sonst endete jedes zweite Level mit Abstecher
    // nach 11–26 von 56 Zügen)
    const e = richtungen[i];
    // Das Zielschloss findet keinen Platz: dann eben ohne — das Level ist ja fertig
    if (typeof e === 'object' && e.abstecher === 'zielschalter') { richtungen.pop(); zaehle('zielschlossAufgegeben'); continue; }
    // (auch, wenn der Zug direkt nach dem Abstecher nicht durch die Tür findet)
    const nachAbstecher = i > 0 && typeof richtungen[i - 1] === 'object' && richtungen[i - 1].abstecher === 'zurueck';
    if (typeof e === 'object' && (e.abstecher || nachAbstecher)) {
      let s0 = nachAbstecher ? i - 1 : i;
      while (richtungen[s0].abstecher !== 'start') s0--;
      while (i > s0) { zuruecknehmen(); i--; }
      for (let k = s0; k < richtungen.length && richtungen[k].abstecher; k++) richtungen[k] = { r: 'rechts', szene: richtungen[k].szene, mechanik: '' };
      richtungen.forEach((_, k) => { hochDanach[k] = richtungen.slice(k + 1).filter(istHoch).length; });
      zaehle('abstecherAufgegeben');
      continue;
    }
    if (!stapel.length || rueckBudget-- <= 0) { abbruch = { bei: i, gruende }; break; }
    zuruecknehmen();
    i--;
  }
  // Vorzeitiges Ende: Der letzte Zug war nie als Zielzug geplant, und die gemeinsame Schicht baut das Ziel trotzdem auf seine
  // Plattform — zu nah am oberen Rand schob sie es nach unten (weg vom Weg), über einer älteren Plattform überbaute ihr
  // Kopfraum diese (gemessen: Graph fand das Ziel nicht / Zone „gerissen“). Deshalb so lange zurücknehmen, bis das Ziel taugt.
  if (abbruch) {
    const taugt = () => {
      const z = schritte[schritte.length - 1].ziel;
      if (z.row < ZIEL_ZEILE_MIN || z.broeckel || z.farbe != null || z.fallblock) return false;
      // Was die gemeinsame Zielplattform anfasst: ZIEL_BREITE um die Mitte, Kopfraum darüber, zwei Zeilen Boden
      const gx0 = Math.round((z.x0 + z.x1) / 2) - Math.floor(ZIEL_BREITE / 2);
      const gx1 = gx0 + ZIEL_BREITE - 1;
      const y0 = z.row - 1 - (KOPFRAUM + 1);
      const y1 = z.row + 2;
      if (plattformen.slice(0, -1).some((p) => p.row >= y0 && p.row <= y1 && p.x1 >= gx0 && p.x0 <= gx1)) return false;
      return !entities.some((e) => e.type !== 'spike' && e.tx >= gx0 && e.tx <= gx1 && e.ty >= y0 && e.ty <= y1);
    };
    while (schritte.length > 1 && stapel.length && !taugt()) zuruecknehmen();
  }
  return { schritte, plattformen, korridor, entities, ende: cur, abbruch, gruende, zielPunkt };
}
