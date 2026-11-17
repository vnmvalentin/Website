// npm test -- Website — Einladungslinks im Browser: Code aus der Adresse merken (30 Tage), Annahme nach der Anmeldung
// (endgültige Antworten vergessen den Code, Fehler nicht), Link-Form, Texte vollständig auf Englisch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { EINLADUNG_TEXTE } from "../../../components/einladungTexte.js";
import { merkeAusAdresse, offeneEinladung, vergissEinladung, nimmEinladungAn, einladungsLink } from "../../../utils/einladung.js";

function speicher() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const antwort = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test("Englisch ist vollständig (Einladungen)", () => {
  assert.deepEqual(missingKeys(EINLADUNG_TEXTE.dict("de"), EINLADUNG_TEXTE.dict("en")), []);
});

test("Code aus der Adresse: tolerant gelesen, 30 Tage gemerkt, Unsinn ignoriert", () => {
  const s = speicher();
  const t0 = Date.UTC(2026, 10, 17);
  assert.equal(merkeAusAdresse("?einladung=abcd-2345&ref=einladung", s, t0), "ABCD2345");
  assert.equal(offeneEinladung(s, t0 + 29 * 86400_000), "ABCD2345");
  assert.equal(offeneEinladung(s, t0 + 31 * 86400_000), null, "abgelaufen");
  assert.equal(merkeAusAdresse("?einladung=<script>", s, t0), null);
  assert.equal(merkeAusAdresse("?ref=einladung", s, t0), null);
  assert.equal(einladungsLink("ABCD2345", "https://vnmvalentin.de"), "https://vnmvalentin.de/?einladung=ABCD2345&ref=einladung");
});

test("Annehmen: ok und endgültige Fehler vergessen den Code, Server-Fehler nicht", async () => {
  const s = speicher();
  assert.equal(await nimmEinladungAn({ storage: s, fetchImpl: antwort(200, { ok: true }) }), null, "nichts gemerkt");
  merkeAusAdresse("?einladung=ABCD2345", s);
  assert.equal(await nimmEinladungAn({ storage: s, fetchImpl: antwort(500, {}) }), "fehler");
  assert.equal(offeneEinladung(s), "ABCD2345");
  assert.equal(await nimmEinladungAn({ storage: s, fetchImpl: async () => { throw new Error("offline"); } }), "fehler");
  assert.equal(await nimmEinladungAn({ storage: s, fetchImpl: antwort(400, { ok: false, fehler: "zu-alt" }) }), "zu-alt");
  assert.equal(offeneEinladung(s), null);
  merkeAusAdresse("?einladung=ABCD2345", s);
  assert.equal(await nimmEinladungAn({ storage: s, fetchImpl: antwort(200, { ok: true }) }), "ok");
  assert.equal(offeneEinladung(s), null);
  vergissEinladung(s);
});
