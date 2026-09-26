// Bausteine der Editor-Tests.
import { emptyDoc as makeEmptyDoc } from '../../level/format.js';
import { validateDoc } from '../../level/validate.js';

/** Frisches Startdokument (60 × 30, Start bei 2|25, Ziel bei 57|25) */
export const emptyDoc = (opts) => makeEmptyDoc(opts);

/** Strenge Prüfung ohne Rauchtest — schnell genug für viele Schritte */
export const validateDocForTest = (doc) => validateDoc(doc, { smoke: false });
