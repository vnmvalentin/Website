// spieleabend/spiele/maedn.js — Mensch ärgere dich nicht für 2 bis 4 Plätze, ohne Netz. Schnittstelle wie vierGewinnt.js,
// dazu: zug(z, platz, aktion, { random }) würfelt mit dem Zufall des Zimmers, animMs(z) sagt, wie lange der Browser
// für das zuletzt Geschehene braucht (Würfel rollt, Figur hüpft, Geschlagene fliegt heim) — so lange wartet ein Bot.
//
// Regeln (klassisch): 40 Felder Runde, je Farbe 4 Figuren, Startfeld bei 0/10/20/30, 4 Zielfelder.
//   – Mit einer 6 kommt eine Figur aufs Startfeld; wer eine 6 hat und noch Figuren im Haus, muss herauskommen.
//   – Steht eine eigene Figur auf dem Startfeld und sind noch Figuren im Haus, muss sie weiterziehen (wenn sie kann).
//   – Nach einer 6 wird nochmal gewürfelt. Wer keine Figur ziehen kann (alle im Haus oder im Ziel aufgerückt), hat
//     drei Versuche für eine 6.
//   – Landet man auf einer fremden Figur, muss sie zurück ins Haus. Eigene Figuren blockieren; im Ziel wird nicht
//     übersprungen, und ins Ziel geht es nur mit passender Zahl.
//   – Wer zuerst alle vier im Ziel hat, gewinnt. Kein Schlagzwang.
//
// Figur-Stand je Figur: -1 = Haus, 0–39 = Schritte auf der Runde ab dem eigenen Startfeld, 40–43 = Zielfeld 0–3.

const SPUR = 40;
const ZIELE = 4;
const LETZTES = SPUR + ZIELE - 1;
const STUFEN = ["leicht", "mittel", "schwer"];
// Anzeigedauer im Browser (ms) — muss zu scene/maedn3d.js passen
const WURF_MS = 950;
const HOP_MS = 170;
const FLUG_MS = 650;

const feld = (platz, schritte) => (platz * 10 + schritte) % SPUR;

function ersterAktiver(aktiv, ab) {
  for (let i = 0; i < 4; i += 1) {
    const p = (ab + i) % 4;
    if (aktiv[p]) return p;
  }
  return 0;
}

/** Wer steht auf welchem Rundenfeld? Map feld -> { platz, figur } */
function spurBelegung(z) {
  const m = new Map();
  z.figuren.forEach((figs, p) => {
    if (!z.aktiv[p]) return;
    figs.forEach((s, f) => {
      if (s >= 0 && s < SPUR) m.set(feld(p, s), { platz: p, figur: f });
    });
  });
  return m;
}

/** Ziel einer Figur bei diesem Wurf, ohne Pflichtregeln → { figur, nach, schlaegt } | null */
function zugFuer(z, p, f, wurf, belegung = spurBelegung(z)) {
  const s = z.figuren[p][f];
  if (s === -1) {
    if (wurf !== 6) return null;
    const da = belegung.get(feld(p, 0));
    if (da && da.platz === p) return null;
    return { figur: f, nach: 0, schlaegt: da || null };
  }
  const nach = s + wurf;
  if (nach > LETZTES) return null;
  if (nach >= SPUR) {
    // im Ziel nicht überspringen und nicht auf eine eigene Figur
    for (let g = Math.max(SPUR, s + 1); g <= nach; g += 1) if (z.figuren[p].includes(g)) return null;
    return { figur: f, nach, schlaegt: null };
  }
  const da = belegung.get(feld(p, nach));
  if (da && da.platz === p) return null;
  return { figur: f, nach, schlaegt: da || null };
}

/** Erlaubte Züge mit Pflichtregeln (Herauskommen, Startfeld räumen). */
function optionenFuer(z, p, wurf) {
  const belegung = spurBelegung(z);
  const alle = [];
  let hausDabei = false;
  for (let f = 0; f < 4; f += 1) {
    const o = zugFuer(z, p, f, wurf, belegung);
    if (!o) continue;
    // Figuren im Haus sind gleichwertig: nur eine davon anbieten
    if (z.figuren[p][f] === -1) {
      if (hausDabei) continue;
      hausDabei = true;
    }
    alle.push(o);
  }
  const imHaus = z.figuren[p].some((s) => s === -1);
  const aufStart = z.figuren[p].indexOf(0);
  if (wurf === 6 && imHaus && aufStart < 0) {
    const raus = alle.filter((o) => z.figuren[p][o.figur] === -1);
    if (raus.length) return raus;
  }
  if (imHaus && aufStart >= 0) {
    const weg = alle.filter((o) => o.figur === aufStart);
    if (weg.length) return weg;
  }
  return alle;
}

/** Drei Versuche, wenn keine Figur ohne 6 ziehen könnte. */
function versucheFuer(z, p) {
  const belegung = spurBelegung(z);
  for (let f = 0; f < 4; f += 1) {
    if (z.figuren[p][f] < 0) continue;
    for (let w = 1; w <= 5; w += 1) if (zugFuer(z, p, f, w, belegung)) return 1;
  }
  return 3;
}

function neu({ beginner = 0, aktiv = [true, true, true, true] } = {}) {
  const a = [0, 1, 2, 3].map((i) => aktiv[i] !== false);
  const z = {
    figuren: [0, 1, 2, 3].map(() => [-1, -1, -1, -1]),
    aktiv: a,
    amZug: ersterAktiver(a, beginner),
    phase: "wuerfeln", // wuerfeln | ziehen
    wurf: null,
    versuche: 3,
    nochmal: false,
    optionen: [],
    seq: 0,
    letzterWurf: null, // { wert, platz, seq }
    letzterZug: null, // { platz, figur, von, nach, geschlagen: { platz, figur, von } | null, seq }
    fertig: false,
    sieger: null,
    dauer: 0,
  };
  z.beginner = z.amZug;
  return z;
}

const amZug = (z) => (z.fertig ? null : z.amZug);

function naechster(z) {
  z.amZug = ersterAktiver(z.aktiv, (z.amZug + 1) % 4);
  z.phase = "wuerfeln";
  z.wurf = null;
  z.optionen = [];
  z.nochmal = false;
  z.versuche = versucheFuer(z, z.amZug);
}

function ziehen(z, p, o) {
  const von = z.figuren[p][o.figur];
  z.figuren[p][o.figur] = o.nach;
  let geschlagen = null;
  if (o.schlaegt) {
    geschlagen = { platz: o.schlaegt.platz, figur: o.schlaegt.figur, von: z.figuren[o.schlaegt.platz][o.schlaegt.figur] };
    z.figuren[o.schlaegt.platz][o.schlaegt.figur] = -1;
  }
  z.seq += 1;
  z.letzterZug = { platz: p, figur: o.figur, von, nach: o.nach, geschlagen, seq: z.seq };
  const hops = von === -1 ? 1 : o.nach - von;
  z.dauer += hops * HOP_MS + (geschlagen ? FLUG_MS : 0) + 150;
  if (z.figuren[p].every((s) => s >= SPUR)) {
    z.fertig = true;
    z.sieger = p;
    z.phase = null;
    z.optionen = [];
    return;
  }
  if (z.wurf === 6) {
    // nach einer 6 nochmal
    z.phase = "wuerfeln";
    z.optionen = [];
    z.nochmal = true;
    z.versuche = versucheFuer(z, p);
  } else naechster(z);
}

function zug(z, platz, aktion, { random = Math.random } = {}) {
  if (z.fertig) return { ok: false, error: "Die Partie ist vorbei." };
  if (platz !== z.amZug) return { ok: false, error: "Du bist nicht dran." };
  const art = aktion?.art;
  if (art === "wuerfeln") {
    if (z.phase !== "wuerfeln") return { ok: false, error: "Erst eine Figur ziehen." };
    const wert = 1 + Math.min(5, Math.floor(random() * 6));
    z.dauer = WURF_MS;
    z.seq += 1;
    z.letzterWurf = { wert, platz, seq: z.seq };
    z.wurf = wert;
    const opt = optionenFuer(z, platz, wert);
    if (opt.length === 1) {
      ziehen(z, platz, opt[0]); // nur ein Zug möglich: gleich ausführen
    } else if (opt.length > 1) {
      z.phase = "ziehen";
      z.optionen = opt;
    } else if (wert === 6) {
      z.nochmal = true; // 6 ohne Zug: trotzdem nochmal
    } else {
      z.versuche -= 1;
      if (z.versuche > 0) z.nochmal = true;
      else naechster(z);
    }
    return { ok: true };
  }
  if (art === "ziehen") {
    if (z.phase !== "ziehen") return { ok: false, error: "Erst würfeln." };
    const o = z.optionen.find((x) => x.figur === Number(aktion.figur));
    if (!o) return { ok: false, error: "Diese Figur kann nicht ziehen." };
    z.dauer = 0;
    ziehen(z, platz, o);
    return { ok: true };
  }
  return { ok: false, error: "Unbekannter Zug." };
}

const ende = (z) => (z.fertig ? { sieger: z.sieger } : null);
const animMs = (z) => z.dauer;

function sicht(z) {
  return {
    figuren: z.figuren.map((f) => f.slice()),
    aktiv: z.aktiv.slice(),
    amZug: amZug(z),
    phase: z.phase,
    wurf: z.wurf,
    versuche: z.versuche,
    nochmal: z.nochmal,
    optionen: z.optionen.map((o) => ({ figur: o.figur, nach: o.nach, schlaegt: !!o.schlaegt })),
    letzterWurf: z.letzterWurf,
    letzterZug: z.letzterZug,
    beginner: z.beginner,
    fertig: z.fertig,
    sieger: z.sieger,
  };
}

// ── Bot ────────────────────────────────────────────────────────────────────────────────────

/** Wie viele fremde Figuren könnten das Rundenfeld im nächsten Zug erreichen? */
function bedrohung(z, p, ziel) {
  let n = 0;
  z.figuren.forEach((figs, q) => {
    if (q === p || !z.aktiv[q]) return;
    for (const s of figs) {
      if (s >= 0 && s < SPUR) {
        const d = (ziel - feld(q, s) + SPUR) % SPUR;
        if (d >= 1 && d <= 6 && s + d < SPUR) n += 1;
      }
    }
    // Startfeld einer Farbe, die noch Figuren im Haus hat: eine 6 genügt
    if (figs.includes(-1) && feld(q, 0) === ziel) n += 1;
  });
  return n;
}

function bewerte(z, p, o, schwer) {
  const von = z.figuren[p][o.figur];
  let w = 0;
  if (o.schlaegt) w += 60 + Math.max(0, z.figuren[o.schlaegt.platz][o.schlaegt.figur]) * 0.6;
  if (von === -1) w += 45;
  if (o.nach >= SPUR) w += 38 + (o.nach - SPUR) * 2;
  w += (o.nach - Math.max(0, von)) * 0.3;
  if (schwer) {
    if (o.nach < SPUR) w -= bedrohung(z, p, feld(p, o.nach)) * 14;
    if (von >= 0 && von < SPUR) w += bedrohung(z, p, feld(p, von)) * 11; // aus der Gefahr ziehen
  }
  return w;
}

function botZug(z, platz, stufe = "mittel", random = Math.random) {
  if (z.phase === "wuerfeln") return { art: "wuerfeln" };
  const opt = z.optionen;
  if (!opt.length) return { art: "wuerfeln" };
  if (stufe === "leicht" && random() < 0.6) return { art: "ziehen", figur: opt[Math.floor(random() * opt.length)].figur };
  const schwer = stufe === "schwer";
  let best = null;
  let bestW = -Infinity;
  for (const o of opt) {
    const w = bewerte(z, platz, o, schwer) + random() * 0.5;
    if (w > bestW) {
      bestW = w;
      best = o;
    }
  }
  return { art: "ziehen", figur: best.figur };
}

module.exports = {
  id: "maedn",
  name: "Mensch ärgere dich nicht",
  plaetze: 4,
  minSpieler: 2,
  STUFEN,
  neu,
  amZug,
  zug,
  ende,
  sicht,
  botZug,
  animMs,
  _intern: { optionenFuer, versucheFuer, zugFuer, bedrohung, feld, WURF_MS, HOP_MS, FLUG_MS },
};
