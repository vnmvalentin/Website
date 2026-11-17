// konto.js — Seed Runners am Konto; Regeln in kontoStand.js, Anbindung in ui/GameShell.jsx.
import { spielKonto } from '../../utils/spielKonto.js';
import { SEED_RUNNERS_KONTO } from './kontoStand.js';

export const seedRunnersKonto = spielKonto('seed-runners', SEED_RUNNERS_KONTO);
