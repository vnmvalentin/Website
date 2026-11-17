// konto.js — Lights Out am Konto; Regeln in kontoStand.js, Anbindung in LightsOut.jsx.
import { spielKonto } from '../../utils/spielKonto.js';
import { LIGHTS_OUT_KONTO } from './kontoStand.js';

export const lightsOutKonto = spielKonto('lights-out', LIGHTS_OUT_KONTO);
