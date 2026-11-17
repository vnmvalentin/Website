// konto.js — Worldflip am Konto; Regeln in kontoStand.js, Anbindung in ui/Shell.jsx, gezählt in components/EndPanel.jsx.
import { spielKonto } from "../../utils/spielKonto.js";
import { WORLDFLIP_KONTO } from "./kontoStand.js";

export const worldflipKonto = spielKonto("worldflip", WORLDFLIP_KONTO);
