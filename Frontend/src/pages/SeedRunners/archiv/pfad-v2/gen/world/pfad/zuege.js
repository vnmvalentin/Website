// Züge: die Eingaben einer Bewegung, so wie ein Mensch sie drückt — anlaufen bis zur Kante, Sprung eine Zeit lang
// halten, Richtung halten oder loslassen, Doppelsprung nach einer Weile. Jeder Zug hat Stellgrößen, die der Planer
// würfelt; die Varianten eines Zugs verschieben dieselben Stellgrößen um die Ungenauigkeit eines Menschen.
//
//   sprung   anlaufen bis zur Absprunglinie, springen (Taste `halte` Ticks gehalten)
//   doppel   wie sprung, dazu `doppelNach` Ticks nach dem Absprung ein zweiter Druck (`doppelHalte` gehalten)
//   fall     über die Kante laufen, ohne zu springen; optional Doppelsprung `doppelNach` Ticks nach dem Verlassen
//   feder    wie fall: Man läuft über eine Feder (die der Planer auf die Plattform setzt), sie schleudert einen hoch
//   portal   in ein Portal laufen; nach dem Austritt noch `nachlauf` Ticks weiterlaufen, dann stehen bleiben
//   bruecke  eine zu lange Platte über der Grube auslösen: an ihren Rand laufen, bis sie wackelt, aus ihrer Spalte
//            zurückweichen, warten, bis sie liegt (+`reaktion`), hinaufspringen (`halte`, `sprungAbstand` px vor ihr),
//            hinüberlaufen und dahinter anhalten — bevor sie nach `reset` Sekunden zurückfährt
//   deckel   eine Platte, die ein Loch in der Decke verschließt, auslösen (wie bruecke), dann vom liegenden Block
//            senkrecht durch das Loch hinauf (`halte`, Doppelsprung nach `doppelNach`) und neben dem Loch landen
//   kopfueber Schwerkraft-Zone: hinauf an die Decke, kopfüber laufen und über Lücken der Decke springen, am Ende der Zone
//            zurück auf den Boden (`luecken`, `halte`)
//   wand     in einen Schacht springen und an seinen Wänden hochklettern: bei jedem Wandkontakt `reaktion` Ticks rutschen,
//            dann abspringen (`wandHalte` Ticks gehalten) und zur anderen Wand halten — bis man oben über eine Wand kommt
//
// Böe (bei sprung/doppel mit Rückenwind im Takt): an der Kante auf den Anfang einer Böe warten, `boeeReaktion` Ticks
// später los.
//
// Tor (bei sprung/doppel): vor dem Anlaufen auf das Abschalten des nächsten Lasers warten, dann `torReaktion` Ticks später
// loslaufen. Die Sim-Zeit des Ausschnitts ist nicht die des Levels — das Warten auf die Flanke macht den Zug von der
// Ankunftszeit unabhängig, genau wie ein Mensch, der den Takt abpasst.
//
// Dash (sprung/doppel): `dashNach` Ticks nach dem Absprung die Dash-Taste (mit Richtung, optional schräg hoch). Die
// Ladung kommt von einem Kristall, den der Planer in den Bogen setzt.
//
// Kristallkette (`kette` = Zahl der Kristalle): nach dem Doppelsprung am Scheitel dashen, sobald ein Kristall geladen hat
// (`kReaktion[k]` Ticks später; `kDiag[k]`: schräg in Laufrichtung statt senkrecht).
// Dash-Sprung (`dashSprung`): an der Absprunglinie dashen (`dashNach` 0), `sprungNach` Ticks später springen.
// Flacher Sprung (`flach`): nur kurz getippt (`halte` 4–8) — unter einer Stacheldecke hindurch.
//
// Greifen (bei jeder Art möglich): `greifNach` Ticks nach dem Absprung die Greiftaste drücken, `greifHalte` Ticks halten.
// Flappy-Seil (`flappy` = Zahl der Anker): Griffe nach LAGE, nicht nach Zeit — wie ein Mensch, der zugreift, wenn er am
// Anker ist. Anker k (`seilRel[k]`, relativ zur Startkachel): greifen `greif[k].r1` Ticks nachdem man `vor` px vor ihm ist,
// loslassen `r2` Ticks nachdem man `los` px hinter ihm ist. Mit Zeiten summierten sich ±50 ms über die Schwünge auf.
//
// Gemeinsam: `loslassen` (Ticks nach dem Absprung) — ab dann keine Richtungstaste mehr: ein kürzerer Bogen.

import { INPUT } from '../../../sim/inputBits.js';
import { PLAYER_W, PLAYER_H, TILE } from '../../../sim/config.js';

/** Ungenauigkeit eines Menschen, in Ticks (120 Hz): ±6 = ±50 ms */
export const TOLERANZ = 6;

/**
 * Eingabe-Funktion für einen Zug. `absX` = Absprunglinie in Ausschnitt-Pixeln: Vorderkante (in Laufrichtung) erreicht sie
 * → Absprung. `kanteVersatz` verschiebt sie (Pixel, positiv = später).
 */
export function zugEingabe(zug, absX) {
  const richtung = zug.dir > 0 ? INPUT.RIGHT : INPUT.LEFT;
  return (welt, t, z) => {
    const p = welt.player;
    // Flappy-Seil: die Anker gleich zu Beginn suchen, solange man noch auf der Startkachel steht — erwartete Kachel relativ zu
    // ihr, der nächste echte Anker höchstens 2 Kacheln daneben
    if (zug.flappy && zug.seilRel && z.anker === undefined) {
      const sx = Math.floor((p.x + PLAYER_W / 2) / TILE);
      const sy = Math.floor((p.y + PLAYER_H - 1) / TILE);
      z.anker = zug.seilRel.map((r) => {
        const ab = (a) => Math.abs(a.tx - sx - r.dx) + Math.abs(a.ty - sy - r.dy);
        return welt.map.anchors.filter((a) => ab(a) <= 2).sort((a, b) => ab(a) - ab(b))[0] || null;
      });
      z.k = 0;
    }
    if (zug.tor && z.torT === undefined) {
      // SEIN Laser: Der Planer merkt sich dessen Lage relativ zur Standkachel (torRel). Früher: der nächste Laser in
      // Laufrichtung — auf der ganzen Karte war das manchmal ein anderer als im Prüfausschnitt (Kettenlauf: Tod am Laser).
      // Ohne Laser (bei der Probe, bevor der Planer ihn setzt) sofort los.
      if (z.laser === undefined) {
        const sx = Math.floor((p.x + PLAYER_W / 2) / TILE);
        const sy = Math.floor((p.y + PLAYER_H - 1) / TILE);
        // (der nächste zur erwarteten Stelle, höchstens 2 Kacheln daneben: Steht man genau auf einer Kachelgrenze, liegt die
        // Standkachel eine neben der des Planers)
        const ab = (el) => Math.abs(el.tx - sx - zug.torRel.dx) + Math.abs(el.ty - sy - zug.torRel.dy);
        z.laser = zug.torRel ? welt.elements.filter((el) => el.type === 'laser' && ab(el) <= 2).sort((a2, b2) => ab(a2) - ab(b2))[0] || null : null;
        z.warAn = z.laser?.on;
      }
      if (!z.laser) z.torT = t;
      else {
        if (z.warAn && !z.laser.on) z.torT = t + zug.torReaktion;
        z.warAn = z.laser.on;
        return 0;
      }
    }
    if (zug.tor && t < z.torT) return 0;
    // Böe im Takt: erst bis 12 px vor die Absprunglinie, dort auf den ANFANG einer Böe warten (+`boeeReaktion`), dann los —
    // der Sprung fällt so ganz in die Böe. Die Windzone findet der Zug über `boeeRel` (wie das Tor seinen Laser).
    if (zug.boee && z.boeT === undefined) {
      if (z.wind === undefined) {
        const sx = Math.floor((p.x + PLAYER_W / 2) / TILE);
        const sy = Math.floor((p.y + PLAYER_H - 1) / TILE);
        const ab = (el) => Math.abs(el.tx - sx - zug.boeeRel.dx) + Math.abs(el.ty - sy - zug.boeeRel.dy);
        z.wind = zug.boeeRel ? welt.elements.filter((el) => el.type === 'wind' && el.period && ab(el) <= 2).sort((a2, b2) => ab(a2) - ab(b2))[0] || null : null;
      }
      if (!z.wind) z.boeT = t;
      else {
        z.boeWartet = true;
        const vorne = zug.dir > 0 ? p.x + PLAYER_W : p.x;
        const halt = absX + zug.dir * ((zug.kanteVersatz || 0) - 12);
        if (zug.dir > 0 ? vorne < halt : vorne > halt) return richtung;
        if (z.warAn === false && z.wind.on) { z.boeT = t + zug.boeeReaktion; z.boeWartet = false; }
        z.warAn = z.wind.on;
        return 0;
      }
    }
    if (zug.boee && t < z.boeT) return 0;
    if (zug.art === 'mitfahrt') return mitfahrtEingabe(welt, zug, absX, p, t, z, richtung);
    if (zug.art === 'bruecke') return brueckeEingabe(welt, zug, p, t, z, richtung);
    if (zug.art === 'deckel') return deckelEingabe(welt, zug, p, t, z, richtung);
    if (zug.art === 'kopfueber') return kopfueberEingabe(zug, absX, p, t, z, richtung);
    // Gelandet: loslassen und ausrutschen lassen, wie ein Mensch, der ankommt — die Rutschstrecke gehört zur Bahn (sonst
    // setzte die Füllung Landekanten-Stacheln genau dorthin; im Kettenlauf rutschte man nach einem Ring hinein)
    if (z.luft && p.onGround && zug.art !== 'portal') return 0;
    if (zug.art === 'wand') return wandEingabe(zug, absX, p, t, z, richtung);
    if (z.ab === undefined) {
      const vorne = zug.dir > 0 ? p.x + PLAYER_W : p.x;
      const linie = absX + zug.dir * (zug.kanteVersatz || 0);
      // (`sofort`: auf der Stelle abspringen, ohne erst an die Kante zu laufen — etwa zum Zielschalter über einem hinauf)
      const erreicht = zug.sofort || (zug.dir > 0 ? vorne >= linie : vorne <= linie);
      if (zug.art === 'portal') {
        // Austritt erkennen: ein Sprung der Position um mehr als 3 Kacheln in einem Tick (waagerecht oder senkrecht)
        if (z.letztX !== undefined && Math.sqrt((p.x - z.letztX) * (p.x - z.letztX) + (p.y - z.letztY) * (p.y - z.letztY)) > 48) z.ab = t;
        z.letztX = p.x;
        z.letztY = p.y;
        return richtung;
      }
      if (zug.art === 'fall' || zug.art === 'feder') {
        if (!p.onGround && t > 2) z.ab = t;        // über die Kante gelaufen
        return richtung;
      }
      if (!erreicht) return richtung;
      z.ab = t;
    }
    const s = t - z.ab;
    if (zug.art === 'portal') return s < (zug.nachlauf ?? 12) ? richtung : 0;
    let m = zug.loslassen != null && s >= zug.loslassen ? 0 : richtung;
    if (zug.greifNach != null && s >= zug.greifNach && s < zug.greifNach + zug.greifHalte) m |= INPUT.GRAPPLE;
    if (zug.flappy && zug.seilRel) m |= flappyGriff(welt, zug, p, t, z);
    // Kristallkette: Nach dem Doppelsprung am Scheitel dashen, sobald ein Kristall die Ladung gegeben hat — nach ZUSTAND
    // (Ladung + nahe Scheitel) plus Reaktionszeit, nicht nach Zeit (beim Flappy-Seil summierten sich Zeiten auf)
    if (zug.kette && s > (zug.doppelNach ?? 0) + 2) {
      if (z.kk === undefined) z.kk = 0;
      if (z.kk < zug.kette) {
        if (z.dashT === undefined && p.dashCharges > 0 && p.vy * p.gd >= -40) z.dashT = t + zug.kReaktion[z.kk];
        if (z.dashT !== undefined && t >= z.dashT) {
          m = (zug.kDiag[z.kk] ? richtung : 0) | INPUT.DASH | INPUT.UP;
          z.kk++;
          z.dashT = undefined;
        } else if (z.kk >= 1) {
          // Zwischen den Dashes keine Richtung: Ein senkrechter Dash hat kein Seitentempo, die Kristalle liegen dann genau
          // übereinander — nur nach oben dashen (Rückmeldung 27.09.2026, welt-46032: „nach oben dashen, schnell nach rechts,
          // wieder nach oben … einfacher, wenn man nur nach oben dashen muss“)
          m &= ~(INPUT.LEFT | INPUT.RIGHT);
        }
      }
    }
    // Dash (nach dem Kristall): Richtung halten, einmal drücken — schräg nach oben mit UP
    // ('senkrecht': nur hoch, ohne Richtung — der Dash geht dann gerade nach oben)
    if (zug.dashNach != null && s === zug.dashNach) m = (zug.dashHoch === 'senkrecht' ? 0 : richtung) | INPUT.DASH | (zug.dashHoch ? INPUT.UP : 0) | (m & INPUT.JUMP);
    // (Dash-Sprung: erst dashen, `sprungNach` Ticks später springen — im Tech-Fenster des Dashs)
    if (zug.art === 'sprung' || zug.art === 'doppel') { const sj = s - (zug.sprungNach || 0); if (sj >= 0 && sj < zug.halte) m |= INPUT.JUMP; }
    if (zug.doppelNach != null) {
      const d = s - zug.doppelNach;
      if (d >= 0 && d < (zug.doppelHalte ?? 30)) m |= INPUT.JUMP;
      // Direkt vor dem zweiten Druck die Taste einen Tick loslassen, sonst zählt er nicht als neuer Druck
      if (d === -1) m &= ~INPUT.JUMP;
    }
    // Dritter Druck (nach einem Ring, der den Luftsprung zurückgibt)
    if (zug.doppelNach2 != null) {
      const d2 = s - zug.doppelNach2;
      if (d2 >= 0 && d2 < 30) m |= INPUT.JUMP;
      if (d2 === -1) m &= ~INPUT.JUMP;
    }
    return m;
  };
}

/** Flappy-Seil: Greiftaste je nach Lage zum nächsten Anker (siehe Kopf der Datei) */
function flappyGriff(welt, zug, p, t, z) {
  const g = zug.greif[z.k];
  const a = z.anker[z.k];
  if (!g || !a) return 0;
  const c = p.x + PLAYER_W / 2;
  if (!z.haengt) {
    if (z.greifT === undefined && (a.x - c) * zug.dir <= g.vor) z.greifT = t + g.r1;
    // (nicht während der Abklingzeit des Seils: Ein Druck darin zählt nicht)
    if (z.greifT !== undefined && t >= z.greifT && (z.losZeit === undefined || t - z.losZeit >= 16)) z.haengt = true;
  }
  if (!z.haengt) return 0;
  if (z.losT === undefined && (c - a.x) * zug.dir >= g.los) z.losT = t + g.r2;
  if (z.losT !== undefined && t >= z.losT) {
    z.haengt = false;
    z.losZeit = t;
    z.k++;
    z.greifT = undefined;
    z.losT = undefined;
    return 0;
  }
  return INPUT.GRAPPLE;
}

/** Wandklettern: anlaufen, zur fernen Wand springen, dann bei jedem Kontakt nach `reaktion` Ticks abspringen */
function wandEingabe(zug, absX, p, t, z, richtung) {
  if (z.ab === undefined) {
    const vorne = zug.dir > 0 ? p.x + PLAYER_W : p.x;
    const linie = absX + zug.dir * (zug.kanteVersatz || 0);
    if (zug.dir > 0 ? vorne < linie : vorne > linie) return richtung;
    z.ab = t;
    z.ziel = zug.dir;                                         // die Wand, zu der man gerade hält
    z.druckBis = t + zug.halte;
  }
  let m = z.ziel > 0 ? INPUT.RIGHT : INPUT.LEFT;
  if (t < z.druckBis) return m | INPUT.JUMP;
  if (!p.onGround && p.wallDir === z.ziel) {
    if (z.kontakt === undefined) z.kontakt = t;
    if (t - z.kontakt >= zug.reaktion) {
      z.ziel = -z.ziel;
      z.kontakt = undefined;
      z.druckBis = t + zug.wandHalte;
      m = (z.ziel > 0 ? INPUT.RIGHT : INPUT.LEFT) | INPUT.JUMP;
    }
  } else z.kontakt = undefined;
  return m;
}

/**
 * Mitfahrt: an die Kante gehen und dort warten, bis die bewegte Plattform am nahen Ende ist (+`reaktion`), aus dem Stand
 * aufspringen (`halte`) — wer erst dann losliefe, käme zu spät (gemessen: 46 Ticks Anlauf, die Plattform war weg) —,
 * mitfahren, bis sie am fernen Ende ist (+`reaktion2`), abspringen (`halte2`) und auf dem Ziel zum Stehen kommen.
 * Die Plattform findet der Zug über ihre gemerkte Lage relativ zur Standkachel (`moverRel`) — wie der Tor-Zug seinen Laser.
 */
function mitfahrtEingabe(welt, zug, absX, p, t, z, richtung) {
  if (z.mf === undefined) {
    z.mf = 'vor';
    const sx = Math.floor((p.x + PLAYER_W / 2) / TILE);
    const sy = Math.floor((p.y + PLAYER_H - 1) / TILE);
    const ab = (el) => Math.abs(el.tx - sx - zug.moverRel.dx) + Math.abs(el.ty - sy - zug.moverRel.dy);
    z.m = zug.moverRel ? welt.elements.filter((el) => el.type === 'mover' && ab(el) <= 2).sort((a, b) => ab(a) - ab(b))[0] : null;
  }
  const m = z.m;
  if (!m) { z.fertig = true; return 0; }
  const bei = (pt) => Math.abs(m.x - pt[0]) <= 2 && Math.abs(m.y - pt[1]) <= 2;
  const anfang = [m.tx * TILE, m.ty * TILE];
  const ende = [m.tx * TILE + zug.moverWeg[0] * TILE, m.ty * TILE + zug.moverWeg[1] * TILE];
  if (z.mf === 'vor') {
    // bis 12 px vor die Absprunglinie gehen, dann loslassen und ausrollen lassen
    const vorne = zug.dir > 0 ? p.x + PLAYER_W : p.x;
    const halt = absX - zug.dir * 12;
    if (zug.dir > 0 ? vorne < halt : vorne > halt) return richtung;
    z.mf = 'warten';
  }
  if (z.mf === 'warten') {
    if (z.los === undefined && bei(anfang)) z.los = t + zug.reaktion;
    if (z.los === undefined || t < z.los) return 0;
    z.mf = 'auf';
  }
  if (z.mf === 'auf') {
    if (z.ab === undefined) z.ab = t;
    if (p.onGround && p.supOwner === m.i && t - z.ab > 3) z.mf = 'fahren';
    else return (t - z.ab < zug.halte ? INPUT.JUMP : 0) | richtung;
  }
  if (z.mf === 'fahren') {
    if (z.ab2 === undefined && bei(ende)) z.ab2 = t + zug.reaktion2;
    if (z.ab2 === undefined || t < z.ab2) return 0;
    z.mf = 'ab';
    z.abTick = t;
  }
  // Absprung und Landung auf dem Ziel (nicht auf der Plattform)
  if (!p.onGround) z.luft2 = true;
  if (z.luft2 && p.onGround && p.supOwner !== m.i) {
    z.stand2 = (z.stand2 || 0) + 1;
    if ((z.stand2 > 2 && Math.abs(p.vx) < 1) || z.stand2 > 60) z.fertig = true;
    return 0;
  }
  return (t - z.abTick < zug.halte2 ? INPUT.JUMP : 0) | richtung;
}

/**
 * Brückenblock (Rückmeldung 26.09.2026: fallende Blöcke, die man AUSLÖSEN muss, damit sie den Weg frei machen — „weil sie
 * zu lang sind“; unter ihnen nur durchzulaufen ist keine Herausforderung). Den Block findet der Zug über seine gemerkte
 * Lage relativ zur Standkachel (`blockRel`), wie die Mitfahrt ihre Plattform.
 */
/**
 * Auslöse-Züge (Brückenblock, Deckel), Phasen 1–3: an den Block, bis er wackelt — aus seiner Spalte zurück — warten, bis er
 * liegt (+`reaktion`). Den Block findet der Zug über seine gemerkte Lage relativ zur Standkachel (`blockRel`), wie die
 * Mitfahrt ihre Plattform. Liefert die Eingabe, solange eine dieser Phasen läuft; danach undefined (z.mf === 'los').
 */
function ausloesen(welt, zug, p, t, z, richtung) {
  if (z.mf === undefined) {
    z.mf = 'vor';
    const sx = Math.floor((p.x + PLAYER_W / 2) / TILE);
    const sy = Math.floor((p.y + PLAYER_H - 1) / TILE);
    const ab = (el) => Math.abs(el.tx - sx - zug.blockRel.dx) + Math.abs(el.ty - sy - zug.blockRel.dy);
    z.b = zug.blockRel ? welt.elements.filter((el) => el.type === 'fallingBlock' && ab(el) <= 2).sort((a, b) => ab(a) - ab(b))[0] : null;
  }
  const b = z.b;
  if (!b) { z.fertig = true; return 0; }
  const gegen = zug.dir > 0 ? INPUT.LEFT : INPUT.RIGHT;
  // 1. an den Block, bis er wackelt
  if (z.mf === 'vor') {
    if (b.st === 0) return richtung;
    z.mf = 'zurueck';
  }
  // 2. aus seiner Spalte zurück (4 px Abstand) — wer beim Sturz darunter ist, wird erschlagen
  if (z.mf === 'zurueck') {
    // (…und nicht mehr auf ihn zu unterwegs: Beim Auslösen knapp davor rutschte man sonst mit vollem Tempo hinein)
    const draussen = zug.dir > 0 ? p.x + PLAYER_W <= b.x - 4 : p.x >= b.x + b.bw + 4;
    if (!draussen || p.vx * zug.dir > 0) return gegen;
    z.mf = 'warten';
  }
  // 3. warten, bis er liegt
  if (z.mf === 'warten') {
    if (b.st !== 3) return 0;
    if (z.los === undefined) { z.los = t + zug.reaktion; z.liegtSeit = t; }
    if (t < z.los) return 0;
    z.mf = 'los';
  }
  return undefined;
}

/**
 * Brückenblock (Rückmeldung 26.09.2026: fallende Blöcke, die man AUSLÖSEN muss, damit sie den Weg frei machen — „weil sie
 * zu lang sind“; unter ihnen nur durchzulaufen ist keine Herausforderung). Nach dem Auslösen: hinaufspringen,
 * hinüberlaufen, dahinter anhalten.
 */
function brueckeEingabe(welt, zug, p, t, z, richtung) {
  const vorher = ausloesen(welt, zug, p, t, z, richtung);
  if (vorher !== undefined) return vorher;
  const b = z.b;
  if (z.mf === 'los') {
    const vorne = zug.dir > 0 ? p.x + PLAYER_W : p.x;
    const nah = zug.dir > 0 ? b.x : b.x + b.bw;
    if (z.sprung === undefined && (zug.dir > 0 ? vorne >= nah - zug.sprungAbstand : vorne <= nah + zug.sprungAbstand)) z.sprung = t;
    // Vor der Platte wieder gelandet (zu kurz gesprungen, an ihrer Seite abgeprallt): noch einmal, wie ein Mensch
    if (z.sprung !== undefined && t - z.sprung > zug.halte + 6 && p.onGround && p.supOwner !== b.i && !(zug.dir > 0 ? p.x >= b.x + b.bw : p.x + PLAYER_W <= b.x)) z.sprung = t;
    const hinter = zug.dir > 0 ? p.x >= b.x + b.bw + 2 : p.x + PLAYER_W <= b.x - 2;
    if (!(hinter && p.onGround)) return richtung | (z.sprung !== undefined && t - z.sprung < zug.halte ? INPUT.JUMP : 0);
    z.mf = 'aus';
    z.druebenT = t;
  }
  return anhalten(p, t, z);
}

/**
 * Deckel: Die Platte verschließt ein Loch in einer Decke, über der es weitergeht. Nach dem Auslösen liegt sie unter dem
 * Loch am Boden — hinaufhüpfen, auf ihrer Mitte anhalten, senkrecht durch das Loch (Doppelsprung nach `doppelNach`),
 * erst über der Decke zur Seite lenken und neben dem Loch landen. Wer zu lange braucht, dem fährt der Deckel zurück.
 */
function deckelEingabe(welt, zug, p, t, z, richtung) {
  const vorher = ausloesen(welt, zug, p, t, z, richtung);
  if (vorher !== undefined) return vorher;
  const b = z.b;
  const mitte = b.x + b.bw / 2;
  const pm = p.x + PLAYER_W / 2;
  if (z.mf === 'los') {
    // hinauf auf den liegenden Block (1 hoch): im Anlauf hüpfen
    if (!(p.onGround && p.supOwner === b.i)) {
      const vorne = zug.dir > 0 ? p.x + PLAYER_W : p.x;
      const nah = zug.dir > 0 ? b.x : b.x + b.bw;
      if (z.hopf === undefined && (zug.dir > 0 ? vorne >= nah - 6 : vorne <= nah + 6)) z.hopf = t;
      if (z.hopf !== undefined && t - z.hopf > 20 && p.onGround) z.hopf = t;          // abgeprallt: noch einmal
      // Über der Kante des Blocks die Richtung loslassen — mit vollem Druck trug der Hüpfer über den ganzen Block hinweg
      const drueber = zug.dir > 0 ? p.x + PLAYER_W >= b.x + 2 : p.x <= b.x + b.bw - 2;
      return (drueber ? 0 : richtung) | (z.hopf !== undefined && t - z.hopf < 10 ? INPUT.JUMP : 0);
    }
    z.mf = 'mitte';
  }
  if (z.mf === 'mitte') {
    // bis kurz vor die Mitte laufen, dann ausrollen lassen; steht man, geht es senkrecht hinauf
    const vor = (mitte - pm) * zug.dir;
    if (vor > 6 + Math.abs(p.vx) * Math.abs(p.vx) / 3800) return richtung;
    if (Math.abs(p.vx) > 20) return 0;
    z.mf = 'rauf';
    z.ab = t;
  }
  if (z.mf === 'rauf') {
    const s = t - z.ab;
    let m = s < zug.halte ? INPUT.JUMP : 0;
    const d = s - zug.doppelNach;
    if (d >= 0 && d < 30) m |= INPUT.JUMP;
    if (d === -1) m &= ~INPUT.JUMP;
    // erst über der Decke (Unterkante über der Oberkante des Lochs) zur Seite
    if (p.y + PLAYER_H <= b.y0 - 1) { z.oben = true; if (z.obenT === undefined) z.obenT = t; }
    if (z.oben) m |= richtung;
    if (z.oben && p.onGround) { z.mf = 'aus'; z.druebenT = t; return 0; }
    if (s > 240) { z.fertig = true; return 0; }
    return m;
  }
  return anhalten(p, t, z);
}

/**
 * Kopfüber-Passage (Schwerkraft-Zone): an der Kante hochspringen (`halte`) — in der Zone kippt die Schwerkraft, man
 * „landet“ an der Decke. Kopfüber weiterlaufen und über jede Lücke der Decke springen (`luecken`: Kanten in Ausschnitt-
 * Pixeln relativ zur Absprunglinie, `halteK` gehalten; ein Sprung kopfüber geht nach unten). Am Ende der Zone kippt die
 * Schwerkraft zurück, man fällt auf die Zielplattform und bleibt stehen.
 */
function kopfueberEingabe(zug, absX, p, t, z, richtung) {
  const vorne = zug.dir > 0 ? p.x + PLAYER_W : p.x;
  if (z.ab === undefined) {
    const linie = absX + zug.dir * (zug.kanteVersatz || 0);
    if (zug.dir > 0 ? vorne < linie : vorne > linie) return richtung;
    z.ab = t;
    z.mf = 'hoch';
  }
  if (z.mf === 'hoch') {
    if (p.gd < 0 && p.onGround) { z.mf = 'decke'; z.k = 0; }
    else return richtung | (t - z.ab < zug.halte ? INPUT.JUMP : 0);
  }
  if (z.mf === 'decke') {
    // Lücke k: springen, sobald die Vorderkante ihre Absprunglinie erreicht (Kante minus kanteK Pixel)
    const lk = zug.luecken[z.k];
    if (lk !== undefined) {
      const linie = absX + zug.dir * lk.kante;
      if (z.sprungK === undefined && p.onGround && p.gd < 0 && (zug.dir > 0 ? vorne >= linie : vorne <= linie)) z.sprungK = t;
      if (z.sprungK !== undefined) {
        if (t - z.sprungK > 4 && p.onGround && p.gd < 0) { z.k++; z.sprungK = undefined; }
        else return richtung | (t - z.sprungK < lk.halte ? INPUT.JUMP : 0);
      }
    }
    if (p.gd > 0) z.mf = 'fall';
    return richtung;
  }
  if (z.mf === 'fall') {
    if (!p.onGround) return zug.loslassenFall ? 0 : richtung;
    z.mf = 'aus';
    z.druebenT = t;
  }
  return anhalten(p, t, z);
}

/** Letzte Phase der Auslöse-Züge: loslassen, stehen bleiben */
function anhalten(p, t, z) {
  if (p.onGround && Math.abs(p.vx) < 1) {
    z.stand2 = (z.stand2 || 0) + 1;
    if (z.stand2 > 2) z.fertig = true;
  }
  if (t - z.druebenT > 90) z.fertig = true;
  return 0;
}

/** Ende eines Zugs: nach dem Absprung wieder gelandet (und einen Moment gestanden) */
export function zugFertig(welt, t, z) {
  if (z.mf !== undefined) return !!z.fertig || t > 2400;
  if (z.ab === undefined) return !z.boeWartet && t > 400 + (z.torT ?? z.boeT ?? 0);
  if (z.letztX !== undefined) return welt.player.onGround && t - z.ab > 30;   // Portal: nach Austritt und Nachlauf stehen
  if (!welt.player.onGround) { z.luft = true; return false; }
  // …bis man steht (oder nach einer halben Sekunde)
  if (z.luft) { z.stand = (z.stand || 0) + 1; return (z.stand > 2 && Math.abs(welt.player.vx) < 1) || z.stand > 60; }
  return t - z.ab > 30;
}

/**
 * Varianten eines Zugs für die Menschen-Prüfung: je Stellgröße ±TOLERANZ Ticks (die Kante in Pixeln: so weit, wie man
 * in TOLERANZ Ticks läuft). Die Mitte ist der Zug selbst.
 */
export function varianten(zug, laufTempo) {
  // Ein Zug darf eine eigene, engere Toleranz tragen (Einzelblock ab Stufe 3: bewusst schwer)
  const tol = zug.toleranz ?? TOLERANZ;
  const px = Math.round((laufTempo * tol) / 120);
  const out = [zug];
  const mit = (aend) => out.push({ ...zug, ...aend });
  if (zug.art === 'sprung' || zug.art === 'doppel') {
    mit({ kanteVersatz: (zug.kanteVersatz || 0) - px });
    mit({ kanteVersatz: (zug.kanteVersatz || 0) + px });
    mit({ halte: Math.max(4, zug.halte - tol) });
    mit({ halte: zug.halte + tol });
  }
  if (zug.doppelNach != null) {
    mit({ doppelNach: Math.max(6, zug.doppelNach - tol) });
    mit({ doppelNach: zug.doppelNach + tol });
  }
  if (zug.doppelNach2 != null) {
    mit({ doppelNach2: Math.max(zug.doppelNach + 8, zug.doppelNach2 - tol) });
    mit({ doppelNach2: zug.doppelNach2 + tol });
  }
  if (zug.dashNach != null && !zug.dashSprung) {
    mit({ dashNach: Math.max(2, zug.dashNach - tol) });
    mit({ dashNach: zug.dashNach + tol });
  }
  // Dash-Sprung: der Abstand zwischen Dash und Sprung (das Tech-Fenster ist die Aufgabe)
  if (zug.dashSprung) {
    mit({ sprungNach: Math.max(1, zug.sprungNach - tol) });
    mit({ sprungNach: zug.sprungNach + tol });
  }
  if (zug.greifNach != null) {
    mit({ greifNach: Math.max(2, zug.greifNach - tol) });
    mit({ greifNach: zug.greifNach + tol });
    mit({ greifHalte: Math.max(6, zug.greifHalte - tol) });
    mit({ greifHalte: zug.greifHalte + tol });
  }
  if (zug.kette) {
    zug.kReaktion.forEach((r, k) => {
      const mitK = (wert) => mit({ kReaktion: zug.kReaktion.map((r2, k2) => (k2 === k ? wert : r2)) });
      mitK(Math.max(0, r - tol));
      mitK(r + tol);
    });
  }
  if (zug.flappy && zug.greif) {
    zug.greif.forEach((g, k) => {
      const mitGriff = (aend) => mit({ greif: zug.greif.map((g2, k2) => (k2 === k ? { ...g2, ...aend } : g2)) });
      mitGriff({ r1: Math.max(0, g.r1 - tol) });
      mitGriff({ r1: g.r1 + tol });
      mitGriff({ r2: Math.max(0, g.r2 - tol) });
      mitGriff({ r2: g.r2 + tol });
    });
  }
  if (zug.art === 'mitfahrt') {
    mit({ reaktion: Math.max(1, zug.reaktion - tol) });
    mit({ reaktion: zug.reaktion + tol });
    mit({ reaktion2: Math.max(1, zug.reaktion2 - tol) });
    mit({ reaktion2: zug.reaktion2 + tol });
    mit({ halte: Math.max(4, zug.halte - tol) });
    mit({ halte: zug.halte + tol });
    mit({ halte2: Math.max(4, zug.halte2 - tol) });
    mit({ halte2: zug.halte2 + tol });
  }
  if (zug.art === 'kopfueber') {
    mit({ kanteVersatz: (zug.kanteVersatz || 0) - px });
    mit({ kanteVersatz: (zug.kanteVersatz || 0) + px });
    mit({ halte: Math.max(4, zug.halte - tol) });
    mit({ halte: zug.halte + tol });
    zug.luecken.forEach((l, k) => {
      const mitL = (aend) => mit({ luecken: zug.luecken.map((l2, k2) => (k2 === k ? { ...l2, ...aend } : l2)) });
      mitL({ kante: l.kante - px });
      mitL({ kante: l.kante + px });
      mitL({ halte: Math.max(3, l.halte - tol) });
      mitL({ halte: l.halte + tol });
    });
  }
  if (zug.art === 'deckel') {
    mit({ reaktion: Math.max(1, zug.reaktion - tol) });
    mit({ reaktion: zug.reaktion + tol });
    mit({ halte: Math.max(4, zug.halte - tol) });
    mit({ halte: zug.halte + tol });
  }
  if (zug.art === 'bruecke') {
    mit({ reaktion: Math.max(1, zug.reaktion - tol) });
    mit({ reaktion: zug.reaktion + tol });
    mit({ halte: Math.max(4, zug.halte - tol) });
    mit({ halte: zug.halte + tol });
    mit({ sprungAbstand: Math.max(0, zug.sprungAbstand - px) });
    mit({ sprungAbstand: zug.sprungAbstand + px });
  }
  if (zug.art === 'wand') {
    mit({ kanteVersatz: (zug.kanteVersatz || 0) - px });
    mit({ kanteVersatz: (zug.kanteVersatz || 0) + px });
    mit({ halte: Math.max(4, zug.halte - tol) });
    mit({ halte: zug.halte + tol });
    mit({ reaktion: Math.max(1, zug.reaktion - tol) });
    mit({ reaktion: zug.reaktion + tol });
    mit({ wandHalte: Math.max(4, zug.wandHalte - tol) });
    mit({ wandHalte: zug.wandHalte + tol });
  }
  if (zug.boee) {
    mit({ boeeReaktion: Math.max(0, zug.boeeReaktion - tol) });
    mit({ boeeReaktion: zug.boeeReaktion + tol });
  }
  if (zug.tor) {
    mit({ torReaktion: Math.max(1, zug.torReaktion - tol) });
    mit({ torReaktion: zug.torReaktion + tol });
  }
  if (zug.loslassen != null) {
    mit({ loslassen: Math.max(1, zug.loslassen - tol) });
    mit({ loslassen: zug.loslassen + tol });
  }
  return out;
}

/**
 * Vor dem Zug `vorlauf` Ticks ohne Eingabe stehen — so lange, wie Landen und Abbremsen auf einer Bröckelplattform dauert:
 * Der Block bröckelt dann schon, und der Zug muss in der verbleibenden Zeit abheben. Nur für die Prüfung; im Spiel (und im
 * Kettenlauf) ist diese Zeit Teil der Landung davor.
 */
export function mitVorlauf(eingabe, fertig, vorlauf) {
  if (!vorlauf) return [eingabe, fertig];
  return [(w, t, z) => (t < vorlauf ? 0 : eingabe(w, t - vorlauf, z)), (w, t, z) => t >= vorlauf && fertig(w, t - vorlauf, z)];
}
