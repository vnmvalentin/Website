// Lauflinie — Ausbau: das Gelände um die geflogene Bahn. Die Strecke (strecken.js) besteht zunächst nur aus dem, was der
// Läufer berührt; hier bekommt sie Boden, Decke und Stacheln — dicht an der Bahn, aber nie in ihr.
//
// Grundlage ist die SPUR: alle Kacheln, die irgendein Zitter-Satz berührt hat. Fels und Stacheln kommen nur auf Kacheln
// außerhalb der Spur samt ihren Nachbarn (eine Kachel Luft bleibt immer). So entsteht eine Röhre, die der Bahn folgt —
// „Stacheln direkt am Weg“ (Vorbild: das Level „Fast Höhle“ des Nutzers), ohne dass der geprüfte Weg enger wird.
//
// Danach spielt lauf.js alle Zitter-Sätze noch einmal; stirbt einer, nimmt `entschaerfe` die Stacheln an der Stelle weg.

const ROCK = '#';

/** Die Spur um eine Kachel in alle acht Richtungen erweitern */
export function erweitere(spur) {
  const out = new Set(spur);
  for (const k of spur) {
    const i = k.indexOf(',');
    const x = Number(k.slice(0, i));
    const y = Number(k.slice(i + 1));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.add(`${x + dx},${y + dy}`);
  }
  return out;
}

/** Höchste und tiefste Spur-Zeile je Spalte */
function spurProfil(spur) {
  const oben = new Map();
  const unten = new Map();
  for (const k of spur) {
    const i = k.indexOf(',');
    const x = Number(k.slice(0, i));
    const y = Number(k.slice(i + 1));
    if (!oben.has(x) || y < oben.get(x)) oben.set(x, y);
    if (!unten.has(x) || y > unten.get(x)) unten.set(x, y);
  }
  return { oben, unten };
}

/**
 * Eine Strecke ausbauen.
 * @param {object} B      Bau-Zustand
 * @param {object} st     Strecke (strecken.js)
 * @param {Set<string>} spur  berührte Kacheln aller Zitter-Sätze
 * @param {{ rng, stil: { saeulen: boolean, decke: boolean, dichte: number, luft: number }, gefahrenfrei?: {x,y,r}, budget?: number }} o
 *   gefahrenfrei  um diesen Punkt (Start) bleiben Stacheln im Abstand `r` weg
 *   budget        so viele Stacheln darf diese Strecke höchstens bekommen (Elemente-Grenze des Levels): Reicht es nicht,
 *                 wird gleichmäßig ausgedünnt — zuerst an Decke und Wänden, dann am Boden
 * @returns {{ stacheln: object[] }}  die gesetzten Stacheln (zum Entschärfen)
 */
export function baueAus(B, st, spur, o) {
  const { rng, stil } = o;
  const eng = erweitere(spur);
  const stacheln = [];
  const sicher = (x, y) => !eng.has(`${x},${y}`);
  // Knapp (ab Stufe 3): Bodenstacheln reichen bis an die Bahn heran — sie stehen auf jeder Kachel, die kein Zitter-Satz
  // berührt hat. Sonst bleibt auch die Nachbarkachel frei.
  // (nur in Ketten: In Kamin und Fallschacht streut die Bahn zu stark — dort bleibt der Abstand)
  const stachelSicher = (x, y) => (stil.knapp && st.art === 'kette' ? !spur.has(`${x},${y}`) : sicher(x, y));
  const fern = (x, y) => !o.gefahrenfrei || Math.max(Math.abs(x - o.gefahrenfrei.x), Math.abs(y - o.gefahrenfrei.y)) >= o.gefahrenfrei.r;
  const fels = (x, y) => { if (B.drin(x, y) && B.frei(x, y) && sicher(x, y)) { B.setze(x, y, ROCK); return true; } return false; };
  const belegt = new Set(B.entities.map((e) => `${e.tx},${e.ty}`));
  // Stacheln werden erst gesammelt und am Ende gesetzt (Budget): `muss` = Boden und Grube, `kann` = Decke und Wände
  const muss = [];
  const kann = [];
  const merke = (liste) => (x, y) => {
    if (!B.drin(x, y) || !B.frei(x, y) || !stachelSicher(x, y) || !fern(x, y) || belegt.has(`${x},${y}`)) return;
    liste.push({ x, y });
    belegt.add(`${x},${y}`);
  };
  const stachel = merke(muss);
  const zier = merke(kann);
  const istFels = (x, y) => B.drin(x, y) && B.grid[y][x] === ROCK;

  if (st.art === 'kette') {
    const flaechen = [st.ein, ...st.plattformen];
    // Bereich zwischen Eingangs- und Ausgangsplattform — die Rastplattformen selbst bleiben frei von Decke und Grube
    const xa = st.dir > 0 ? st.ein.x1 + 1 : st.aus.x1 + 1;
    const xb = st.dir > 0 ? st.aus.x0 - 1 : st.ein.x0 - 1;
    const tief = Math.min(B.H - 5, Math.max(...flaechen.map((f) => f.row)) + rng.intRange(4, 6));

    // Boden-Spielart: Lücken zwischen Flächen bis zur tieferen der beiden Kanten auffüllen — Stacheln obenauf, wo man drüberfliegt
    if (st.boden) {
      for (let i = 0; i + 1 < flaechen.length; i++) {
        const a = flaechen[i];
        const b = flaechen[i + 1];
        const g0 = Math.min(a.x1, b.x1) + 1;
        const g1 = Math.max(a.x0, b.x0) - 1;
        const zeile = Math.max(a.row, b.row);
        // Ein Stachelgraben, eine Kachel tief: Fels ab der Zeile UNTER der Lauffläche, die Stacheln stehen im Graben. Der
        // Bogen eines Sprungs streift die Kacheln auf Laufhöhe — dort Fels und Stacheln hinzusetzen ging nicht, und übrig
        // blieb eine harmlose Mulde, durch die man einfach lief (Kontrollbild 14.11.2026).
        for (let x = g0; x <= g1; x++) {
          for (let y = zeile + 1; y < tief; y++) fels(x, y);
          if (istFels(x, zeile + 1)) stachel(x, zeile);
        }
      }
    }
    // Säulen: Flächen stehen auf Fels bis zum Grubenboden (Bröckelplatten schweben)
    const letzteFlaeche = st.plattformen[st.plattformen.length - 1];
    for (const f of st.plattformen) {
      // (Bröckelplatten schweben; ebenso die Flächen einer Wandkehre — unter ihnen läuft der Weg weiter)
      if (f.broeckel || f.schwebt) continue;
      // (die Rastplattform am Ende bleibt eine Platte: Unter ihr kann die nächste Strecke hinab- oder zurückführen)
      if (f === letzteFlaeche) { for (let x = f.x0; x <= f.x1; x++) fels(x, f.row + 1); continue; }
      if (stil.saeulen || st.boden) {
        for (let x = f.x0; x <= f.x1; x++) for (let y = f.row + 1; y < tief; y++) fels(x, y);
      } else {
        for (let x = f.x0; x <= f.x1; x++) fels(x, f.row + 1);
      }
    }
    // Grubenboden mit Stacheln
    for (let x = xa; x <= xb; x++) {
      fels(x, tief);
      fels(x, tief + 1);
      if (istFels(x, tief)) stachel(x, tief - 1);
    }
    // Decke: folgt der Bahn mit `luft` Kacheln Abstand, Stacheln an der Unterseite
    if (stil.decke) {
      const { oben } = spurProfil(spur);
      let letzte = null;
      const hoehe = new Map();
      for (let x = xa; x <= xb; x++) {
        const o1 = oben.get(x);
        if (o1 !== undefined) letzte = o1;
        if (letzte !== null) hoehe.set(x, letzte);
      }
      for (let x = xa + 1; x <= xb - 1; x++) {
        const werte = [hoehe.get(x - 1), hoehe.get(x), hoehe.get(x + 1)].filter((v) => v !== undefined);
        if (!werte.length) continue;
        const c = Math.min(...werte) - 1 - stil.luft;
        if (c < 4) continue;
        let da = false;
        for (let y = c - 2; y <= c; y++) da = fels(x, y) || da;
        if (istFels(x, c) && rng.chance(stil.dichte)) zier(x, c + 1);
      }
    }
  } else if (st.schacht) {
    // Kamin und Sturz: Stacheln auf dem Schachtboden und an den Wänden — überall dort, wo die Bahn nicht hinkommt
    const s = st.schacht;
    for (let x = s.x0; x <= s.x1; x++) if (istFels(x, s.unten + 1) && rng.chance(stil.dichte)) stachel(x, s.unten);
    if (st.art === 'kamin') {
      for (let y = s.oben + 2; y <= s.unten - 3; y++) {
        if (istFels(s.x0 - 1, y) && rng.chance(stil.dichte * 0.6)) zier(s.x0, y);
        if (istFels(s.x1 + 1, y) && rng.chance(stil.dichte * 0.6)) zier(s.x1, y);
      }
    }
  }
  // Setzen — gleichmäßig ausgedünnt, wenn das Budget nicht reicht
  const budget = Math.max(0, o.budget ?? Infinity);
  const duenn = (liste, max) => (liste.length <= max ? liste : liste.filter((_, i) => Math.floor(((i + 1) * max) / liste.length) > Math.floor((i * max) / liste.length)));
  const fest = duenn(muss, budget);
  for (const s of [...fest, ...duenn(kann, budget - fest.length)]) stacheln.push(B.fuege({ type: 'spike', tx: s.x, ty: s.y }));
  return { stacheln };
}

/** Stacheln im Umkreis von `r` Kacheln um eine Stelle entfernen. @returns {number} wie viele */
export function entschaerfe(B, stacheln, tx, ty, r = 2) {
  let n = 0;
  for (let i = stacheln.length - 1; i >= 0; i--) {
    const e = stacheln[i];
    if (Math.abs(e.tx - tx) <= r && Math.abs(e.ty - ty) <= r) {
      B.entferne(e);
      stacheln.splice(i, 1);
      n++;
    }
  }
  return n;
}
