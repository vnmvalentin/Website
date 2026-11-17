// konto.js — Spieleabend am Konto; Regeln in kontoStand.js, Anbindung in ui/Shell.jsx, gezählt in Zimmer.jsx.
import { spielKonto } from "../../utils/spielKonto.js";
import { SPIELEABEND_KONTO } from "./kontoStand.js";

export const spieleabendKonto = spielKonto("spieleabend", SPIELEABEND_KONTO);
