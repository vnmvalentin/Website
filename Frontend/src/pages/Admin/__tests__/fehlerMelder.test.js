// npm test -- Admin — reine Teile von utils/fehlerMelder.js (Rauschen, Bericht, Drossel). Liegt hier, weil die
// Frontend-Tests nur unter src/pages gesucht werden.
import test from "node:test";
import assert from "node:assert/strict";
import { sollIgnorieren, berichtAus, erstelleMelder, komponentenKette } from "../../../utils/fehlerMelder.js";

test("Rauschen wird nicht gemeldet", () => {
  assert.equal(sollIgnorieren({ nachricht: "ResizeObserver loop completed with undelivered notifications." }), true);
  assert.equal(sollIgnorieren({ nachricht: "Script error." }), true);
  assert.equal(sollIgnorieren({ nachricht: "Failed to fetch dynamically imported module: https://x/assets/a-1.js" }), true);
  assert.equal(sollIgnorieren({ nachricht: "TypeError: x is undefined", stapel: "at f (chrome-extension://abc/inject.js:1:2)" }), true);
  assert.equal(sollIgnorieren({ nachricht: "   " }), true);
  assert.equal(sollIgnorieren({ nachricht: "TypeError: x is undefined", stapel: "at f (https://vnmvalentin.de/assets/a.js:1:2)" }), false);
});

test("Bericht aus Error, Objekt und Text", () => {
  const e = new TypeError("Cannot read properties of undefined");
  const b = berichtAus("error", e, "Kontext", { pfad: "/fun", obs: true });
  assert.equal(b.nachricht, "TypeError: Cannot read properties of undefined");
  assert.ok(b.stapel.includes("TypeError"));
  assert.deepEqual([b.art, b.seite, b.kontext, b.obs], ["error", "/fun", "Kontext", true]);
  assert.equal(berichtAus("unhandledrejection", { message: "abgelehnt", stack: "at x" }).nachricht, "abgelehnt");
  assert.equal(berichtAus("unhandledrejection", { code: 42 }).nachricht, '{"code":42}');
  const kreis = {};
  kreis.selbst = kreis;
  assert.equal(berichtAus("unhandledrejection", kreis).nachricht, "[Objekt]");
  assert.equal(berichtAus("unhandledrejection", undefined).nachricht, "");
  assert.equal(berichtAus("error", "x".repeat(900)).nachricht.length, 500);
});

test("Drossel: jedes Fehlerbild einmal je Seitenaufruf, höchstens zehn Meldungen, Rauschen nie", () => {
  const gesendet = [];
  const melde = erstelleMelder({ senden: (b) => gesendet.push(b), umgebung: () => ({ pfad: "/", obs: false }) });
  assert.equal(melde("error", new Error("eins")), true);
  assert.equal(melde("error", new Error("eins")), false);
  assert.equal(melde("unhandledrejection", new Error("eins")), true, "andere Art = eigenes Bild");
  assert.equal(melde("error", "Script error."), false);
  for (let i = 0; i < 20; i++) melde("error", new Error(`neu ${i}`));
  assert.equal(gesendet.length, 10);
});

test("Melder wirft nie, auch wenn das Senden scheitert", () => {
  const melde = erstelleMelder({ senden: () => { throw new Error("offline"); }, umgebung: () => ({}) });
  assert.doesNotThrow(() => melde("error", new Error("x")));
});

test("Komponenten-Kette aus dem React-Stapel", () => {
  const stapel = "\n    at GameContainer (https://x/assets/a.js:1:2)\n    at Suspense\n    at LazyRouteBoundary (https://x/assets/b.js:3:4)";
  assert.equal(komponentenKette(stapel), "GameContainer < Suspense < LazyRouteBoundary");
  assert.equal(komponentenKette(undefined), "");
});
