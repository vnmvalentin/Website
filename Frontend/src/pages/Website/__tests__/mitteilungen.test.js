// npm test -- Website — App & Mitteilungen: Texte vollständig auf Englisch, VAPID-Schlüssel (base64url) richtig in
// Bytes umgewandelt, ohne Browser keine Unterstützung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { missingKeys } from "../../../i18n/core.js";
import { MITTEILUNGEN_TEXTE } from "../../../components/mitteilungenTexte.js";
import { base64UrlZuBytes, unterstuetzt, istInstalliert } from "../../../utils/mitteilungen.js";

test("Englisch ist vollständig (App & Mitteilungen)", () => {
  assert.deepEqual(missingKeys(MITTEILUNGEN_TEXTE.dict("de"), MITTEILUNGEN_TEXTE.dict("en")), []);
});

test("VAPID-Schlüssel: base64url ohne Auffüllzeichen → Bytes", () => {
  const bytes = Uint8Array.from({ length: 65 }, (_, i) => (i * 37 + 4) % 256);
  const b64url = Buffer.from(bytes).toString("base64url");
  assert.ok(!b64url.includes("="), "Probe ohne Auffüllzeichen");
  assert.deepEqual([...base64UrlZuBytes(b64url)], [...bytes]);
  assert.deepEqual([...base64UrlZuBytes("-_8")], [0xfb, 0xff]);
});

test("Ohne Browser: keine Mitteilungen, nicht installiert", () => {
  assert.equal(unterstuetzt(), false);
  assert.equal(istInstalliert(), false);
});
