// ergebnis.js — Lights Out: Werte fürs Ergebnisbild (utils/ergebnisbild.js), nur wenn man entkommen ist.

function mmss(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * @param {object} p
 * @param {number} p.ebenen       Zahl der Ebenen
 * @param {number|null} p.zeit    Gesamtzeit in Sekunden (nur bei einem Durchgang ab Ebene 1, sonst null)
 * @param {number} [p.bestzeit]   bisherige Bestzeit in Sekunden (0 = keine)
 * @param {number} [p.notizen]    gefundene Notizen
 * @param {number} [p.notizenAlle]
 * @param {number} [p.koopSpieler]  Zahl der Spieler im Koop (sonst allein)
 */
export function lightsOutErgebnis({ ebenen, zeit = null, bestzeit = 0, notizen = 0, notizenAlle = 0, koopSpieler = 0 }) {
  const mitZeit = Number.isFinite(zeit) && zeit > 0;
  const neueBestzeit = mitZeit && (!bestzeit || zeit <= bestzeit);
  const werte = [{ name: "Ebenen", wert: `${ebenen} / ${ebenen}` }];
  if (koopSpieler > 1) werte.push({ name: "Koop", wert: `${koopSpieler} Spieler` });
  if (notizenAlle > 0) werte.push({ name: "Notizen gefunden", wert: `${notizen} / ${notizenAlle}` });
  if (mitZeit && bestzeit > 0 && !neueBestzeit) werte.push({ name: "Bestzeit", wert: mmss(bestzeit) });
  return {
    spiel: "lights-out",
    kicker: koopSpieler > 1 ? "Koop · Sanatorium Erlengrund" : "Sanatorium Erlengrund",
    marke: neueBestzeit ? "Neue Bestzeit" : null,
    gross: mitZeit ? mmss(zeit) : "Entkommen",
    unter: mitZeit ? "Entkommen, alle Ebenen" : "Alle Ebenen geschafft",
    werte,
    aufruf: mitZeit ? "Schaffst du es schneller?" : "Traust du dich rein?",
    text: mitZeit
      ? `Lights Out: aus dem Sanatorium Erlengrund entkommen in ${mmss(zeit)}.`
      : `Lights Out: aus dem Sanatorium Erlengrund entkommen${koopSpieler > 1 ? ` (Koop zu ${koopSpieler})` : ""}.`,
  };
}
