// Eingabe mit Maustasten: belegen, spielen, Bedienelemente ignorieren, Browser-Standardverhalten nur bei belegten Tasten
// unterdrücken. Ein kleines Ersatz-window statt eines Browsers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT } from '../../sim/inputBits.js';
import { DEFAULT_BINDINGS } from '../inputLatch.js';

// ── Ersatz für window, document, localStorage ──
const listeners = new Map();                     // Typ → Set von Handlern (mehrere Eingaben gleichzeitig)
globalThis.window = {
  addEventListener: (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
  removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
  dispatchEvent: (ev) => { for (const fn of [...(listeners.get(ev.type) || [])]) fn(ev); return true; },
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };
const speicher = new Map();
globalThis.localStorage = { getItem: (k) => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, v), removeItem: (k) => speicher.delete(k) };

const { createInput, keyLabel, isMouseCode } = await import('../input.js');

const flaeche = { tagName: 'CANVAS', closest: () => null };                 // das Spielfeld
const knopf = { tagName: 'BUTTON', closest: () => ({ tagName: 'BUTTON' }) };  // ein Bedienelement
function feuer(type, extra) {
  const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, target: flaeche, repeat: false, ...extra };
  for (const fn of [...(listeners.get(type) || [])]) fn(e);
  return e;
}
const maus = (type, button, target = flaeche) => feuer(type, { button, target });
const taste = (type, code) => feuer(type, { code, target: flaeche });

function frisch() {
  speicher.clear();
  const input = createInput();
  input.attach();
  return input;
}

test('Ohne Belegung zählt ein Mausklick nicht und der Browser behält sein Verhalten', () => {
  const input = frisch();
  const e = maus('mousedown', 0);
  assert.equal(input.sampleTick(), 0);
  assert.equal(e.defaultPrevented, false);
  assert.equal(maus('contextmenu', 2).defaultPrevented, false, 'Kontextmenü bleibt, solange rechts nicht belegt ist');
  input.detach();
});

test('Springen auf Maus links: kommt zu den Tasten dazu, der Klick springt, der Umbelege-Klick selbst springt nicht', () => {
  const input = frisch();
  let fertig = null;
  input.rebind('jump', (b) => { fertig = b; });
  maus('mousedown', 0);
  assert.deepEqual(fertig.jump, [...DEFAULT_BINDINGS.jump, 'Mouse0'], 'Leertaste und K bleiben');
  maus('mouseup', 0);                                  // Loslassen nach dem Umbelegen wird verschluckt
  assert.equal(input.sampleTick() & INPUT.JUMP, 0);

  maus('mousedown', 0);
  assert.ok(input.sampleTick() & INPUT.JUMP, 'Maus links springt');
  maus('mouseup', 0);
  input.sampleTick();
  assert.equal(input.sampleTick() & INPUT.JUMP, 0, 'losgelassen');

  maus('mousedown', 0, knopf);
  assert.equal(input.sampleTick() & INPUT.JUMP, 0, 'ein Klick auf einen Knopf ist Bedienung, kein Sprung');
  assert.deepEqual(JSON.parse(speicher.get('seedrunners_bindings')).jump, [...DEFAULT_BINDINGS.jump, 'Mouse0'], 'gespeichert');
  input.detach();
});

test('Dash auf Maus rechts: Kontextmenü weg, nur solange belegt; eine Taste danach ersetzt nur die Tasten', () => {
  const input = frisch();
  input.rebind('dash', () => {});
  maus('mousedown', 2);
  maus('mouseup', 2);
  assert.equal(maus('contextmenu', 2).defaultPrevented, true);
  assert.equal(maus('contextmenu', 2, knopf).defaultPrevented, false, 'auf Bedienelementen bleibt das Menü');
  maus('mousedown', 2);
  assert.ok(input.sampleTick() & INPUT.DASH);
  maus('mouseup', 2);

  let b = null;
  input.rebind('dash', (next) => { b = next; });
  taste('keydown', 'KeyQ');
  assert.deepEqual(b.dash, ['Mouse2', 'KeyQ'], 'die Taste ersetzt Shift/J, Maus rechts bleibt');
  input.detach();
});

test('Eine Maustaste gehört nur einer Aktion; wer dabei seine letzte Taste verliert, bekommt eine zurück', () => {
  const input = frisch();
  input.rebind('jump', () => {});
  maus('mousedown', 0);
  maus('mouseup', 0);
  let b = null;
  input.rebind('dash', (next) => { b = next; });
  maus('mousedown', 0);
  assert.ok(b.dash.includes('Mouse0'));
  assert.ok(!b.jump.includes('Mouse0'), 'Springen hat Maus links abgegeben');
  assert.ok(b.jump.length > 0);
  for (const [aktion, liste] of Object.entries(b)) assert.ok(liste.length > 0, `${aktion} hat eine Taste`);
  input.detach();
});

test('Seitentasten: kein Zurück/Vor im Browser, wenn belegt; Beschriftungen', () => {
  const input = frisch();
  input.rebind('grapple', () => {});
  maus('mousedown', 3);
  maus('mouseup', 3);
  assert.equal(maus('auxclick', 3).defaultPrevented, true);
  assert.equal(maus('auxclick', 4).defaultPrevented, false, 'die andere Seitentaste ist frei');
  assert.equal(keyLabel('Mouse0'), 'Maus links');
  assert.equal(keyLabel('Mouse2'), 'Maus rechts');
  assert.equal(isMouseCode('Mouse4'), true);
  assert.equal(isMouseCode('KeyM'), false);
  input.detach();
});

test('Umbelegen wirkt SOFORT in einem schon laufenden Rennen (andere Eingabe), ohne Neuladen', () => {
  speicher.clear();
  const rennen = createInput();
  rennen.attach();
  const fenster = createInput();               // das Fenster „Steuerung“ mit eigener Eingabe
  fenster.attach();
  fenster.rebind('jump', () => {});
  taste('keydown', 'KeyU');
  taste('keyup', 'KeyU');
  fenster.detach();
  rennen.sampleTick();
  taste('keydown', 'KeyU');
  assert.ok(rennen.sampleTick() & INPUT.JUMP, 'das laufende Rennen springt jetzt mit U');
  taste('keyup', 'KeyU');
  rennen.sampleTick();
  taste('keydown', 'Space');
  assert.equal(rennen.sampleTick() & INPUT.JUMP, 0, 'die ersetzte Leertaste springt nicht mehr');
  taste('keyup', 'Space');
  rennen.detach();
});

test('Während im Fenster umbelegt wird, reagiert das Rennen auf nichts — danach wieder normal', () => {
  speicher.clear();
  const rennen = createInput();
  rennen.attach();
  const fenster = createInput();
  fenster.attach();
  fenster.rebind('dash', () => {});
  taste('keydown', 'Space');                  // wird die neue Dash-Taste, darf im Rennen NICHT springen
  assert.equal(rennen.sampleTick(), 0, 'das Rennen hat den Tastendruck nicht gesehen');
  taste('keyup', 'Space');
  rennen.sampleTick();
  taste('keydown', 'Space');
  assert.ok(rennen.sampleTick() & INPUT.DASH, 'danach ist Leertaste Dash — auch im Rennen');
  taste('keyup', 'Space');

  fenster.rebind('grapple', () => {});
  fenster.detach();                            // Fenster zu, ohne eine Taste zu drücken
  rennen.sampleTick();
  taste('keydown', 'KeyE');
  assert.ok(rennen.sampleTick() & INPUT.GRAPPLE, 'eine abgebrochene Umbelegung blockiert das Rennen nicht');
  taste('keyup', 'KeyE');
  rennen.detach();
});
