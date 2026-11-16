// Blobby im Admin-Reiter „Spiele“: die Brücke im Hauptprozess (blobby/statistikBruecke.js).   npm test -- blobby
const test = require('node:test');
const assert = require('node:assert/strict');
const stat = require('../../lib/spielStatistik');
const { _intern: b } = require('../statistikBruecke');

test('Zuwachs der Partien: normal, nach Neustart des Blobby-Prozesses, mit Deckel', () => {
  assert.equal(b.zuwachs(10, 13), 3);
  assert.equal(b.zuwachs(10, 10), 0);
  assert.equal(b.zuwachs(40, 2), 2, 'neu gestartet: der ganze neue Stand zählt');
  assert.equal(b.zuwachs(0, 99999), 1000);
  assert.equal(b.zuwachs(5, NaN), 0);
});

test('Erster Stand wird nur gemerkt, danach zählt der Zuwachs; veraltet liefert keinen Wert', () => {
  const gezaehlt = [];
  stat.verbindePartienSpeicher((spiel) => { gezaehlt.push(spiel); });
  b.zuruecksetzen();
  try {
    assert.throws(() => b.lieferung(), /antwortet nicht/);
    assert.equal(b.uebernehme({ rooms: 2, spieler: 3, partien: 50 }, 1000), 0, 'Partien vor dem Start des Hauptprozesses zählen nicht');
    assert.deepEqual(b.lieferung(1000), { raeume: 2, spieler: 3 });
    assert.equal(b.uebernehme({ rooms: 1, spieler: 2, partien: 52 }, 31000), 2);
    assert.deepEqual(gezaehlt, ['blobby', 'blobby']);
    assert.throws(() => b.lieferung(31000 + 91000), /antwortet nicht/, 'nach drei verpassten Abfragen kein alter Stand');
  } finally {
    stat.verbindePartienSpeicher(null);
    b.zuruecksetzen();
  }
});
