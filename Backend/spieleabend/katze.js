// spieleabend/katze.js — die Zimmerkatze. Sie streift zwischen festen Plätzen umher, legt sich auf freie Spielstühle,
// sitzt auf der Fensterbank (nur bei geschlossenem Fenster), bettelt bei jemandem, der herumsteht, um
// Streicheleinheiten und schnurrt, wenn man sie streichelt.
//
// Der Server entscheidet nur, was sie gerade vorhat (Modus und Ziel), damit alle dieselbe Katze sehen. Wie sie dorthin
// läuft, rechnet jeder Browser selbst (Frontend/src/pages/Spieleabend/scene/katze.js; ORTE dort in derselben
// Reihenfolge). Zustand: { modus, ort?, stuhl?, person?, von?, nr, bis } — nr zählt jeden Wechsel hoch.
//
//   ort          sitzt/putzt sich an Platz `ort` (0 … ORTE-1)
//   stuhl        liegt eingerollt auf Spielstuhl `stuhl`, solange er frei bleibt
//   fensterbank  sitzt auf der Fensterbank und schaut hinaus (springt herunter, sobald jemand das Fenster öffnet)
//   betteln      läuft zu `person`, setzt sich vor sie und miaut, bis sie streichelt oder die Geduld weg ist
//   schnurren    wird gerade von `von` gestreichelt (auf einem Stuhl bleibt `stuhl` gesetzt)

const ORTE = 8;
const DAUER = {
  ort: [7000, 15000],
  fensterbank: [12000, 22000],
  stuhl: [25000, 45000],
  betteln: 16000,
  schnurren: 4500,
  weiterLiegen: 15000,
};
const STREICHEL_MS = 1200; // so schnell hintereinander lässt sie sich höchstens streicheln

const zwischen = (random, [a, b]) => a + Math.floor(random() * (b - a));
const eins = (random, liste) => liste[Math.floor(random() * liste.length)];

function neueKatze(t, random) {
  return { modus: "ort", ort: Math.floor(random() * ORTE), nr: 1, bis: t + 4000, streichelAb: 0 };
}

/**
 * Was gerade frei ist: Spielstühle ohne Menschen und Bots, Leute, die herumstehen (nicht am Tisch, nicht auf dem Sofa).
 * @param {object} room  Zimmer aus zimmer.js
 */
function lage(room) {
  const p = room.partie && room.partie.spiel === room.spiel ? room.partie : null;
  const freie = [];
  room.stuehle.forEach((s, i) => {
    if (s !== null) return;
    const b = p?.besetzung[i];
    // ein Bot der letzten Partie bleibt sitzen, bis sich jemand hinsetzt; in der Partie sitzen alle
    if (b && (b.bot || (room.phase === "spiel" && b.person !== null))) return;
    freie.push(i);
  });
  const amTisch = new Set(room.stuehle.filter((s) => s !== null));
  if (p && room.phase === "spiel") for (const b of p.besetzung) if (b.person !== null) amTisch.add(b.person);
  const aufSofa = new Set((room.sofa || []).filter((s) => s !== null));
  const stehende = room.leute.filter((x) => x.connected && !amTisch.has(x.id) && !aufSofa.has(x.id));
  return { freie, stehende };
}

function waehle(room, t, random, { freie, stehende }) {
  const alt = room.katze;
  const r = random();
  let neu;
  if (r < 0.28 && freie.length) neu = { modus: "stuhl", stuhl: eins(random, freie), bis: t + zwischen(random, DAUER.stuhl) };
  else if (r < 0.5 && stehende.length) neu = { modus: "betteln", person: eins(random, stehende).id, bis: t + DAUER.betteln };
  else if (r < 0.62 && !room.fenster && alt.modus !== "fensterbank") neu = { modus: "fensterbank", bis: t + zwischen(random, DAUER.fensterbank) };
  else {
    // ein anderer Platz als bisher
    const bisher = alt.modus === "ort" ? alt.ort : -1;
    let ort = Math.floor(random() * (ORTE - 1));
    if (ort >= bisher && bisher >= 0) ort += 1;
    neu = { modus: "ort", ort, bis: t + zwischen(random, DAUER.ort) };
  }
  room.katze = { ...neu, nr: alt.nr + 1, streichelAb: alt.streichelAb };
}

/** Regelmäßig aufrufen; true, wenn die Katze etwas Neues vorhat (dann allen schicken). */
function katzeTick(room, t, random) {
  if (!room.katze) room.katze = neueKatze(t, random);
  const k = room.katze;
  const l = lage(room);
  // vertrieben: Stuhl besetzt, Bettel-Opfer weg oder sitzt, Fenster geht auf
  const vertrieben =
    ((k.modus === "stuhl" || (k.modus === "schnurren" && k.stuhl !== undefined)) && !l.freie.includes(k.stuhl)) ||
    (k.modus === "betteln" && !l.stehende.some((x) => x.id === k.person)) ||
    (k.modus === "fensterbank" && room.fenster);
  if (vertrieben) {
    waehle(room, t, random, l);
    return true;
  }
  if (t < k.bis) return false;
  if (k.modus === "schnurren" && k.stuhl !== undefined) {
    // nach dem Streicheln auf dem Stuhl: noch ein Weilchen weiterdösen
    room.katze = { modus: "stuhl", stuhl: k.stuhl, bis: t + DAUER.weiterLiegen, nr: k.nr + 1, streichelAb: k.streichelAb };
    return true;
  }
  waehle(room, t, random, l);
  return true;
}

/** Jemand streichelt die Katze: sie schnurrt (auf dem Stuhl bleibt sie liegen). false bei zu schnellem Wiederholen. */
function streicheln(room, person, t, random) {
  if (!room.katze) room.katze = neueKatze(t, random);
  const k = room.katze;
  if (t < k.streichelAb) return false;
  const aufStuhl = k.modus === "stuhl" || (k.modus === "schnurren" && k.stuhl !== undefined);
  room.katze = { modus: "schnurren", von: person.id, bis: t + DAUER.schnurren, nr: k.nr + 1, streichelAb: t + STREICHEL_MS };
  if (aufStuhl) room.katze.stuhl = k.stuhl;
  else if (k.modus === "ort") room.katze.ort = k.ort;
  return true;
}

/** Was die Browser von der Katze erfahren (ohne interne Zeiten). */
function katzeSicht(k) {
  if (!k) return null;
  const out = { modus: k.modus, nr: k.nr };
  for (const f of ["ort", "stuhl", "person", "von"]) if (k[f] !== undefined) out[f] = k[f];
  return out;
}

module.exports = { katzeTick, streicheln, katzeSicht, neueKatze, ORTE, DAUER };
