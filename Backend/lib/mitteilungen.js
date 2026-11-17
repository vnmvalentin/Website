// lib/mitteilungen.js — ANDOCKSTELLE für Mitteilungen aufs Handy/den Rechner (Web-Push, Backend/push/), aus jedem
// Bereich nutzbar, ohne den Push-Teil zu kennen:
//
//   const { meldeMitteilung } = require("../lib/mitteilungen");
//   meldeMitteilung({
//     thema: "turnier",                      // ID aus Backend/push/themen.js (neue Themen dort anhängen)
//     konten: [kontoId, …],                  // nur bei persönlichen Themen: an die Geräte dieser Konten (req.kontoId)
//     titel: { de: "…", en: "…" },           // kurz, wie eine Überschrift
//     text: { de: "…", en: "…" },
//     url: "/clash-royale/turnier/abc",      // wohin ein Tippen auf die Mitteilung führt
//     tag: "turnier-abc",                    // gleiche tag ersetzt eine ältere Mitteilung statt eine zweite zu zeigen
//     ttl: 900,                              // Sekunden, wie lange der Push-Dienst zustellen darf (Standard 1 h)
//     nurGlocke: true,                       // optional: nur in die Glocke der `konten`, keine Mitteilung (thema
//                                            // muss dann nicht in push/themen.js stehen)
//   });
//
// Gibt ein Promise zurück, das nie wirft (Ergebnis { ok, weg, fehler } oder null). Den Versand verbindet nur index.js
// (verbindeMitteilungen) — in Tests und Prüfständen geht so nichts hinaus.

let versand = null;

function verbindeMitteilungen(fn) {
  versand = typeof fn === 'function' ? fn : null;
}

function meldeMitteilung(nachricht) {
  if (!versand) return Promise.resolve(null);
  return Promise.resolve()
    .then(() => versand(nachricht))
    .catch((e) => {
      console.error('[mitteilungen]', e?.message || e);
      return null;
    });
}

module.exports = { meldeMitteilung, verbindeMitteilungen };
