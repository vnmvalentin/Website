// Schema der Elemente: welche Parameter ein Element im Level hat, ihr Typ und ihr erlaubter Bereich.
//
// WARUM ES DAS GIBT
// Die Element-Module lesen ihre Parameter ungeprüft. Für Level aus dem Editor (und vom Server angenommene
// Level) ist das gefährlich: Periode 0, NaN oder ein Tempo von 1e9 würden die Sim abstürzen lassen oder
// nicht-deterministisch machen. Dieses Schema ist die EINZIGE Quelle dafür, was erlaubt ist:
//   · der Server validiert damit jedes hochgeladene Level (level/validate.js),
//   · der Editor baut daraus seine Eigenschaften-Formulare und begrenzt die Eingaben.
// Standardwerte stimmen mit denen der Element-Module überein (ELEMENT_PARAMS in config.js bzw. die
// Vorgaben im Modul selbst); der Test in level/__tests__ prüft, dass alle GENERIERTEN Level in diesen
// Grenzen liegen und sich durch normalizeParams nicht verändern.
//
// KANONISCHE FORM
// normalizeParams füllt alle Standardwerte aus, rundet Zahlen auf 3 Nachkommastellen und lässt Angaben weg,
// die für das Verhalten bedeutungslos sind (etwa das Tempo einer stehenden Säge). "Standardwert ausdrücklich
// angegeben" und "weggelassen" ergeben so denselben Inhalt und damit denselben Hash.
//
// Diese Datei gehört zur Sim und wird ins Backend gespiegelt.

import { ELEMENT_PARAMS } from '../config.js';

/** Anzahl der Schalter-Kanäle (0–3). Kanal 0 ist das frühere einzige Rot/Blau. */
export const CHANNELS = 4;

const DIRS_4 = ['up', 'down', 'left', 'right'];
const DIRS_8 = ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight'];

const def = (type, key) => ELEMENT_PARAMS[type]?.[key];

/** Zahl; Standard aus ELEMENT_PARAMS (falls dort vorhanden) oder ausdrücklich in `extra.default` */
const num = (type, key, min, max, extra = {}) => ({
  kind: 'num', min, max, default: extra.default ?? def(type, key), ...extra,
});
const int = (type, key, min, max, extra = {}) => num(type, key, min, max, { int: true, step: 1, ...extra });
const oneOf = (options, extra = {}) => ({ kind: 'enum', options, ...extra });

/**
 * category  Palette des Editors: 'hazard' (Gefahren), 'platform' (Plattformen), 'movement' (Bewegung), 'logic' (Logik)
 * anchor    wo das Element sitzen darf: 'air' (nur in Luft), 'airOrSolid' (auch in einem festen Block; der Laser sitzt
 *           in einem), 'any' (Zonen: die Ankerkachel ist nur ihre obere linke Ecke)
 * params    Reihenfolge = Reihenfolge im Formular. optional = darf fehlen (dann gilt das Verhalten des Moduls)
 */
export const ELEMENT_SCHEMA = {
  spike: {
    label: 'Spikes', category: 'hazard', anchor: 'air',
    params: {
      dir: oneOf(DIRS_4, { optional: true, label: 'Ausrichtung', hint: 'Ohne Angabe folgt sie dem Block, an dem sie sitzen.' }),
      // Ohne Periode stehen sie dauerhaft (wie bisher); mit Periode fahren sie ein und aus.
      period: num('spike', 'period', 0.8, 12, { optional: true, default: 3, step: 0.1, unit: 's', label: 'Ein-/Ausfahren: Periode', hint: 'Ohne Angabe stehen die Spikes dauerhaft.' }),
      on: num('spike', 'on', 0.2, 11.5, { optional: true, default: 1.5, step: 0.1, unit: 's', label: 'Ausgefahren', hint: 'Wie lange sie ausgefahren bleiben, bevor sie wieder einfahren.' }),
      warn: num('spike', 'warn', 0, 1.5, { step: 0.1, unit: 's', label: 'Vorwarnung', hint: 'Kurz vor dem Ausfahren zeigen sie sich schon ein Stück.' }),
      phase: num('spike', 'phase', 0, 1, { default: 0, step: 0.05, label: 'Zeitversatz', hint: 'Verschiebt den Start im Takt, falls mehrere Spikes nicht gleichzeitig fahren sollen.' }),
    },
  },
  saw: {
    label: 'Säge', category: 'hazard', anchor: 'air',
    params: {
      radius: num('saw', 'radius', 4, 10, { step: 1, unit: 'px', label: 'Radius' }),
      speed: num('saw', 'speed', 10, 200, { step: 5, unit: 'px/s', label: 'Tempo auf dem Pfad', hint: 'Nur auf einem Pfad: wie schnell sie ihn abfährt.' }),
      turnsPerSecond: num('saw', 'turnsPerSecond', 0.05, 1.5, { step: 0.05, unit: 'U/s', label: 'Umlauf auf der Kreisbahn', hint: 'Nur auf einer Kreisbahn: wie schnell sie den Kreis umrundet.' }),
      phase: num('saw', 'phase', 0, 1, { default: 0, step: 0.05, label: 'Startphase', hint: 'Verschiebt den Start, falls mehrere Sägen nicht im Gleichschritt laufen sollen.' }),
      orbit: num('saw', 'orbitRadius', 1, 12, { optional: true, step: 0.5, unit: 'Tiles', label: 'Kreisbahn-Radius', hint: 'Abstand der Kreisbahn von der Ankerkachel.' }),
      // Mehrere Sägen auf DERSELBEN Bahn, gleichmäßig über den Zyklus verteilt (nur bei Pfad/Kreis)
      count: int('saw', 'count', 1, 8, { label: 'Sägen auf der Bahn', hint: 'Mehrere Sägen auf derselben Bahn, gleichmäßig verteilt — nur auf Pfad oder Kreisbahn.' }),
      path: { kind: 'path', optional: true, label: 'Pfad' },
    },
  },
  laser: {
    label: 'Laser', category: 'hazard', anchor: 'airOrSolid',
    params: {
      dir: oneOf(DIRS_4, { default: 'right', label: 'Richtung', hint: 'Bei drehendem Strahl (Drehung ≠ 0) nur der Startwinkel.' }),
      period: num('laser', 'period', 0.8, 10, { step: 0.1, unit: 's', label: 'Periode', hint: 'Ein voller Zyklus: wie oft der Strahl an- und ausgeht.' }),
      on: num('laser', 'on', 0.1, 9.5, { step: 0.1, unit: 's', label: 'Leuchtdauer', hint: 'Wie lange der Strahl innerhalb einer Periode leuchtet.' }),
      warn: num('laser', 'warn', 0, 1.5, { step: 0.1, unit: 's', label: 'Vorwarnung', hint: 'Kurz vor dem Einschalten zeigt sich ein dünner Warnstrahl.' }),
      phase: num('laser', 'offset', 0, 1, { default: 0, step: 0.05, label: 'Zeitversatz', hint: 'Verschiebt den Start im Takt, falls mehrere Laser nicht gleichzeitig schalten sollen.' }),
      // Dreht sich der Strahl? 0 = fester Strahl wie bisher. `dir` ist dann der Startwinkel.
      spin: num('laser', 'spin', -1, 1, { default: 0, step: 0.05, unit: 'U/s', label: 'Drehung', hint: '0 = fester Strahl in Richtung; sonst dreht er sich mit dieser Zahl Umdrehungen pro Sekunde.' }),
      reach: num('laser', 'reach', 3, 20, { step: 1, unit: 'Tiles', label: 'Länge (drehend)', hint: 'Nur beim drehenden Strahl: wie weit er reicht (fester Strahl endet automatisch am nächsten Block).' }),
    },
  },
  fallingBlock: {
    label: 'Fallender Block', category: 'hazard', anchor: 'air',
    params: {
      width: int('fallingBlock', 'width', 1, 12, { unit: 'Tiles', label: 'Breite', hint: 'Breiter lässt sich nicht seitlich unterlaufen.' }),
      height: int('fallingBlock', 'height', 1, 12, { unit: 'Tiles', label: 'Höhe' }),
      range: num('fallingBlock', 'range', 1, 20, { step: 1, unit: 'Tiles', label: 'Auslöse-Reichweite', hint: 'Wie weit man senkrecht unter dem Block sein muss, damit er auslöst.' }),
      margin: num('fallingBlock', 'margin', 0, 48, { step: 2, unit: 'px', label: 'Auslöse-Abstand', hint: 'Seitlicher Spielraum: Auslösen zählt schon etwas neben dem Block, nicht nur exakt darunter.' }),
      shake: num('fallingBlock', 'shake', 0.1, 1, { step: 0.02, unit: 's', label: 'Wackeln', hint: 'Wie lange er wackelt, bevor er stürzt — die Vorwarnung.' }),
      reset: num('fallingBlock', 'reset', 0.5, 12, { step: 0.5, unit: 's', label: 'Liegen', hint: 'Wie lange er nach dem Aufprall als fester Block liegen bleibt, bevor er zu seinem Platz zurückkehrt.' }),
    },
  },
  mover: {
    label: 'Bewegte Plattform', category: 'platform', anchor: 'air',
    params: {
      width: int('mover', 'width', 1, 12, { unit: 'Tiles', label: 'Breite' }),
      speed: num('mover', 'speed', 10, 150, { step: 5, unit: 'px/s', label: 'Tempo' }),
      phase: num('mover', 'phase', 0, 1, { step: 0.05, label: 'Startphase', hint: 'Verschiebt den Start auf der Bahn, falls mehrere Plattformen nicht im Gleichschritt laufen sollen.' }),
      mode: oneOf(['pingpong', 'loop'], { default: 'pingpong', label: 'Bahn', hint: 'Hin und her (pingpong) oder eine geschlossene Runde (der letzte Punkt kehrt zum ersten zurück).' }),
      oneWay: { kind: 'bool', default: false, label: 'Von unten durchspringbar', hint: 'Man kann von unten und der Seite hindurch, aber auf ihr stehen und mitfahren.' },
      path: { kind: 'path', required: true, label: 'Pfad' },
    },
  },
  crumble: {
    label: 'Bröckelblock', category: 'platform', anchor: 'air',
    params: {
      delay: num('crumble', 'delay', 0.1, 1.2, { step: 0.02, unit: 's', label: 'Verzögerung', hint: 'Wie lange nach dem Betreten, bis der Block verschwindet.' }),
      respawn: num('crumble', 'respawn', 0.5, 6, { step: 0.1, unit: 's', label: 'Rückkehr', hint: 'Wie lange er weg bleibt, bevor er zurückkehrt (nicht, solange man noch darauf steht).' }),
    },
  },
  spring: {
    label: 'Sprungpad', category: 'movement', anchor: 'air',
    params: { dir: oneOf(['up', 'upLeft', 'upRight', 'left', 'right'], { default: 'up', label: 'Richtung', hint: 'Boden-Pad (oben/schräg) steht auf dem Boden; links/rechts ist ein Wand-Pad an der Seite.' }) },
  },
  ring: {
    label: 'Boost-Ring', category: 'movement', anchor: 'air',
    params: {
      dir: oneOf(DIRS_8, { default: 'right', label: 'Richtung', hint: 'Tempo in diese Richtung, dazu füllt er den Luftsprung wieder auf.' }),
      radius: num('ring', 'radius', 4, 20, { step: 1, unit: 'px', label: 'Radius' }),
      cooldown: num('ring', 'cooldown', 0.3, 4, { step: 0.1, unit: 's', label: 'Cooldown', hint: 'Wie lange er nach dem Durchfliegen wirkungslos bleibt.' }),
    },
  },
  crystal: {
    label: 'Dash-Kristall', category: 'movement', anchor: 'air',
    params: {
      radius: num('crystal', 'radius', 4, 14, { step: 1, unit: 'px', label: 'Radius' }),
      respawn: num('crystal', 'respawn', 0.5, 6, { step: 0.1, unit: 's', label: 'Rückkehr', hint: 'Wie lange er nach dem Einsammeln weg bleibt, bevor er zurückkehrt. Eingesammelt wird er nur, wenn der Dash wirklich fehlt.' }),
    },
  },
  wind: {
    label: 'Windzone', category: 'movement', anchor: 'any',
    params: {
      w: int('wind', 'w', 1, 40, { default: 3, unit: 'Tiles', label: 'Breite' }),
      h: int('wind', 'h', 1, 40, { default: 3, unit: 'Tiles', label: 'Höhe' }),
      ax: num('wind', 'ax', -2500, 2500, { default: 0, step: 50, unit: 'px/s²', label: 'Wind seitwärts', hint: 'Negativ schiebt nach links, positiv nach rechts. Der Dash setzt sein eigenes Tempo, ist also unbeeindruckt.' }),
      ay: num('wind', 'ay', -2500, 2500, { default: -1500, step: 50, unit: 'px/s²', label: 'Wind senkrecht (− = Aufwind)' }),
      period: num('wind', 'period', 0.8, 12, { optional: true, default: 3, step: 0.1, unit: 's', label: 'Böen: Periode', hint: 'Ohne Angabe weht der Wind dauerhaft.' }),
      on: num('wind', 'on', 0.1, 11.5, { optional: true, default: 1.5, step: 0.1, unit: 's', label: 'Böen: Dauer', hint: 'Wie lange die Bö je Periode weht.' }),
      warn: num('wind', 'warn', 0, 1.5, { step: 0.1, unit: 's', label: 'Böen: Vorwarnung', hint: 'Kurz vor der Bö zeigt sich eine Vorwarnung.' }),
      phase: num('wind', 'phase', 0, 1, { default: 0, step: 0.05, label: 'Böen: Zeitversatz', hint: 'Verschiebt den Start im Takt, falls mehrere Windzonen nicht gleichzeitig böen sollen.' }),
    },
  },
  gravityZone: {
    label: 'Gravitationszone', category: 'movement', anchor: 'any',
    params: {
      w: int('gravityZone', 'w', 1, 40, { default: 4, unit: 'Tiles', label: 'Breite' }),
      h: int('gravityZone', 'h', 1, 40, { default: 6, unit: 'Tiles', label: 'Höhe', hint: 'Solange die Spielermitte hier drin ist, zeigt die Schwerkraft nach oben — Decke wird zum Boden.' }),
    },
  },
  portal: {
    label: 'Portal', category: 'movement', anchor: 'air',
    params: {
      id: { kind: 'id', required: true, label: 'Kennung', hint: 'Eigene Kennung dieses Portals.' },
      pair: { kind: 'id', required: true, label: 'Partner', hint: 'Kennung des anderen Portals, zu dem es führt — beide zeigen aufeinander.' },
    },
  },
  switch: {
    label: 'Schalter', category: 'logic', anchor: 'air',
    params: { channel: int('switch', 'channel', 0, CHANNELS - 1, { default: 0, label: 'Kanal', hint: 'Schaltet beim Berühren alle Farbblöcke desselben Kanals um.' }) },
  },
  colorBlock: {
    label: 'Farbblock', category: 'logic', anchor: 'air',
    params: {
      channel: int('colorBlock', 'channel', 0, CHANNELS - 1, { default: 0, label: 'Kanal', hint: 'Reagiert auf den Schalter mit demselben Kanal.' }),
      solidWhen: int('colorBlock', 'solidWhen', 0, 1, { default: 0, label: 'Fest bei Schalterstellung', hint: 'Fest, wenn der Kanal auf diesen Wert steht — sonst durchlässig. Wer drinsteht, wird nie eingemauert.' }),
    },
  },
  key: { label: 'Schlüssel', category: 'logic', anchor: 'air', params: {} },
  door: { label: 'Tür', category: 'logic', anchor: 'air', params: {} },
};

export const ELEMENT_TYPE_LIST = Object.keys(ELEMENT_SCHEMA);

/** Reihenfolge der Typen (für die kanonische Sortierung der Elemente) */
export const TYPE_ORDER = Object.fromEntries(ELEMENT_TYPE_LIST.map((t, i) => [t, i]));

export const PATH_LIMITS = Object.freeze({ minPoints: 2, maxPoints: 16, maxOffset: 200 });
export const ID_RE = /^[A-Za-z0-9:_-]{1,32}$/;

// Zehnerpotenzen als Tabelle: `**` ist nicht bitgleich festgelegt (siehe den Wächter in rng-trig.test.js)
const POW10 = [1, 10, 100, 1000];

/** Auf `digits` (0–3) Nachkommastellen runden; idempotent, und -0 wird zu 0 */
export const roundTo = (v, digits) => Math.round(v * POW10[digits]) / POW10[digits] + 0;

/**
 * Prüft die Parameter eines Elements und bringt sie in kanonische Form (siehe Kopf der Datei).
 *
 * @param {string} type
 * @param {object} spec  Element mit `type`, `tx`, `ty` und seinen Parametern
 * @returns {{ ok: true, clean: object } | { ok: false, errors: string[] }}  `clean` enthält nur die Parameter, nicht type/tx/ty
 */
export function normalizeParams(type, spec) {
  const schema = typeof type === 'string' && Object.hasOwn(ELEMENT_SCHEMA, type) ? ELEMENT_SCHEMA[type] : null;
  if (!schema) return { ok: false, errors: [`Unbekannter Element-Typ „${String(type)}“.`] };
  const errors = [];
  const clean = {};
  const label = schema.label;

  for (const key of Object.keys(spec)) {
    if (key === 'type' || key === 'tx' || key === 'ty') continue;
    // Object.hasOwn statt `in`: "__proto__" und "constructor" stecken in der Prototypkette und gälten sonst als bekannt
    if (!Object.hasOwn(schema.params, key)) errors.push(`${label}: Unbekannter Parameter „${key}“.`);
  }

  for (const [key, p] of Object.entries(schema.params)) {
    const raw = spec[key];
    const name = `${label} „${p.label || key}“`;

    if (raw === undefined) {
      if (p.required) errors.push(`${name} fehlt.`);
      else if (p.default !== undefined && !p.optional) clean[key] = p.default;
      continue;
    }

    if (p.kind === 'num') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) { errors.push(`${name} muss eine Zahl sein.`); continue; }
      if (p.int && !Number.isInteger(raw)) { errors.push(`${name} muss eine ganze Zahl sein.`); continue; }
      if (raw < p.min || raw > p.max) { errors.push(`${name} muss zwischen ${p.min} und ${p.max} liegen.`); continue; }
      clean[key] = p.int ? raw : roundTo(raw, 3);
    } else if (p.kind === 'enum') {
      if (!p.options.includes(raw)) { errors.push(`${name}: „${String(raw)}“ ist nicht erlaubt.`); continue; }
      clean[key] = raw;
    } else if (p.kind === 'bool') {
      if (typeof raw !== 'boolean') { errors.push(`${name} muss wahr oder falsch sein.`); continue; }
      clean[key] = raw;
    } else if (p.kind === 'id') {
      if (typeof raw !== 'string' || !ID_RE.test(raw)) { errors.push(`${name} muss aus 1–32 Buchstaben, Ziffern, „:“, „_“ oder „-“ bestehen.`); continue; }
      clean[key] = raw;
    } else if (p.kind === 'path') {
      if (!Array.isArray(raw) || raw.length < PATH_LIMITS.minPoints || raw.length > PATH_LIMITS.maxPoints) {
        errors.push(`${name} braucht ${PATH_LIMITS.minPoints}–${PATH_LIMITS.maxPoints} Punkte.`);
        continue;
      }
      const okPts = raw.every((pt) => Array.isArray(pt) && pt.length === 2
        && pt.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= PATH_LIMITS.maxOffset));
      if (!okPts) { errors.push(`${name}: Jeder Punkt braucht zwei Zahlen (Versatz in Tiles, höchstens ±${PATH_LIMITS.maxOffset}).`); continue; }
      clean[key] = raw.map(([dx, dy]) => [roundTo(dx, 2), roundTo(dy, 2)]);
    }
  }
  if (errors.length) return { ok: false, errors };

  // Abhängigkeiten zwischen Parametern
  if (type === 'saw') {
    if (clean.path && clean.orbit !== undefined) errors.push('Säge: Pfad und Kreisbahn schließen sich aus.');
    if (clean.path && (clean.path[0][0] !== 0 || clean.path[0][1] !== 0)) errors.push('Säge: Der Pfad beginnt bei der Säge selbst (erster Punkt 0, 0).');
    // Nur, was zur Bewegungsart gehört, bleibt im Inhalt
    if (clean.path) {
      delete clean.turnsPerSecond;
    } else if (clean.orbit !== undefined) {
      delete clean.speed;
    } else {
      delete clean.speed;
      delete clean.turnsPerSecond;
      delete clean.phase;
      delete clean.count;   // stehende Sägen lägen alle übereinander
    }
    if (clean.count === 1) delete clean.count;   // eine Säge ist der Normalfall, nicht Teil des Inhalts
  }
  if (type === 'spike') {
    if (clean.period === undefined) {
      // Dauerhafte Spikes: die Takt-Angaben sind bedeutungslos und dürfen den Inhalt nicht verändern
      if (clean.on !== undefined) errors.push('Spikes: „Ausgefahren“ braucht eine Periode.');
      delete clean.warn;
      delete clean.phase;
    } else {
      if (clean.on === undefined) clean.on = roundTo(clean.period / 2, 3);
      if (clean.on >= clean.period) errors.push('Spikes: Die ausgefahrene Zeit muss kürzer sein als die Periode.');
    }
  }
  if (type === 'laser') {
    if (clean.on >= clean.period) errors.push('Laser: Die Leuchtdauer muss kürzer sein als die Periode.');
    // Länge zählt nur beim drehenden Strahl; der feste endet ohnehin am ersten Block
    if (!clean.spin) {
      delete clean.spin;
      delete clean.reach;
    }
  }
  if (type === 'mover') {
    const first = clean.path[0];
    const last = clean.path[clean.path.length - 1];
    if (first[0] !== 0 || first[1] !== 0) errors.push('Bewegte Plattform: Der Pfad beginnt bei der Plattform selbst (erster Punkt 0, 0).');
    // Die Engine springt am Pfadende zum Anfang zurück — eine Kreisbahn muss sich deshalb selbst schließen
    if (clean.mode === 'loop' && (last[0] !== first[0] || last[1] !== first[1])) {
      errors.push('Bewegte Plattform: Eine Kreisbahn muss geschlossen sein (letzter Punkt = erster Punkt).');
    }
  }
  if (type === 'wind') {
    if (clean.period === undefined) {
      // Dauerwind: die Bö-Angaben sind bedeutungslos und dürfen den Inhalt nicht verändern
      if (clean.on !== undefined) errors.push('Windzone: „Böen: Dauer“ braucht eine Periode.');
      delete clean.warn;
      delete clean.phase;
    } else {
      if (clean.on === undefined) clean.on = roundTo(clean.period / 2, 3);
      if (clean.on >= clean.period) errors.push('Windzone: Die Dauer der Bö muss kürzer sein als die Periode.');
    }
  }
  if (type === 'portal' && clean.id === clean.pair) errors.push('Portal: Kennung und Partner müssen verschieden sein.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, clean };
}

/** Größe der Fläche, die ein Element ab seiner Ankerkachel nach rechts/unten einnimmt (in Tiles) */
export function footprintOf(type, params) {
  if (type === 'fallingBlock') return { w: params.width, h: params.height };
  if (type === 'wind' || type === 'gravityZone') return { w: params.w, h: params.h };
  if (type === 'mover') return { w: params.width, h: 1 };
  return { w: 1, h: 1 };
}
