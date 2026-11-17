// laden/katalog.js — was es im Laden gibt (Ausbauplan unterstuetzer + kosmetik-laden).
//
// UNTERSTÜTZEN: Einmalbeitrag in einer der festen Höhen → Abzeichen „Unterstützer“ (konto/erfolge.js, Bereich
// „website“), auf Wunsch ein Platz auf der Dankesliste. Kein Spielvorteil.
//
// KOSMETIK (ANDOCKSTELLE für die Spiele-Spuren): nur Aussehen, nie Spielvorteile. Ein Spiel trägt hier seine Artikel
// ein und fragt beim Laden, ob ein Konto sie besitzt (Server: ladenDienst.besitzt(kontoId, id); Browser:
// GET /api/laden/besitz/:spiel). Eintrag:
//   { id: "ss-kartenruecken-mond", spiel: "sacrifice-and-sigils", name: { de, en }, text: { de, en },
//     preisCent: 199, bild: "/media/laden/ss-kartenruecken-mond.webp" }
//   - IDs nie umbenennen oder neu vergeben (Käufe hängen daran); Spiel-IDs aus analytics/spiele.js
//   - Preis zwischen 0,50 € und 20 €
//   - Clash-Royale-Inhalte bleiben gratis (Fan-Content-Regeln von Supercell) — Spiele mit „cr-“ sind gesperrt
'use strict';

const { SPIELE } = require('../analytics/spiele');

const UNTERSTUETZER_BETRAEGE = [300, 500, 1000, 2500]; // Cent

const ARTIKEL = [
  // Spur D, 18.11.2026 (Anschluss kosmetik-artikel). Je Design 1,99 € (Nutzerwahl). Die Spiele prüfen den Besitz über
  // Frontend/src/utils/ladenBesitz.js; welches Design zu welchem Artikel gehört, steht im Spiel:
  //   Flick Soccer  engine/skins.js (laden)      Worldflip + Spieleabend  Worldflip/skins.js (LADEN_HUETE)
  //   Blobby        Blobby/zier.js (laden)
  {
    id: 'fs-scheibe-pizza', spiel: 'flick-soccer', preisCent: 199, bild: '/media/laden/fs-scheibe-pizza.webp',
    name: { de: 'Pizza-Scheibe', en: 'Pizza disc' },
    text: { de: 'Flick Soccer: deine Scheiben als Pizza, mit Rand in deiner Teamfarbe. Sieht online auch dein Gegner.', en: 'Flick Soccer: your discs as pizzas, rimmed in your team colour. Your opponent sees it online too.' },
  },
  {
    id: 'fs-scheibe-sushi', spiel: 'flick-soccer', preisCent: 199, bild: '/media/laden/fs-scheibe-sushi.webp',
    name: { de: 'Sushi-Scheibe', en: 'Sushi disc' },
    text: { de: 'Flick Soccer: deine Scheiben als Maki, die Füllung in deiner Teamfarbe. Sieht online auch dein Gegner.', en: 'Flick Soccer: your discs as maki rolls, filled in your team colour. Your opponent sees it online too.' },
  },
  {
    id: 'wf-hut-krone', spiel: 'worldflip', preisCent: 199, bild: '/media/laden/wf-hut-krone.webp',
    name: { de: 'Königskrone', en: 'Royal crown' },
    text: { de: 'Hut für deinen Blob in Worldflip und am Spieleabend: Samt, Hermelin, Edelsteine. Die anderen am Tisch sehen ihn.', en: 'Hat for your blob in Worldflip and at game night: velvet, ermine, gems. Everyone at the table sees it.' },
  },
  {
    id: 'wf-hut-krake', spiel: 'worldflip', preisCent: 199, bild: '/media/laden/wf-hut-krake.webp',
    name: { de: 'Krake', en: 'Octopus' },
    text: { de: 'Hut für deinen Blob in Worldflip und am Spieleabend: eine kleine Krake, die mit den Armen wackelt.', en: 'Hat for your blob in Worldflip and at game night: a little octopus that wiggles its arms.' },
  },
  {
    id: 'bv-zier-sonnenbrille', spiel: 'blobby', preisCent: 199, bild: '/media/laden/bv-zier-sonnenbrille.webp',
    name: { de: 'Sonnenbrille', en: 'Sunglasses' },
    text: { de: 'Blobby Volley: Sportbrille für deinen Blob, im 2D-Feld und in 3D. Alle im Raum sehen sie.', en: 'Blobby Volley: sports shades for your blob, on the 2D court and in 3D. Everyone in the room sees them.' },
  },
  // Virtual Farm: Hüte für die eigene Figur (garden/core/reskins.js: laden; Freischalten am Server beim Laden der Farm)
  {
    id: 'gf-hut-erdbeere', spiel: 'garden', preisCent: 199, bild: '/media/laden/gf-hut-erdbeere.webp',
    name: { de: 'Erdbeermütze', en: 'Strawberry beanie' },
    text: { de: 'Virtual Farm: Strickmütze als Erdbeere für deine Figur. Die Nachbarn auf der Insel sehen sie. Die Farm spielst du mit Twitch-Anmeldung.', en: 'Virtual Farm: a knitted strawberry beanie for your character. Your island neighbours see it. The farm needs a Twitch login.' },
  },
  {
    id: 'gf-hut-imker', spiel: 'garden', preisCent: 199, bild: '/media/laden/gf-hut-imker.webp',
    name: { de: 'Imkerhut', en: 'Beekeeper hat' },
    text: { de: 'Virtual Farm: Imkerhut mit Schleier für deine Figur, eine Biene fliegt mit. Die Nachbarn sehen ihn. Die Farm spielst du mit Twitch-Anmeldung.', en: 'Virtual Farm: a beekeeper hat with veil for your character, with a bee buzzing along. Your neighbours see it. The farm needs a Twitch login.' },
  },
  {
    id: 'bv-zier-strohhut', spiel: 'blobby', preisCent: 199, bild: '/media/laden/bv-zier-strohhut.webp',
    name: { de: 'Strohhut', en: 'Straw hat' },
    text: { de: 'Blobby Volley: Strohhut mit rotem Band für deinen Blob, im 2D-Feld und in 3D. Alle im Raum sehen ihn.', en: 'Blobby Volley: straw hat with a red band for your blob, on the 2D court and in 3D. Everyone in the room sees it.' },
  },
];

// Je Spiel mit Designs: wie es im Laden heißt, wohin „Spiel öffnen“ führt und wo man ein gekauftes Design auswählt.
// Laden-Seite, Profil und die Glocke nach dem Kauf zeigen es. Spiele ohne Eintrag bekommen Name und Adresse aus
// analytics/spiele.js und keinen Hinweis. Wer im Spiel die Auswahl verlegt, passt `wo` hier mit an.
const SPIEL_INFO = {
  'flick-soccer': {
    pfad: '/flick-soccer',
    wo: { de: 'Auswählen in Flick Soccer: Profil → Designs.', en: 'Pick it in Flick Soccer: profile → designs.' },
  },
  worldflip: {
    name: { de: 'Worldflip & Spieleabend', en: 'Worldflip & game night' },
    pfad: '/worldflip',
    wo: { de: 'Auswählen beim Hut deines Blobs, in Worldflip und am Spieleabend.', en: "Pick it under your blob's hat, in Worldflip and at game night." },
  },
  blobby: {
    pfad: '/blobby',
    wo: { de: 'Auswählen in Blobby Volley: Menü, unter deinem Namen.', en: 'Pick it in Blobby Volley: menu, under your name.' },
  },
  garden: {
    pfad: '/garden',
    wo: { de: 'Auswählen auf der Farm: Gold-Shop → Hüte (mit Twitch-Anmeldung).', en: 'Pick it on the farm: gold shop → hats (needs a Twitch login).' },
  },
};

/** { name: { de, en }, pfad, wo: { de, en } | null } für ein Spiel mit Designs */
function spielInfo(spielId) {
  const s = SPIELE.find((x) => x.id === spielId);
  const i = SPIEL_INFO[spielId] || {};
  return {
    name: i.name || { de: s?.name || spielId, en: s?.name || spielId },
    pfad: i.pfad || s?.praefixe?.[0] || '/',
    wo: i.wo || null,
  };
}

const SPIEL_IDS = new Set(SPIELE.map((s) => s.id));
const ID_FORM = /^[a-z0-9][a-z0-9-]{2,63}$/;

/** Prüft einen Artikel; liefert eine Fehlerbeschreibung oder null */
function artikelFehler(a) {
  if (!a || !ID_FORM.test(a.id || '')) return 'id';
  if (!SPIEL_IDS.has(a.spiel)) return 'spiel';
  if (/^cr-/.test(a.spiel)) return 'clash-royale';
  if (!a.name?.de || !a.name?.en) return 'name';
  if (!Number.isInteger(a.preisCent) || a.preisCent < 50 || a.preisCent > 2000) return 'preis';
  return null;
}

/** Nur gültige Artikel (Fehler werden beim Start gemeldet statt verkauft) */
function gueltigeArtikel(liste = ARTIKEL, log = console) {
  const ids = new Set();
  return liste.filter((a) => {
    const f = artikelFehler(a) || (ids.has(a.id) ? 'doppelt' : null);
    if (f) { log.error?.(`[laden] Artikel ${a?.id || '?'} ungültig (${f}) — nicht im Laden`); return false; }
    ids.add(a.id);
    return true;
  });
}

module.exports = { UNTERSTUETZER_BETRAEGE, ARTIKEL, SPIEL_INFO, spielInfo, artikelFehler, gueltigeArtikel };
