// Wrackgeister — Anker, Strandgut, Konstrukte aus Schiffsteilen. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("wracks", [
  ["planke", "Treibende Planke", "k1", 0, 2, ["strandgut"], "common", "Sie war einmal ein Schiff. Jetzt ist sie ein Versprechen."],
  ["rostanker", "Rostanker", "k3", 1, 3, ["anker"], "common", "Er hält, auch wenn keiner ihn mehr braucht."],
  ["galionsfigur", "Galionsfigur", "k5", 1, 3, ["leittier"], "common", "Sie sieht voraus, auch mit abgeschlagener Nase."],
  ["schiffsglocke", "Schiffsglocke", "k2", 0, 3, ["glockenschlag"], "common", "Sie läutet noch einmal, für alle."],
  ["kanone", "Rostige Kanone", "k5", 3, 1, ["durchbohren"], "common", "Ein Schuss ist noch drin."],
  ["taucherhelm", "Leerer Taucherhelm", "k5", 1, 2, ["tauchgang", "heimkehr"], "common", "Drinnen atmet noch etwas."],
  ["schatztruhe", "Schatztruhe", "k4", 0, 4, ["perle", "strandgut"], "uncommon", "Das Gold ist weg. Der Fluch nicht."],
  ["kompass", "Zerbrochener Kompass", "k2", 0, 2, ["seher", "flaschenpost"], "common", "Er zeigt nicht nach Norden. Er zeigt auf dich."],
  ["wrackgolem", "Wrackgolem", "k10", 3, 5, ["panzer"], "uncommon", "Aus Planken, Nägeln und dem Groll der Mannschaft."],
  ["geisterschiff", "Das Geisterschiff", "k9", 3, 4, ["brut", "heimkehr"], "rare", "Es legt jede Flut an. Nie mit derselben Mannschaft."],
  ["schiffbrecher", "Der Schiffbrecher", "k10", 4, 5, ["rammbock", "wucht", "anker"], "legendary", "Er war der Fels, an dem sie alle zerschellten."],
  ["buddelschiff", "Buddelschiff", "k1", 0, 1, ["flaschenpost"], "common", "Eine ganze Reise in einer Flasche."],
]);
