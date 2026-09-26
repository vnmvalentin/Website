// Entwürfe im Browser: mehrere Level, die der Editor selbst speichert (localStorage). Nichts davon verlässt den
// Browser, bis ein Level veröffentlicht wird.
//
// Speicherformat: ein Index (Liste der Entwürfe mit Name, Größe, Zeit) und je Entwurf ein Eintrag mit dem Dokument,
// dessen Raster lauflängenkodiert ist (rle.js) — sonst füllten wenige große Level die rund 5 MB des Browsers.
//
// localStorage kann fehlen oder überlaufen (privates Fenster, gesperrte Daten, voller Speicher): Jeder Zugriff
// ist abgesichert, der Editor läuft dann ohne Speichern weiter und sagt es (`ok: false`).

import { encodeTiles, decodeTiles } from './rle.js';
import { LIMITS } from '../level/limits.js';

const INDEX_KEY = 'srDrafts:v1';
const docKey = (id) => `srDraft:${id}`;
const verKey = (id) => `srDraftVer:${id}`;
const pubKey = (id) => `srDraftPub:${id}`;
export const MAX_DRAFTS = 30;

/** localStorage, falls benutzbar; sonst ein Speicher im Arbeitsspeicher (überlebt keinen Neustart) */
export function browserStorage() {
  try {
    const probe = '__sr_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function readJson(storage, key) {
  try {
    const text = storage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function summary(id, doc, updatedAt, hash) {
  return {
    id,
    // Inhalts-Hash des Spielinhalts (null, solange das Level ungültig ist): So sieht die Liste ohne Rechnen, ob die
    // gemerkte Verifizierung noch zum Entwurf passt
    hash: hash || null,
    name: doc.meta?.name || '',
    updatedAt,
    width: doc.width,
    height: doc.height,
    elements: doc.elements.length,
    speedClass: doc.speedClass,
    biome: doc.meta?.biome || 'meadow',
  };
}

/**
 * @param {{ getItem: Function, setItem: Function, removeItem: Function }} storage
 * @param {() => number} [now]
 */
export function createDraftStore(storage, now = Date.now) {
  const readIndex = () => {
    const list = readJson(storage, INDEX_KEY);
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : [];
  };
  const writeIndex = (list) => {
    try {
      storage.setItem(INDEX_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  };

  return {
    /** Alle Entwürfe, der zuletzt bearbeitete zuerst */
    list() {
      return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
    },

    /** @returns {object | null}  das Dokument, oder null wenn es fehlt oder beschädigt ist */
    load(id) {
      const raw = readJson(storage, docKey(id));
      if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.width) || !Number.isInteger(raw.height)) return null;
      if (raw.width > LIMITS.maxWidth || raw.height > LIMITS.maxHeight) return null;
      const tiles = decodeTiles(raw.tiles, raw.width, raw.height);
      if (!tiles || !Array.isArray(raw.elements)) return null;
      return { ...raw, tiles };
    },

    /**
     * Speichert (oder legt an, wenn `id` fehlt). Der Index wird nur aktualisiert, wenn das Dokument angekommen ist.
     * `hash`: Inhalts-Hash des Dokuments, falls bekannt (für die Anzeige "verifiziert" in der Liste).
     * @returns {{ ok: true, id: string } | { ok: false, error: string }}
     */
    save(id, doc, hash) {
      const isNew = !id || !readIndex().some((e) => e.id === id);
      if (isNew && readIndex().length >= MAX_DRAFTS) return { ok: false, error: `Höchstens ${MAX_DRAFTS} Entwürfe — lösche einen alten.` };
      const key = id || newId();
      try {
        storage.setItem(docKey(key), JSON.stringify({ ...doc, tiles: encodeTiles(doc.tiles) }));
      } catch {
        return { ok: false, error: 'Der Browser-Speicher ist voll oder gesperrt. Das Level wird nicht gespeichert.' };
      }
      const index = readIndex().filter((e) => e.id !== key);
      index.push(summary(key, doc, now(), hash));
      if (!writeIndex(index)) return { ok: false, error: 'Der Browser-Speicher ist voll oder gesperrt. Das Level wird nicht gespeichert.' };
      return { ok: true, id: key };
    },

    /**
     * Die zuletzt bestätigte Verifizierung dieses Entwurfs: { hash, ticks, deaths, verifiedAt } oder null. Nur ein
     * Merker für die Anzeige — maßgeblich ist der Server; beim Veröffentlichen zählt seine Prüfung.
     */
    getVerification(id) {
      const v = readJson(storage, verKey(id));
      return v && typeof v.hash === 'string' && Number.isInteger(v.ticks) ? v : null;
    },

    setVerification(id, v) {
      try {
        storage.setItem(verKey(id), JSON.stringify({ hash: v.hash, ticks: v.ticks, deaths: v.deaths ?? 0, verifiedAt: v.verifiedAt ?? now() }));
      } catch { /* nur eine Anzeige: ohne Speicher eben ohne Merker */ }
    },

    /**
     * Die zuletzt veröffentlichte Fassung dieses Entwurfs: { code, hash, publishedAt } oder null. Ein Merker für die Anzeige
     * ("Veröffentlicht als SR-…"); das Level selbst liegt auf dem Server und ist von späteren Änderungen am Entwurf unberührt.
     */
    getPublished(id) {
      const p = readJson(storage, pubKey(id));
      return p && typeof p.code === 'string' && typeof p.hash === 'string' ? p : null;
    },

    setPublished(id, p) {
      try {
        storage.setItem(pubKey(id), JSON.stringify({ code: p.code, hash: p.hash, publishedAt: p.publishedAt ?? now() }));
      } catch { /* nur eine Anzeige */ }
    },

    remove(id) {
      try {
        storage.removeItem(docKey(id));
        storage.removeItem(verKey(id));
        storage.removeItem(pubKey(id));
      } catch { /* ignorieren */ }
      writeIndex(readIndex().filter((e) => e.id !== id));
    },

    /** Kopie unter neuem Namen; liefert die neue ID oder null */
    duplicate(id) {
      const doc = this.load(id);
      if (!doc) return null;
      const copy = { ...doc, meta: { ...doc.meta, name: doc.meta?.name ? `${doc.meta.name} (Kopie)`.slice(0, LIMITS.nameMax) : '' } };
      const res = this.save(null, copy);
      return res.ok ? res.id : null;
    },
  };
}
