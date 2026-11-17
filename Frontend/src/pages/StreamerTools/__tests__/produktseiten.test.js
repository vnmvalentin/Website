// Produktseiten /tools/win-tracker, /tools/win-challenge, /tools/twitch-overlays: Texte vollständig in beiden Sprachen,
// Aufbau wie versprochen (drei Schritte, Fragen), Längen für die Suchergebnisse, Routen, Vorrendern und Sitemap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { missingKeys } from '../../../i18n/core.js';
import { PRODUCT_TEXTS, PRODUCT_IDS, PRODUCT_META, productPath, withLang, buildProductJsonLd } from '../productTexts.js';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const de = PRODUCT_TEXTS.dict('de');
const en = PRODUCT_TEXTS.dict('en');

test('Texte: Englisch und Deutsch haben dieselben Schlüssel und gleich lange Listen', () => {
  assert.deepEqual(PRODUCT_TEXTS.langs, ['de', 'en']);
  assert.deepEqual(missingKeys(de, en), []);
  assert.deepEqual(missingKeys(en, de), []);
  assert.deepEqual(Object.keys(de.products), PRODUCT_IDS);
});

test('Aufbau: drei Schritte, sechs Funktionen, mindestens fünf Fragen je Produkt', () => {
  for (const lang of ['de', 'en']) {
    for (const id of PRODUCT_IDS) {
      const p = PRODUCT_TEXTS.dict(lang).products[id];
      assert.equal(p.steps.length, 3, `${lang}/${id}: Schritte`);
      assert.equal(p.features.length, 6, `${lang}/${id}: Funktionen`);
      assert.ok(p.faq.length >= 5, `${lang}/${id}: Fragen`);
      for (const f of p.faq) assert.ok(f.q.endsWith('?') && f.a.length > 40, `${lang}/${id}: ${f.q}`);
    }
  }
});

test('Suche: Titel und Beschreibung passen in die Ergebnisse', () => {
  for (const lang of ['de', 'en']) {
    for (const id of PRODUCT_IDS) {
      const p = PRODUCT_TEXTS.dict(lang).products[id];
      // " - vnmvalentin" hängt die Seite an; Google zeigt rund 60 Zeichen
      assert.ok(p.seoTitle.length <= 46, `${lang}/${id}: Titel ${p.seoTitle.length}`);
      assert.ok(p.description.length >= 100 && p.description.length <= 160, `${lang}/${id}: Beschreibung ${p.description.length}`);
    }
  }
  const titles = PRODUCT_IDS.flatMap((id) => [de.products[id].seoTitle, en.products[id].seoTitle]);
  assert.equal(new Set(titles).size, titles.length, 'jeder Titel nur einmal');
});

test('Strukturierte Daten folgen der Sprache und dem sichtbaren Text', () => {
  const ld = buildProductJsonLd('win-tracker', 'en');
  assert.equal(ld[0].url, 'https://vnmvalentin.de/tools/win-tracker?lang=en');
  assert.equal(ld[0].inLanguage, 'en');
  assert.deepEqual(ld[0].featureList, en.products['win-tracker'].features.map((f) => f.title));
  assert.equal(ld[2].mainEntity.length, en.products['win-tracker'].faq.length);
  assert.equal(ld[2].mainEntity[0].name, en.products['win-tracker'].faq[0].q);
  assert.equal(buildProductJsonLd('twitch-overlays', 'de')[1].itemListElement[2].item, 'https://vnmvalentin.de/tools/twitch-overlays');
});

test('Adressen: Sprache im Link, Werkzeuge und Galerie-Reiter gibt es', () => {
  assert.equal(withLang('/twitch-tools', 'en'), '/twitch-tools?lang=en');
  assert.equal(withLang('/twitch-tools', 'de'), '/twitch-tools');
  assert.equal(withLang('/tools/vorlagen?reiter=twitch', 'en'), '/tools/vorlagen?reiter=twitch&lang=en');
  const app = read('../../../App.jsx');
  const gallery = read('../OverlayGalleryPage.jsx');
  const pre = read('../../../../prerender.js');
  for (const id of PRODUCT_IDS) {
    assert.ok(app.includes(`path="tools/${id}" element={<ProductPage id="${id}" />}`), `Route ${id}`);
    // Die Werkzeuge selbst sind öffentliche, vorgerenderte Seiten — der Knopf „Einrichten“ führt also nie ins Leere
    assert.ok(pre.includes(`'${PRODUCT_META[id].tool}'`), `Werkzeug ${PRODUCT_META[id].tool}`);
    assert.ok(gallery.includes(`id: "${PRODUCT_META[id].gallery}"`), `Galerie-Reiter ${PRODUCT_META[id].gallery}`);
    assert.ok(fs.existsSync(new URL(`../../../../public${PRODUCT_META[id].image}`, import.meta.url)), `Bild ${PRODUCT_META[id].image}`);
  }
});

test('Vorrendern und Sitemap: jede Produktseite steht drin, samt englischer Fassung', () => {
  const pre = read('../../../../prerender.js');
  const rule = pre.match(/\{ re: (\/\^\\\/tools.*?\/), priority/);
  assert.ok(rule, 'Sitemap-Regel für /tools/…');
  // eslint-disable-next-line no-eval
  const re = eval(rule[1]);
  for (const id of PRODUCT_IDS) {
    assert.ok(pre.includes(`'${productPath(id)}'`), `Vorrendern ${id}`);
    assert.ok(re.test(productPath(id)), `Sitemap ${id}`);
  }
  assert.equal(re.test('/tools/vorlagen'), false, 'die Galerie kann kein ?lang=en');
});
