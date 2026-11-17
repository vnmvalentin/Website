// konto.js — Flick Soccer am Konto; Regeln in kontoStand.js, Anbindung in ui/Shell.jsx.
import { spielKonto } from '../../utils/spielKonto.js';
import { FLICK_KONTO } from './kontoStand.js';

export const flickKonto = spielKonto('flick-soccer', FLICK_KONTO);
