// kontoStand.js — Blobby Volley am Konto (utils/spielKonto.js): eine kleine Statistik je Spieler, gezählt am Ende
// jeder Partie im Raum (BlobbyRoom.jsx). Rein, ohne React und Netz (node --test).
import { zaehlerStatistik } from "../../utils/spielstand.js";

export const BLOBBY_STATISTIK = zaehlerStatistik({
  spiel: "blobby",
  schluessel: "blobby_stats",
  felder: ["partien", "siege", "zuNull"],
  maxFelder: ["koenigSerie"],
});

/**
 * Eine beendete Partie zählen (nur Spieler, nicht Zuschauer).
 * @param {{ code: string, matchId: number, gewonnen: boolean, gegenpunkte: number, koenigSerie?: number }} p
 */
export function zaehleBlobbyPartie({ code, matchId, gewonnen, gegenpunkte, koenigSerie = 0 }, speicher) {
  return BLOBBY_STATISTIK.zaehle(
    `${code}:${matchId}`,
    { partien: 1, siege: gewonnen ? 1 : 0, zuNull: gewonnen && Number(gegenpunkte) === 0 ? 1 : 0 },
    { koenigSerie: gewonnen ? koenigSerie : 0 },
    speicher,
  );
}

export const BLOBBY_KONTO = {
  lies: () => BLOBBY_STATISTIK.lies(),
  schreib: (stand) => BLOBBY_STATISTIK.schreib(stand),
  xp: (stand) => {
    const s = BLOBBY_STATISTIK.normalisiere(stand);
    return s.partien * 10 + s.siege * 5;
  },
  zusammenfuehren: BLOBBY_STATISTIK.zusammenfuehren,
  erfolge: (stand) => {
    const s = BLOBBY_STATISTIK.normalisiere(stand);
    return [
      s.siege >= 1 && "erster-sieg",
      s.zuNull >= 1 && "zu-null",
      s.koenigSerie >= 3 && "koenig",
      s.partien >= 50 && "stammgast",
    ].filter(Boolean);
  },
  bestwerte: (stand) => {
    const s = BLOBBY_STATISTIK.normalisiere(stand);
    return { siege: s.siege, "koenig-serie": s.koenigSerie };
  },
};
