// konto.js — adVentures am Konto; Regeln in kontoStand.js, Anbindung in ui/Shell.jsx, Spiegel in AdventureGame.jsx.
import { spielKonto } from "../../utils/spielKonto.js";
import { ADVENTURE_KONTO } from "./kontoStand.js";

export const adventureKonto = spielKonto("adventures", ADVENTURE_KONTO);
