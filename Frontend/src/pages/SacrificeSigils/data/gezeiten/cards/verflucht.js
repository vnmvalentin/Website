// Verfluchte Karten des Gezeiten-Zirkels (Tintenwitwe, Wrack). Stark, aber mit Fluchmal.
import { defineCards } from "../../cards/_define.js";

export default defineCards("treibgut", [
  ["gz_klabautermann", "Klabautermann", "b1", 4, 3, ["fluchmal"], "rare", "Solange er an Bord ist, sinkt das Schiff nicht. Noch nicht.", { tribe: "wracks", cursed: true }],
  ["gz_sirene", "Sirene", "b1", 3, 2, ["schwinge", "fluchmal"], "rare", "Ihr Lied ist das Letzte, was man hört.", { tribe: "moewen", cursed: true }],
  ["gz_seeungeheuer", "Seeungeheuer", "b2", 5, 5, ["wucht", "fluchmal"], "rare", "Es war kein Riff. Es hat geatmet.", { tribe: "robben", cursed: true }],
  ["gz_ertrunkenerkoenig", "Ertrunkener König", "k2", 3, 3, ["heimkehr", "fluchmal"], "rare", "Seine Krone liegt am Grund. Er holt sie jede Flut.", { tribe: "ertrunkene", cursed: true }],
  ["gz_schwarzequalle", "Schwarze Qualle", "s1", 2, 3, ["todesstachel", "fluchmal"], "rare", "Tinte mit Nesseln.", { tribe: "quallen", cursed: true }],
  ["gz_blutkrake", "Blutkrake", "b1", 3, 4, ["tauchgang", "fluchmal"], "rare", "Wo sie war, ist das Wasser rot.", { tribe: "tiefseeleuchter", cursed: true }],
  ["gz_salzhexe", "Salzhexe", "s1", 3, 3, ["salzkruste", "fluchmal"], "rare", "Sie streut Salz in jede Wunde.", { tribe: "tangwesen", cursed: true }],
  ["gz_kraken", "Der Kraken", "b2", 3, 3, ["dreizack", "todesstachel", "fluchmal"], "rare", "Acht Arme, und jeder hat einen eigenen Willen.", { tribe: "raubfische", cursed: true }],
  ["gz_totenglocke", "Totenglocke", "b0", 3, 3, ["fluchmal"], "rare", "Sie läutet unter Wasser. Für dich.", { cursed: true }],
]);
