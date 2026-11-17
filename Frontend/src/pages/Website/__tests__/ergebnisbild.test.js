// npm test -- Website — Ergebnisbilder (utils/ergebnisbild.js, Spur D): Link mit ?ref, Text, Dateiname, Säubern der
// Werte und die Werte jedes Spiels. Gezeichnet wird im Browser (Sichtprüfung per Prüfstand), hier nur die reine Logik.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { ERGEBNIS_TEXTE } from "../../../components/ergebnisTeilenTexte.js";
import {
  LOOKS, anzeigeAdresse, dateiName, ergebnisLink, ergebnisText, lookFuer, refKuerzel, saubereRaster, saubereWerte,
} from "../../../utils/ergebnisbild.js";
import { lightsOutErgebnis } from "../../LightsOut/ergebnis.js";
import { adventureErgebnis } from "../../Adventure/ergebnis.js";
import { worldflipErgebnis } from "../../Worldflip/ergebnis.js";
import { flickErgebnis } from "../../FlickSoccer/ergebnis.js";
import { blobbyErgebnis } from "../../Blobby/ergebnis.js";
import { duellErgebnis, moorErgebnis } from "../../SacrificeSigils/ergebnis.js";
import { spieleabendErgebnis } from "../../Spieleabend/ergebnis.js";

// Gleiches Muster wie TAG_RE in Backend/analytics/normalize.js — sonst zählt die Statistik den Link nicht
const TAG_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/i;

test("Englisch ist vollständig (Fenster „Ergebnis teilen“)", () => {
  assert.deepEqual(missingKeys(ERGEBNIS_TEXTE.dict("de"), ERGEBNIS_TEXTE.dict("en")), []);
});

test("Link: ?ref=ergebnis-<spiel>, Pfad aus dem Look oder dem Ergebnis, vorhandene Angaben bleiben", () => {
  assert.equal(ergebnisLink({ spiel: "lights-out" }, "https://vnmvalentin.de"), "https://vnmvalentin.de/lights-out?ref=ergebnis-lights-out");
  assert.equal(
    ergebnisLink({ spiel: "seed-runners", pfad: "/seed-runners/daily/2026-10-01" }, "http://localhost:5173"),
    "http://localhost:5173/seed-runners/daily/2026-10-01?ref=ergebnis-seed-runners",
  );
  assert.equal(ergebnisLink({ spiel: "worldflip", pfad: "/worldflip?lang=en" }, "https://x.de"), "https://x.de/worldflip?lang=en&ref=ergebnis-worldflip");
  // Unsinn als Pfad oder Herkunft fällt auf den Look bzw. die eigene Adresse zurück
  assert.equal(ergebnisLink({ spiel: "blobby", pfad: "https://boese.de" }, "javascript:alert(1)"), "https://vnmvalentin.de/blobby?ref=ergebnis-blobby");
});

test("ref-Kürzel passt immer zur Besucherstatistik", () => {
  for (const spiel of [...Object.keys(LOOKS), "cr-ratespiele", "Ganz Komisch!!", "", null, "x".repeat(80)]) {
    assert.match(refKuerzel(spiel), TAG_RE, String(spiel));
  }
  assert.equal(refKuerzel("Ganz Komisch!!"), "ergebnis-ganz-komisch");
});

test("Adresse im Bild ohne https und ohne ?ref; Dateiname mit Datum", () => {
  assert.equal(anzeigeAdresse({ spiel: "adventures" }), "vnmvalentin.de/adventures");
  assert.equal(anzeigeAdresse({ spiel: "worldflip", pfad: "/worldflip?lang=en" }), "vnmvalentin.de/worldflip");
  assert.equal(anzeigeAdresse({ spiel: "gibtsnicht" }), "vnmvalentin.de");
  assert.equal(dateiName({ spiel: "flick-soccer" }, new Date(2026, 10, 7)), "vnmvalentin-flick-soccer-2026-11-07.png");
});

test("Text: eigene Zeile des Spiels, sonst Name · große Zahl · Unterzeile — immer mit Link", () => {
  assert.equal(
    ergebnisText({ spiel: "blobby", text: "Blobby Volley: 15 : 3 gewonnen." }, "https://x.de"),
    "Blobby Volley: 15 : 3 gewonnen.\nhttps://x.de/blobby?ref=ergebnis-blobby",
  );
  assert.equal(ergebnisText({ spiel: "lights-out", gross: "18:42", unter: "Entkommen" }, "https://x.de"),
    "Lights Out · 18:42 · Entkommen\nhttps://x.de/lights-out?ref=ergebnis-lights-out");
});

test("Werte und Raster werden gesäubert und begrenzt", () => {
  assert.deepEqual(
    saubereWerte([{ name: "A", wert: 1 }, null, { name: "", wert: "x" }, { name: "B", wert: 0 }, { name: "C", wert: "3" }, { name: "D", wert: "4" }, { name: "E", wert: "5" }]),
    [{ name: "A", wert: "1" }, { name: "B", wert: "0" }, { name: "C", wert: "3" }, { name: "D", wert: "4" }],
  );
  assert.deepEqual(saubereWerte("nein"), []);
  const flach = Array.from({ length: 30 }, () => "#fff");
  assert.deepEqual(saubereRaster(flach).map((z) => z.length), [12, 12, 6]);
  assert.deepEqual(saubereRaster(Array.from({ length: 50 }, () => "#fff")).map((z) => z.length), [12, 12, 12]);
  assert.deepEqual(saubereRaster([["#a", 3, "#b"], []]), [["#a", "#b"]]);
  assert.deepEqual(saubereRaster(null), []);
});

test("Unbekanntes Spiel bekommt den neutralen Look, eigene Farben überstimmen", () => {
  assert.equal(lookFuer("gibtsnicht").pfad, "/");
  assert.equal(lookFuer("blobby", { akzent: "#000000" }).akzent, "#000000");
  assert.equal(lookFuer("blobby").hell, true);
});

// Jedes Spiel: bekannter Look, große Zahl, höchstens 4 Werte, Text ohne Zeilenumbruch, keine fremden Namen
const BEISPIELE = {
  "Lights Out allein mit neuer Bestzeit": lightsOutErgebnis({ ebenen: 4, zeit: 1122, bestzeit: 1122, notizen: 7, notizenAlle: 20 }),
  "Lights Out ab späterer Ebene": lightsOutErgebnis({ ebenen: 4, zeit: null, notizen: 0, notizenAlle: 20 }),
  "Lights Out Koop": lightsOutErgebnis({ ebenen: 4, koopSpieler: 3 }),
  "adVentures Sieg": adventureErgebnis(
    { won: true, kitId: "monk", difficulty: 2, ascension: 2, time: 1100, stagesCleared: 5, loop: 0, level: 31, stats: { kills: 8412, bossesKilled: 5 }, server: { score: 123456, isRecord: true } },
    { kit: "Mönch", schwierigkeit: "Albtraum" },
  ),
  "adVentures gefallen in Zyklus 2": adventureErgebnis(
    { dead: true, mode: "daily", time: 3725, stagesCleared: 8, loop: 1, level: 40, stats: { kills: 20000, bossesKilled: 7 }, server: null },
    { kit: "Jägerin", schwierigkeit: "Normal" },
  ),
  "Worldflip zu viert": worldflipErgebnis({ zuege: 37, karten: [0, 3, null, 5], platz: 0, spieler: [{}, { bot: true }, { bot: true }, { bot: true }] }),
  "Worldflip 2 gegen 2": worldflipErgebnis({ zuege: 12, karten: [0, 2, 4, 1], platz: 2, spieler: [{}, {}, {}, {}], teams: [0, 1, 0, 1], teamName: "Team Gold" }),
  "Flick Soccer Tour": flickErgebnis({ score: [3, 0], team: 0, winner: 0, modus: "tour", gegner: "Eisenfuß", cup: "Nordpokal", sterne: 3, gegentore: 0 }),
  "Flick Soccer online als Blau": flickErgebnis({ score: [1, 4], team: 1, winner: 1, modus: "online" }),
  "Flick Soccer zu zweit": flickErgebnis({ score: [2, 5], team: null, winner: 1, modus: "lokal" }),
  "Blobby König": blobbyErgebnis({ score: { 1: 7, 2: 4 }, team: 1, settings: { koenig: true, party: ["wind"] }, koenigSerie: 3 }),
  "Blobby 2v2 Ego": blobbyErgebnis({ score: { 1: 2, 2: 15 }, team: 2, settings: { mode: "2v2", field: "beach", powerups: true } }),
  "S&S Duell": duellErgebnis({ siege: [1, 2], ich: 1, stats: { direct: 14, kills: 9, played: 23 }, zirkel: "Moor-Zirkel", staerkste: "Moorhexe" }),
  "S&S Moorwanderung": moorErgebnis({ platz: 1, spieler: 5, siegel: 2, siegelMax: 3, stats: { duelsWon: 4, duelsLost: 1, npcWins: 6, fuses: 2 } }),
  "Spieleabend 4 gewinnt gegen Bot": spieleabendErgebnis({ spielId: "vierGewinnt", spielName: "4 gewinnt", menschen: 1, bots: 1, farbe: "Rot" }),
  "Spieleabend Hochstapler": spieleabendErgebnis({ spielId: "zeichnen", spielName: "Zeichen-Hochstapler", menschen: 5, zeichnen: { hochstapler: true, erwischt: false, wort: "Schneemann" } }),
};

for (const [name, e] of Object.entries(BEISPIELE)) {
  test(`Ergebnis „${name}“ hält die Regeln ein`, () => {
    assert.ok(LOOKS[e.spiel], `Look für ${e.spiel}`);
    assert.equal(typeof e.gross, "string");
    assert.ok(e.gross.trim().length > 0 && e.gross.length <= 16, `große Zeile kurz: ${e.gross}`);
    assert.ok(saubereWerte(e.werte).length === (e.werte || []).length, "alle Werte vollständig, höchstens 4");
    assert.ok(typeof e.text === "string" && e.text.length > 10 && !e.text.includes("\n"));
    // Kein „undefined“, „NaN“ oder „null“ in einem sichtbaren Text (eine fehlende Marke ist erlaubt)
    const texte = [e.gross, e.unter, e.kicker, e.marke, e.text, e.aufruf, ...(e.werte || []).flatMap((w) => [w.name, w.wert])]
      .filter((t) => t !== null && t !== undefined);
    for (const t of texte) assert.ok(!/undefined|NaN|\bnull\b/.test(String(t)), `${name}: ${t}`);
    assert.match(ergebnisLink(e, "https://vnmvalentin.de"), /\?ref=ergebnis-[a-z-]+$|&ref=ergebnis-[a-z-]+$/);
  });
}

test("Inhalte stimmen: eigene Sicht bei Team Blau, Bestzeit-Marke nur bei neuer Bestzeit", () => {
  assert.equal(BEISPIELE["Flick Soccer online als Blau"].gross, "4 : 1");
  assert.equal(BEISPIELE["Blobby 2v2 Ego"].gross, "15 : 2");
  assert.equal(BEISPIELE["S&S Duell"].gross, "2 : 1");
  assert.equal(BEISPIELE["Lights Out allein mit neuer Bestzeit"].marke, "Neue Bestzeit");
  assert.equal(lightsOutErgebnis({ ebenen: 4, zeit: 1200, bestzeit: 1122 }).marke, null);
  assert.equal(BEISPIELE["Lights Out allein mit neuer Bestzeit"].gross, "18:42");
  assert.equal(BEISPIELE["adVentures Sieg"].gross, "8.412");
  assert.equal(BEISPIELE["adVentures gefallen in Zyklus 2"].werte[0].wert, "1:02:05");
  assert.equal(BEISPIELE["adVentures gefallen in Zyklus 2"].werte[1].name, "Tiefe");
  assert.equal(BEISPIELE["Worldflip 2 gegen 2"].werte[1].wert, "3"); // nur das andere Team (2 + 1)
  assert.equal(BEISPIELE["Flick Soccer Tour"].marke, "Drei Sterne");
  assert.equal(BEISPIELE["Blobby König"].marke, "3× König in Folge");
  assert.equal(BEISPIELE["S&S Moorwanderung"].pfad, "/sacrifice-and-sigils/moorwanderung");
  assert.equal(BEISPIELE["Spieleabend Hochstapler"].gross, "Reingelegt");
});
