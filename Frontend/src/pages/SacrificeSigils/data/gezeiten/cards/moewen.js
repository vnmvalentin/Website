// Möwenschwärme — fliegend, klein, laut. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("moewen", [
  ["moewenkueken", "Möwenküken", "k1", 0, 1, ["metamorphose"], "common", "Laut, bevor es fliegen kann.", { evolvesTo: "silbermoewe" }],
  ["lachmoewe", "Lachmöwe", "b1", 1, 1, ["schwinge"], "common", "Sie lacht über jeden, der nicht fliegt."],
  ["strandlaeufer", "Strandläufer", "b1", 1, 1, ["wattlaeufer"], "common", "Rennt vor jeder Welle davon und kommt immer wieder."],
  ["seeschwalbe", "Seeschwalbe", "b1", 2, 1, ["vorpreschen"], "common", "Schneller als der Wind, der sie trägt."],
  ["diebesmoewe", "Diebesmöwe", "b2", 2, 2, ["schwinge"], "common", "Was du fallen lässt, gehört ihr."],
  ["sturmmoewe", "Sturmmöwe", "b2", 2, 2, ["schwinge", "brandung"], "uncommon", "Sie liebt das Wetter, das alle anderen fürchten.", { tide: "high" }],
  ["kormoran", "Kormoran", "b2", 2, 3, ["tauchgang"], "common", "Er fischt, wo andere ertrinken."],
  ["moewenschwarm", "Möwenschwarm", "b2", 1, 2, ["schwinge", "rudelruf"], "uncommon", "Einer schreit, alle kommen."],
  ["basstoelpel", "Basstölpel", "b3", 4, 2, ["schwinge"], "uncommon", "Er fällt wie ein Stein und trifft wie einer."],
  ["raubmoewe", "Raubmöwe", "b3", 3, 3, ["schwinge", "aderlass"], "rare", "Sie nimmt anderen den Fang aus dem Schnabel."],
  ["albatros", "Der Albatros", "b4", 4, 4, ["schwinge", "kundschafter", "leittier"], "legendary", "Wer ihn tötet, trägt ihn für immer."],
  ["sturmvogel", "Sturmvogel", "b1", 1, 2, ["schwinge"], "common", "Er kündigt an, was kommt.", { tide: "high" }],
  ["silbermoewe", "Silbermöwe", "b1", 1, 1, ["schwinge"], "common", "Grau, laut und überall.", { token: true }],
]);
