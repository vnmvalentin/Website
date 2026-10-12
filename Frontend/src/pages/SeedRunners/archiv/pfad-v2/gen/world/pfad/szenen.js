// Szenenplan: Großform des Levels, dann eine Folge von Szenen mit eigenem Muster (wohin der Weg läuft), Stil (wie die
// Welt um ihn aussieht) und Mechanik.
//
// Großform (Rückmeldung 25.09.2026: „alles von links nach rechts … es gibt keine klare Trennung vom Aussehen"): Der Seed
// wählt, wie das Level als Ganzes geformt ist —
//   strom     von links nach rechts, auf und ab
//   turm      schmal und senkrecht nach oben, im Zickzack
//   absturz   von oben nach unten
//   halle     ein geschlossener Raum mit Eiswänden, der Weg läuft in Etagen hin und her nach oben
//   welle     weite Auf- und Abstiege im Wechsel
// Jede Form legt Kartengröße, Start, die erlaubten Muster (gewichtet) und die Ausweichrichtungen des Planers fest.
//
// Lange Level sind keine aneinandergehängten kurzen: Keine Kombination aus Muster und Mechanik kommt zweimal vor, und
// die Szenen sind unterschiedlich lang.

const MUSTER = {
  traverse: (n) => Array(n).fill('rechts'),
  aufstieg: (n) => Array(n).fill('hoch'),
  abstieg: (n) => Array(n).fill('runter'),
  rueckweg: (n) => Array(n).fill('links'),
  serpentine: (n) => ['rechts', 'rechts', 'hoch', 'links', 'links', 'hoch', 'rechts', 'rechts', 'hoch'].slice(0, n),
  zickzackRunter: (n) => ['runter', 'links', 'runter', 'rechts', 'runter', 'rechts', 'runter', 'links'].slice(0, n),
  kletterTraverse: (n) => ['hoch', 'rechts', 'hoch', 'rechts', 'runter', 'rechts', 'hoch', 'rechts'].slice(0, n),
  turmZickzack: (n) => ['hoch', 'links', 'hoch', 'rechts', 'hoch', 'links', 'hoch', 'rechts'].slice(0, n),
  sturzTraverse: (n) => ['runter', 'rechts', 'runter', 'rechts', 'rechts', 'runter', 'rechts', 'runter'].slice(0, n),
  // Drei Aufstiege zwischen zwei Etagen (~12 Zeilen, mehr als ein Doppelsprung): sonst erreicht man die obere Etage
  // direkt von der unteren — eine Abkürzung, und die Abkürzungsregel verwarf fast jede Plattform
  // …und die Aufstiege klettern im Zickzack auf der Stelle: Mit gewürfelter Richtung liefen sie in die eben gebaute Etage
  // Welle: auf und ab, aber vorwärts — mit frei gewürfelter Richtung driftete eine lange Welle an den linken Rand
  bergauf: (n) => Array.from({ length: n }, (_, i) => (i % 3 === 2 ? 'hoch' : 'hochrechts')),
  bergab: (n) => Array.from({ length: n }, (_, i) => (i % 3 === 2 ? 'runter' : 'runterrechts')),
  etageRechts: (n) => ['rechts', 'rechts', 'rechts', 'rechts', 'hochlinks', 'hochrechts', 'hochlinks'].slice(0, n),
  etageLinks: (n) => ['links', 'links', 'links', 'links', 'hochrechts', 'hochlinks', 'hochrechts'].slice(0, n),
};

export const FORMEN = {
  strom: {
    groesse: (z) => ({ w: Math.min(1150, 60 + z * 22), h: 150 }), start: () => ({ x: 8, y: 100 }), eroeffnung: 'traverse',
    muster: { traverse: 3, kletterTraverse: 2, serpentine: 1, zickzackRunter: 1, aufstieg: 1, abstieg: 1, sturzTraverse: 1, rueckweg: 1 },
    ausweich: ['rechts', 'runter', 'hoch'], stile: ['offen', 'offen', 'grotte'],
  },
  turm: {
    // Höchstens 34 Züge: mehr passen nicht in 150 Zeilen Höhe (gemessen: lange Türme endeten bei 36–45 von 56; seit es
    // Wandschächte mit 11–15 Zeilen gibt, blieben selbst 40 oft stecken — ein Schacht dauert aber ~3 s statt 1 s)
    // Breite nach Sprungweite (normal ~100, super ~130): Bei „super“ reicht ein Sprung fast 20 Kacheln, ein 100 breiter
    // Turm war dafür zu eng
    groesse: (z, reach) => ({ w: Math.round(40 + 4 * ((reach?.gap.double ?? 12) + 3)), h: 158 }), start: () => ({ x: 8, y: 150 }), eroeffnung: 'aufstieg', maxZuege: 34,
    // Nur Muster, die links und rechts ausgleichen — die Kletter-Traverse trieb den Weg gegen die rechte Wand
    muster: { turmZickzack: 3, aufstieg: 2, serpentine: 2 },
    ausweich: ['hoch', 'links', 'rechts'], stile: ['offen', 'grotte'],
  },
  absturz: {
    groesse: (z) => ({ w: Math.min(1150, 60 + z * 14), h: 158 }), start: () => ({ x: 8, y: 22 }), eroeffnung: 'sturzTraverse',
    // Kein Zickzack nach unten: Wer unter sich selbst zurückläuft, kann auf spätere Plattformen einfach hinabfallen
    muster: { abstieg: 2, sturzTraverse: 3, traverse: 1 },
    ausweich: ['runter', 'rechts', 'links'], stile: ['offen', 'grotte', 'grotte'],
  },
  halle: {
    // Breite nach Sprungweite: Vier Züge einer Etage reichen im Tempo „super“ fast 100 Kacheln weit
    groesse: (z, reach) => ({ w: Math.round(50 + 5 * ((reach?.gap.double ?? 16) + 6)), h: 158 }), start: () => ({ x: 8, y: 150 }), eroeffnung: 'etageRechts', maxZuege: 44,
    muster: { etageRechts: 1, etageLinks: 1 },
    ausweich: ['hoch', 'links', 'rechts'], stile: ['halle'], wechselnd: ['etageRechts', 'etageLinks'],
  },
  welle: {
    groesse: (z) => ({ w: Math.min(1150, 60 + z * 24), h: 158 }), start: () => ({ x: 8, y: 120 }), eroeffnung: 'bergauf',
    muster: { bergauf: 1, bergab: 1 },
    ausweich: ['rechts', 'hoch', 'runter'], stile: ['offen', 'grotte'], wechselnd: null,
  },
};
export const FORM_IDS = Object.freeze(Object.keys(FORMEN));

// Mechanik je Szene: eine oder zwei
const MECHANIKEN = ['feder', 'ring', 'greifen', 'portal', 'wand', 'tor', 'broeckel',
  'feder+ring', 'greifen+ring', 'portal+feder', 'greifen+feder', 'wand+tor', 'broeckel+ring', 'tor+feder', 'wand+broeckel',
  // Aufgaben (Rückmeldung 25.09.2026: „ein Key, der über eine extra Route zu holen ist, Single-Block-Jumps, die schwer sind“)
  'einzelblock', 'einzelblock+broeckel', 'schluessel',
  // Aufgaben mit Elementen, die vorher fehlten (Rückmeldung 26.09.2026: „fast nur Sprünge mit Stachelgruben“)
  'dash', 'wind', 'aufwind', 'schalter', 'dash+broeckel', 'schalter+wind', 'aufwind+ring',
  // Mitfahr-Plattformen (Rückmeldung 26.09.2026: „es kann auch Level nur mit Mitfahr-Plattformen geben“)
  'mitfahrt', 'mitfahrt+broeckel', 'mitfahrt+feder',
  // Nadelöhr und Fallblock (Rückmeldung 27.09.2026: „Flappy Bird mit den Grapplern“, so viele Aufgaben wie möglich)
  'nadeloehr', 'greifen+nadeloehr', 'ring+nadeloehr', 'wind+nadeloehr', 'aufwind+nadeloehr',
  // Brückenblock statt Durchlauf-Fallblock (Rückmeldung 26.09.2026: „nicht challenging, man muss nur durchlaufen“ — cooler,
  // wenn man ihn auslösen muss, damit er den Weg frei macht). Der alte Fallblock bleibt im Planer, kommt aber nicht mehr vor.
  // (Brückenblock nur noch in der Leitidee Brückenbauer — Rückmeldung 27.09.2026: „zu riesig und uninteressant“)
  // Böen im Takt: Rückenwind, der nur zeitweise weht — warten, dann in die Böe springen
  'boee', 'boee+broeckel',
  // Deckel: eine Platte verschließt ein Loch in der Decke — auslösen, ausweichen, hinauf
  'deckel', 'deckel+feder',
  // Flappy-Seil: mehrere Schwünge am Stück durch enge Lücken
  'flappy', 'flappy+ring',
  // Bewegung statt Warten (Rückmeldung 27.09.2026): Dash-Sprung im Tech-Fenster, flacher Sprung unter Stacheln
  'dashsprung', 'flach', 'dashsprung+broeckel', 'flach+einzelblock',
  // Schwerkraft-Zone: kopfüber an der Decke über Stachelstreifen (schwer: Einzelblock kopfüber)
  'kopfueber', 'kopfueber+broeckel',
  // Kristallkette: nach oben von Kristall zu Kristall dashen
  'kette', 'kette+nadeloehr'];

/** Gewicht einer Mechanik im Szenenplan (sonst 1) */
// (Warte-Aufgaben — Tor, Mitfahrt, Böe, Deckel — leiser: „mehr eigener Input statt warten“, Rückmeldung 27.09.2026)
/** Aufgaben mit vielen Sim-Proben je Versuch (eigene Probe über Sekunden, Anker-/Kristallketten, Streuungsläufe) */
export const TEUER = new Set(['flappy', 'greifen', 'bruecke', 'deckel', 'kopfueber', 'mitfahrt', 'dashsprung', 'kette']);
const GEWICHT = { schluessel: 3, einzelblock: 2, dash: 2, wind: 2, aufwind: 2, schalter: 2, mitfahrt: 1, broeckel: 0.5, ring: 0.35, nadeloehr: 2, 'greifen+nadeloehr': 2, boee: 1, deckel: 1, flappy: 2, tor: 0.6, dashsprung: 1, flach: 1.5, kopfueber: 2, kette: 2 };

/** Richtungsarten eines Musters (hoch / runter / quer) */
const richtungsArten = (muster) => new Set(MUSTER[muster](9).map((r) => (r.startsWith('hoch') ? 'hoch' : r.startsWith('runter') ? 'runter' : 'quer')));
/** Kann eine Mechanik in einem Muster mit diesen Richtungsarten überhaupt vorkommen? */
const passtZu = (teil, dirs) => ((teil !== 'aufwind' && teil !== 'deckel' && teil !== 'kette') || dirs.has('hoch')) && ((teil !== 'wind' && teil !== 'boee' && teil !== 'dash' && teil !== 'bruecke' && teil !== 'flappy' && teil !== 'greifen' && teil !== 'dashsprung' && teil !== 'flach' && teil !== 'kopfueber') || dirs.has('quer'))
  && ((teil !== 'wand' && teil !== 'mitfahrt' && teil !== 'nadeloehr') || dirs.has('hoch') || dirs.has('quer'));

/**
 * @param {object} rng
 * @param {number} zuegeGesamt
 * @param {string} formId
 * @param {object} [hand]  Handschrift (handschrift.js): Palette, Szenenlänge, schlichte Szenen, Grotten, Säulen
 * @param {object} [leit]  Akt-Plan der Leitidee (leitideen.js aktPlan, auf diese Etappe verschoben): Mechaniken, schlichte
 *                         Szenen und Schwierigkeit kommen dann aus dem Akt, nicht aus der Palette des Autors
 * @returns {{ szenen: {muster, stil, mechanik, zuege}[], richtungen: {r, szene, mechanik}[] }}
 */
export function planeSzenen(rng, zuegeGesamt, formId = 'strom', hand = null, leit = null) {
  const form = FORMEN[formId] || FORMEN.strom;
  const szenen = [];
  const richtungen = [];
  const benutzt = new Set();                                  // Muster|Mechanik — in einem Level nie zweimal
  // Dosierung (Rückmeldung 27.09.2026: „es wird immer komplett übertrieben mit einer Aufgabe … gefühlt 10 Sprünge davon
  // hintereinander“): In einer Szene trägt nur ein Teil der Züge ihre Aufgabe — höchstens 2 hintereinander (auch über die
  // Szenengrenze), höchstens 3 je Szene, sonst 65 %. Die Lücken dazwischen füllen zu 85 % ANDERE Aufgaben derselben
  // Palette bzw. desselben Akts (Rückmeldung 27.09.2026: „viele Aufgaben sollten nicht zu mehr Normalität führen, sondern
  // zum Gegenteil“ — gemessen: nur 28 % der Züge hatten überhaupt eine Aufgabe, die Lücken waren schlichte Sprünge).
  // (Gescheiterte Aufgaben auf dem nächsten Zug nachzuholen verdoppelte die Bauzeit — verworfen.)
  const MAX_FOLGE = 2;
  const MAX_JE_SZENE = 3;
  let aufgabenFolge = 0;
  // Breite Mischung (Rückmeldung 27.09.2026: „bei einem Level mit Schaltern will ich nicht 20 Schalter und fast keine
  // anderen Aufgaben, sondern von allem ein bisschen … es kann ruhig Level geben, wo es von einem sehr viel gibt“): Im
  // Normalfall stehen ALLE Aufgaben zur Wahl; Palette des Autors bzw. Akt der Leitidee geben nur eine Vorliebe (4-fach),
  // und jede Aufgabe wird mit jeder Verwendung im Level leiser. Nur ein Extrem-Level (`hand.extrem`, oder ohne Angabe)
  // bleibt bei Palette bzw. Akt allein.
  const extrem = !hand || hand.extrem !== false;
  const genutzt = new Map();
  let vorlieben = null;                                       // Teile, die Autor bzw. Akt bevorzugen (null = keine)
  const gewicht = (m) => {
    const basis = GEWICHT[m] ?? 1;
    if (extrem) return basis;
    const bevorzugt = vorlieben && m.split('+').every((teil) => vorlieben.includes(teil));
    // Teure Aufgaben (viele Sim-Proben je Versuch, oft gescheitert) leiser, wenn niemand sie bevorzugt — gemessen: mit allen
    // Aufgaben überall stieg die Bauzeit von ~4 auf ~15 s
    const teuer = !bevorzugt && m.split('+').some((teil) => TEUER.has(teil));
    return basis * (bevorzugt ? 4 : 1) * (teuer ? 0.35 : 1) / (1 + 0.5 * (genutzt.get(m) || 0));
  };
  // Je Aufgaben-Zug dazu ein Ersatz aus derselben Szene: Scheitert die Aufgabe dort (Platz, Höhenbudget …), versucht der
  // Planer den Ersatz, bevor er einen schlichten Sprung nimmt (gemessen: nur ~50 % der geplanten Aufgaben gelangen).
  const dosiere = (mechanik, n, alternativen) => {
    const out = [];
    let inSzene = 0;
    const ersatzFuer = (m, k) => {
      const kand = [mechanik, ...alternativen].filter((x) => x && x !== m && x !== out[k - 1]);
      return kand.length ? rng.weighted(kand, kand.map(gewicht)) : '';
    };
    for (let k = 0; k < n; k++) {
      const mit = mechanik && aufgabenFolge < MAX_FOLGE && inSzene < MAX_JE_SZENE && rng.range(0, 1) < 0.65;
      if (mit) { out.push(mechanik); aufgabenFolge++; inSzene++; continue; }
      aufgabenFolge = 0;
      const frei = alternativen.filter((m) => m !== out[k - 1]);
      if (mechanik && frei.length && rng.range(0, 1) < 0.85) out.push(rng.weighted(frei, frei.map(gewicht)));
      else out.push('');
    }
    return out.map((m, k) => ({ m, ersatz: m ? ersatzFuer(m, k) : '' }));
  };
  let letztes = null;
  let letzteMechanik = null;
  const namen = Object.keys(form.muster);
  zuegeGesamt = Math.min(zuegeGesamt, form.maxZuege ?? Infinity);
  while (richtungen.length < zuegeGesamt) {
    const erste = szenen.length === 0;
    // Wechselnde Etagen immer ganz: Eine Etage mit 3 Zügen nach rechts und die nächste mit 4 nach links trieb den Weg in
    // die linke Hallenwand (gemessen: die Hälfte der Hallen endete so vorzeitig)
    const [nMin, nMax] = hand ? hand.szenen : [3, 9];
    let n = Math.min(zuegeGesamt - richtungen.length, form.wechselnd ? 7 : erste ? 3 : rng.intRange(nMin, nMax));
    // Leitidee: Die Szene endet an der Aktgrenze (ein Akt soll als eigener Abschnitt spürbar sein); ein Rest unter 3 Zügen
    // läuft über die Grenze, statt eine Mini-Szene zu bilden
    const akt = leit ? leit.akt(richtungen.length) : null;
    if (akt && !erste && !form.wechselnd) n = Math.min(n, Math.max(3, leit.rest(richtungen.length)));
    const palette = akt ? [...new Set(akt.mechaniken.flatMap((m) => m.split('+')))] : hand && hand.palette;
    let muster;
    if (erste) muster = form.eroeffnung;
    else if (form.wechselnd) muster = form.wechselnd[szenen.length % form.wechselnd.length];
    else if (form === FORMEN.welle) muster = szenen.length % 2 === 0 ? 'bergauf' : 'bergab';
    else {
      let kandidaten = namen.filter((m) => m !== letztes);
      // Mit Palette: bevorzugt Muster, in denen eine ihrer Mechaniken geht (Mitfahrt bergab gibt es nicht — gemessen:
      // beim „Fährmann" waren zwei Drittel der Züge schlichte Sprünge)
      if (palette && palette.length) {
        const passend = kandidaten.filter((m) => palette.some((teil) => passtZu(teil, richtungsArten(m))));
        if (passend.length) kandidaten = passend;
      }
      muster = rng.weighted(kandidaten, kandidaten.map((m) => form.muster[m]));
    }
    if (muster === 'rueckweg' && richtungen.filter((x) => x.r === 'rechts').length < 6) muster = letztes === 'serpentine' ? 'traverse' : 'serpentine';
    // (Die Handschrift entscheidet, wie oft eine Decke über der Szene hängt; die Halle bleibt Halle)
    let stil = hand && !form.stile.includes('halle') ? (rng.range(0, 1) < hand.grotte ? 'grotte' : 'offen') : rng.pick(form.stile);
    let mechanik = '';
    let alternativen = [];
    if (!erste) {
      // Keine Tore in der Halle: Ihr Sender hinge frei unter der hohen Hallendecke
      // Kein Schlüssel-Abstecher in Turm und Halle: Seine Wand reicht vom oberen bis zum unteren Rand und schnitte die
      // senkrechte Form in zwei; er braucht mindestens 5 Züge
      // Nur Mechaniken, die zu den Richtungen der Szene passen: Aufwind braucht Aufstiege, Rückenwind und Dash-Tunnel
      // waagerechte Züge, ein Wandschacht nicht nur Abstiege (sonst scheiterte jeder Versuch, und die Szene bestand aus
      // schlichten Sprüngen)
      const dirs = richtungsArten(muster);
      const passt = (teil) => passtZu(teil, dirs);
      // Die Palette der Handschrift: nur ihre Mechaniken (ein Thema mit einer einzigen wiederholt sie Szene um Szene)
      const inPalette = (m) => !extrem || akt || !hand || !hand.palette || m.split('+').every((teil) => hand.palette.includes(teil));
      vorlieben = akt ? [...new Set(akt.mechaniken.flatMap((m) => m.split('+')))] : hand && hand.palette && hand.palette.length ? hand.palette : null;
      // (Mit Leitidee genau die Mechaniken des Akts — auch Kombinationen, die es im allgemeinen Topf nicht gibt)
      // (Keine Kopfüber-Passage im Turm: Sie braucht 20+ Kacheln Breite und schob den Weg an den Rand — gemessen: Abbruch)
      const geht = (topf) => topf.filter((m) => (form !== FORMEN.halle || !m.includes('tor')) && (form !== FORMEN.turm || !m.includes('kopfueber'))
        && (m !== 'schluessel' || (form !== FORMEN.turm && form !== FORMEN.halle && n >= 5))
        && m.split('+').some(passt) && inPalette(m));
      // (Mischung: alle Aufgaben, dazu die Kombinationen des Akts, die es im allgemeinen Topf nicht gibt)
      let moeglich = geht(extrem ? (akt ? akt.mechaniken : MECHANIKEN) : [...new Set([...MECHANIKEN, ...(akt ? akt.mechaniken : [])])]);
      // Passt keine Mechanik des Akts zur Szene (Rückenwind in der Welle, die nur bergauf/bergab kennt), eine der Akte
      // davor, notfalls des nächsten — sonst blieb die Szene schlicht (gemessen: ganze Einführungen ohne eine Böe)
      if (extrem && akt && !moeglich.length) {
        for (const k of [akt.index - 1, akt.index - 2, akt.index + 1]) {
          if (leit.akte[k]) moeglich = geht(leit.akte[k].mechaniken);
          if (moeglich.length) break;
        }
      }
      const frisch = moeglich.filter((m) => m !== letzteMechanik && !benutzt.has(`${muster}|${m}`));
      // Aufgaben gewichtet: Mit 25 Mechaniken im Topf kamen die neuen kaum noch vor (gemessen: 4 Schlüssel-Szenen in 32 Leveln)
      // (Mit kleiner Palette darf sich eine Mechanik wiederholen — sonst bliebe für ein Ein-Mechanik-Thema nichts übrig)
      const liste = frisch.length ? frisch : moeglich.filter((m) => m !== letzteMechanik || akt || (hand && hand.palette));
      // Schlichte Szenen nach Handschrift (der „Klassiker“ baut nur solche) bzw. nach dem Akt der Leitidee
      // (Mischung: höchstens ein Viertel schlichte Szenen — der „Klassiker“ baut nur im Extrem-Level nur Sprünge)
      const schlichtRoh = akt ? akt.schlicht : hand ? hand.schlicht : null;
      const schlichtAnteil = extrem || schlichtRoh == null ? schlichtRoh : Math.min(schlichtRoh, 0.25);
      if (liste.length && !(schlichtAnteil != null && rng.range(0, 1) < schlichtAnteil)) mechanik = rng.weighted(liste, liste.map(gewicht));
      // Andere Aufgaben, die in dieser Szene gehen — für die Lücken zwischen denen der Szene (Schlüssel-Abstecher nicht)
      alternativen = moeglich.filter((m) => m !== mechanik && m !== 'schluessel');
    }
    // Aussehen (fuellung.js): Säulen = Plattformen auf Fels, Stachelgruben dazwischen; sonst schwebend über dem Abgrund.
    // Ein Tor braucht beides — die Grotten-Decke hält den Sender, der Grubenboden den Fänger (sonst hingen beide als
    // Blöcke mit Stachel in der Luft; Rückmeldung 25.09.2026)
    if (mechanik.includes('tor')) stil = 'grotte';
    const saeulen = form !== FORMEN.halle && (mechanik.includes('tor') || rng.range(0, 1) < (hand ? hand.saeulen : 0.65));
    benutzt.add(`${muster}|${mechanik}`);
    letzteMechanik = mechanik;
    const idx = szenen.length;
    szenen.push({ muster, stil, mechanik, saeulen, zuege: n, akt: akt ? akt.index : null });
    const dVersatz = akt ? akt.dVersatz : 0;
    if (mechanik === 'schluessel') {
      // Schlüssel-Abstecher (planer.js): eine Plattform weiter (der Hub), hinauf zum Schlüssel, zurück zum Hub, durch die Tür
      // Der Schlüssel liegt vorn unten in einer Nische; zurück per Sprung auf den Hub, dann über die Nische durch die Tür.
      // (Gemessen: Nach oben fand der Abstecher kaum Platz — links der Anflugbogen, rechts die Tür —, nach hinten landete
      // er auf der vorigen Plattform.)
      const folge = [{ r: 'rechts' }, { r: 'runterrechts', abstecher: 'start', hauptDir: 1 }, { r: 'zurueck', abstecher: 'zurueck' }, { r: 'rechts', abstecher: 'tuer' }];
      while (folge.length < n) folge.push({ r: 'rechts' });
      for (const f of folge) richtungen.push({ mechanik: '', ...f, szene: idx, dVersatz });
      aufgabenFolge = 0;
    } else {
      const mechs = dosiere(mechanik, n, alternativen);
      for (const { m } of mechs) if (m) genutzt.set(m, (genutzt.get(m) || 0) + 1);
      MUSTER[muster](n).forEach((r, k) => richtungen.push({ r, szene: idx, mechanik: mechs[k].m, ersatz: mechs[k].ersatz, dVersatz }));
    }
    letztes = muster;
  }
  return { szenen, richtungen, form };
}
