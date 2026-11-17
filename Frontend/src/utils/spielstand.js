// utils/spielstand.js — reine Helfer für Spielstände im Browser (ohne React, ohne Netz; läuft in node --test).
// Gehört zur Konto-Anbindung der Spiele (utils/spielKonto.js, Spur D):
//   - meldeAenderung(spiel) ruft ein Spiel nach jedem Speichern auf; die Konto-Anbindung hört mit beiAenderung() zu.
//     So bleiben die Speicher-Module der Spiele frei von React und Netz.
//   - Zusammenführen ohne Verlust: Zwei Geräte spielen unabhängig voneinander — beim Abgleich gewinnt je Zähler der
//     größere Wert, Listen werden vereinigt. Nichts Freigeschaltetes geht verloren (Zähler können zu niedrig sein, nie
//     zu hoch).

const hoerer = new Map(); // spiel → Set<fn>

/** Ein Spiel hat seinen Stand im Browser geändert. */
export function meldeAenderung(spiel) {
  for (const fn of hoerer.get(spiel) || []) {
    try {
      fn();
    } catch (e) {
      console.error(`[spielstand] ${spiel}:`, e);
    }
  }
}

/** @returns {() => void} abmelden */
export function beiAenderung(spiel, fn) {
  if (!hoerer.has(spiel)) hoerer.set(spiel, new Set());
  hoerer.get(spiel).add(fn);
  return () => hoerer.get(spiel)?.delete(fn);
}

export const ganz = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** JSON-Objekt aus dem Browser-Speicher oder null (fehlt, kaputt, gesperrt) */
export function liesJson(schluessel, speicher = globalThis.localStorage) {
  try {
    const v = JSON.parse(speicher.getItem(schluessel));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function schreibJson(schluessel, wert, speicher = globalThis.localStorage) {
  try {
    speicher.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    return false; // privates Fenster, voller Speicher: gilt nur für diese Sitzung
  }
}

/** Je Zähler der größere Wert (fehlende zählen als 0). */
export function maxZaehler(a, b, felder) {
  const out = {};
  for (const f of felder) out[f] = Math.max(ganz(a?.[f]), ganz(b?.[f]));
  return out;
}

/** Objekt { schluessel: zahl } — je Schlüssel der größere Wert. */
export function maxJeSchluessel(a, b) {
  const out = {};
  for (const quelle of [a, b]) {
    if (!quelle || typeof quelle !== "object") continue;
    for (const [k, v] of Object.entries(quelle)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.max(out[k] ?? -Infinity, n);
    }
  }
  return out;
}

/** Vereinigung zweier Listen (Reihenfolge: erst a, dann Neues aus b). */
export function vereinige(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
}

/**
 * Gekaufte Laden-Designs eines Spiels aus dem Zwischenspeicher (gepflegt von utils/ladenBesitz.js) — synchron und
 * ohne React, damit die Einstellungs-Module der Spiele beim Laden prüfen können, ob ein Design erlaubt ist.
 * @returns {Set<string>}
 */
export function ladenBesitzSofort(spiel, speicher = globalThis.localStorage) {
  try {
    const liste = JSON.parse(speicher.getItem(`laden.besitz.${spiel}`) || "[]");
    return new Set(Array.isArray(liste) ? liste.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Kleinster Wert > 0 (Bestzeiten); 0 = keiner. */
export function kleinsterPositiver(...werte) {
  const gute = werte.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return gute.length ? Math.min(...gute) : 0;
}

/**
 * Zähler-Statistik für Spiele, die vorher keinen Fortschritt speicherten (Blobby, Worldflip, S&S, Spieleabend).
 * Gespeichert als { <zähler>: n, <max-feld>: n, zuletzt: "<schlüssel der zuletzt gezählten Partie>" }.
 *   felder     werden je Partie addiert (Partien, Siege …)
 *   maxFelder  behalten den größten Wert (längste Serie …)
 * zaehle(schluessel, plus, max) zählt eine Partie höchstens einmal: Derselbe Schlüssel (z. B. Raum + Partienummer)
 * wird nach einem Neuladen oder einem zweiten Zeichnen nicht noch einmal gezählt.
 */
export function zaehlerStatistik({ spiel, schluessel, felder, maxFelder = [] }) {
  const alle = [...felder, ...maxFelder];
  const normalisiere = (s) => ({
    ...maxZaehler(s, {}, alle),
    zuletzt: typeof s?.zuletzt === "string" ? s.zuletzt.slice(0, 80) : "",
  });
  return {
    normalisiere,
    lies: (speicher) => {
      const s = liesJson(schluessel, speicher);
      return s ? normalisiere(s) : null;
    },
    schreib: (stand, speicher) => schreibJson(schluessel, normalisiere(stand), speicher),
    zusammenfuehren: (konto, browser) => ({ ...maxZaehler(konto, browser, alle), zuletzt: normalisiere(browser).zuletzt }),
    /** @returns {boolean} true, wenn gezählt (false: diese Partie war schon gezählt) */
    zaehle(partie, plus = {}, max = {}, speicher) {
      const alt = normalisiere(liesJson(schluessel, speicher) || {});
      const key = String(partie || "").slice(0, 80);
      if (key && alt.zuletzt === key) return false;
      const neu = { ...alt, zuletzt: key };
      for (const [f, n] of Object.entries(plus)) if (felder.includes(f)) neu[f] = alt[f] + ganz(n);
      for (const [f, n] of Object.entries(max)) if (maxFelder.includes(f)) neu[f] = Math.max(alt[f], ganz(n));
      schreibJson(schluessel, neu, speicher);
      meldeAenderung(spiel);
      return true;
    },
  };
}
