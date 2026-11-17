// kontoStand.js — adVentures am Konto (utils/spielKonto.js). Rein, ohne React und Netz (node --test).
//
// Der echte Fortschritt liegt am adVentures-Server (Twitch- oder Gast-Profil, Backend/adventure). Fürs Konto der Website
// (Stufe, Abzeichen, Bestwerte auf der Visitenkarte) spiegelt der Browser nach jedem Laden des Profils einen kleinen
// Auszug: Läufe, Siege, ausgewählte Erfolge, Höchstpunkte, größte Tiefe. Der Spiegel wächst nur (je Wert das Größere),
// damit ein Gerät mit kleinerem Profil (z. B. als Gast) den Stand am Konto nie verkleinert.
import { ganz, liesJson, maxZaehler, schreibJson, vereinige, meldeAenderung } from "../../utils/spielstand.js";

export const SPIEGEL_SCHLUESSEL = "adventures.kontoSpiegel";
const ZAEHLER = ["laeufe", "siege", "punkte", "tiefe"];

/** Erfolge des Spiels (Backend/adventure/meta.js) → Abzeichen am Konto (Backend/konto/erfolge.js, Bereich adventures) */
export const ABZEICHEN = {
  ersterBoss: "erster-boss",
  sieg: "drachentoeter",
  siegAlbtraum: "albtraum",
  aufstieg5: "unmoeglich",
  kills30000: "weltenbrand",
  zyklus3: "dritter-zyklus",
  tiefe20: "bodenlos",
};

export function normalisiere(s) {
  return {
    ...maxZaehler(s, {}, ZAEHLER),
    erfolge: (Array.isArray(s?.erfolge) ? s.erfolge : []).filter((id) => Object.values(ABZEICHEN).includes(id)),
  };
}

export function zusammenfuehren(konto, browser) {
  const a = normalisiere(konto);
  const b = normalisiere(browser);
  return { ...maxZaehler(a, b, ZAEHLER), erfolge: vereinige(a.erfolge, b.erfolge) };
}

/** Auszug aus GET /api/adventure/profile */
export function spiegelAusProfil(p) {
  return normalisiere({
    laeufe: p?.runs,
    siege: p?.wins,
    punkte: p?.best?.score,
    tiefe: p?.depthBest,
    erfolge: (Array.isArray(p?.achievements) ? p.achievements : []).map((id) => ABZEICHEN[id]).filter(Boolean),
  });
}

/** Nach jedem Laden des Profils: Spiegel im Browser auffrischen (nur wachsen lassen) und das Konto informieren */
export function aktualisiereSpiegel(profil, speicher) {
  if (!profil) return;
  const neu = zusammenfuehren(liesJson(SPIEGEL_SCHLUESSEL, speicher), spiegelAusProfil(profil));
  if (!neu.laeufe && !neu.erfolge.length) return; // noch nie gespielt: nichts ans Konto
  schreibJson(SPIEGEL_SCHLUESSEL, neu, speicher);
  meldeAenderung("adventures");
}

export const ADVENTURE_KONTO = {
  lies: () => {
    const s = liesJson(SPIEGEL_SCHLUESSEL);
    return s ? normalisiere(s) : null;
  },
  schreib: (stand) => schreibJson(SPIEGEL_SCHLUESSEL, normalisiere(stand)),
  xp: (stand) => ganz(normalisiere(stand).laeufe) * 10,
  zusammenfuehren,
  erfolge: (stand) => normalisiere(stand).erfolge,
  bestwerte: (stand) => {
    const s = normalisiere(stand);
    return { punkte: s.punkte, tiefe: s.tiefe };
  },
};
