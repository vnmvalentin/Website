// Ertrunkene — kehren mit der Flut zurück (Heimkehr), Knochen. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("ertrunkene", [
  ["wasserleiche", "Wasserleiche", "k1", 0, 1, ["heimkehr"], "common", "Sie treibt immer wieder an denselben Strand."],
  ["ertrunkenerfischer", "Ertrunkener Fischer", "k2", 1, 1, ["heimkehr"], "common", "Er holt noch Netze ein, die längst verrottet sind."],
  ["schiffsjunge", "Bleicher Schiffsjunge", "k3", 1, 2, ["strandgut"], "common", "Er bringt mit, was das Wasser ihm gab."],
  ["nebelmatrose", "Nebelmatrose", "k5", 2, 2, ["heimkehr"], "common", "Die Mannschaft vermisst ihn nicht. Er kommt ja wieder."],
  ["tangleiche", "Tangleiche", "k3", 0, 4, ["schlick"], "common", "Im Haar hängt noch der Grund."],
  ["lotsengeist", "Lotsengeist", "k2", 1, 2, ["seher"], "common", "Er kennt den Weg. Er hat ihn nur einmal verfehlt."],
  ["glockentaucher", "Glockentaucher", "k6", 2, 3, ["tauchgang"], "uncommon", "Er läutet unten, wo es keiner hört."],
  ["ertrunkenebraut", "Ertrunkene Braut", "k7", 2, 3, ["heimkehr", "rachsucht"], "uncommon", "Ihr Kranz ist aus Seegras. Sie wartet am Kai."],
  ["kielholer", "Kielholer", "k6", 3, 2, ["wucht"], "uncommon", "Er zieht, was er fasst, unter den Rumpf."],
  ["kapitaenderflut", "Kapitän der Flut", "k9", 3, 3, ["heimkehr", "leittier"], "rare", "Sein Schiff sank. Sein Befehl nicht."],
  ["knochenkahn", "Knochenkahn", "k7", 2, 4, ["brut"], "rare", "Wer an Bord geht, kommt als Mannschaft zurück."],
  ["meermutter", "Die Meermutter", "k10", 3, 4, ["heimkehr", "wiedergaenger"], "legendary", "Das Meer gibt nichts zurück. Außer ihr."],
]);
