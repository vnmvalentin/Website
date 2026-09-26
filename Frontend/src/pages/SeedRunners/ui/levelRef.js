// levelRef.js — Welches Level ist gemeint? Eine Referenz für Sterne, Favoriten und die Rundenauswahl.
//
//   { kind: 'custom', code }         ein veröffentlichtes Level (Share-Code)
//   { kind: 'pfad', seed, biome, gv } ein Zufallslevel des Pfad-Generators — derselbe Seed mit demselben Biom und derselben
//                                    Generator-Version (gv, gen/generator.js) ergibt überall dasselbe Level (lang, „super“);
//                                    passt zum Server (Backend/seedRunners/levelService.js)
//
// Alte Chunk-Level (vor Phase D) haben keine Referenz: Sie werden nicht mehr erzeugt und sind nicht bewertbar.
import { LEITIDEEN } from '../gen/world/pfad/leitideen.js';
import { BIOMES } from '../gen/biomes.js';

/** Referenz zu Runden-Parametern (Lobby-Runde, Tagesrennen); null bei alten Chunk-Leveln */
export function refForParams(params) {
  if (!params || params.gen !== 'pfad' || params.seed === undefined || params.seed === null) return null;
  return { kind: 'pfad', seed: String(params.seed), biome: params.biome || 'random', gv: params.gv ?? 1 };
}

/** Referenz zu einer Raum-Runde (state.round) */
export function refForRound(round) {
  if (!round) return null;
  if (round.kind === 'custom' && round.custom?.code) return { kind: 'custom', code: round.custom.code };
  return refForParams(round.params);
}

/** Derselbe Schlüssel wie auf dem Server ('c:<Code>' / 'p<gv>:<Biom>:<Seed>') — zum Vergleichen und als React-Key */
export function refKey(ref) {
  if (!ref) return '';
  return ref.kind === 'custom' ? `c:${ref.code}` : `p${ref.gv ?? 1}:${ref.biome}:${ref.seed}`;
}

/** Runden-Parameter zu einer Zufalls-Referenz (für die Vorschau und das Vorbauen) */
export function paramsForRef(ref) {
  if (!ref || ref.kind !== 'pfad') return null;
  return { seed: ref.seed, length: 'long', speedClass: 'super', biome: ref.biome, gen: 'pfad', gv: ref.gv ?? 1 };
}

// Anzeige-Namen der Autoren (gen/world/pfad/handschrift.js: THEMEN)
export const AUTOR_NAMEN = Object.freeze({
  allrounder: 'Allrounder',
  klassiker: 'Klassiker',
  praezision: 'Präzision',
  faehrmann: 'Fährmann',
  windlaeufer: 'Windläufer',
  uhrwerk: 'Uhrwerk',
  kletterer: 'Kletterer',
  akrobat: 'Akrobat',
  seiltaenzer: 'Seiltänzer',
  tueftler: 'Tüftler',
  flitzer: 'Flitzer',
});

export const leitideeName = (id) => (id && LEITIDEEN[id] ? LEITIDEEN[id].name : null);
export const autorName = (id) => (id ? AUTOR_NAMEN[id] || id : null);
export const biomeName = (id) => (id === 'random' ? 'Zufälliges Biom' : BIOMES[id]?.label || id);
/** Untertitel eines Zufallslevels: der Seed, ein fest gewähltes Biom dazu (ein zufälliges ist keine Information) */
export const seedLine = (seed, biome) => `Seed ${seed}${biome && biome !== 'random' ? ` · ${biomeName(biome)}` : ''}`;

/** Was ein Browser zu einem Zufallslevel als Favoriten-Info mitschickt: Kennungen aus den Level-Angaben */
export function infoFromLevel(level) {
  const meta = level?.meta || {};
  const out = {};
  const idee = typeof meta.leitidee === 'string' ? meta.leitidee : meta.leitidee?.id;
  if (idee) out.leitidee = idee;
  if (typeof meta.autor === 'string') out.autor = meta.autor;
  return out;
}

/** Eine Zeile Titel für ein Zufallslevel: „Seilakt · Akrobat“ oder „Zufallslevel“ */
export function randomTitle(info) {
  const parts = [leitideeName(info?.leitidee), autorName(info?.autor)].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Zufallslevel';
}

/** Schlüssel eines Playlist-Eintrags der Lobby ({ kind: 'custom', code } / { kind: 'seed', seed, biome }) — wie refKey */
export const entryKey = (e) => (e.kind === 'custom' ? `c:${e.code}` : e.kind === 'seed' ? `p${e.gv ?? 1}:${e.biome}:${e.seed}` : '');

/**
 * Aus einem Listeneintrag der Level-Auswahl (Favorit, Bestenliste: { ref, level?, info? }; Community-Karte: das Level selbst mit
 * `code`) wird { entry, label }: der Playlist-Eintrag für den Server und was die Lobby dazu anzeigt.
 */
export function pickOf(item) {
  if (item.level || item.code || item.ref?.kind === 'custom') {
    const l = item.level || item;
    return { entry: { kind: 'custom', code: l.code }, label: { title: l.name, sub: `von ${l.creator?.name || '?'}`, biome: l.biome } };
  }
  const { seed, biome, gv = 1 } = item.ref;
  return { entry: { kind: 'seed', seed, biome, gv }, label: { title: randomTitle(item.info), sub: seedLine(seed, biome), biome } };
}
