// Quallen — Nesseln, Tintenwolke, zerbrechlich. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("quallen", [
  ["quallenpolyp", "Quallenpolyp", "s1", 0, 1, ["metamorphose"], "common", "Er sitzt still und träumt vom Treiben.", { evolvesTo: "ohrenqualle" }],
  ["glasqualle", "Glasqualle", "s1", 1, 1, ["treibgut"], "common", "Man sieht sie erst, wenn es brennt."],
  ["feuerqualle", "Feuerqualle", "s2", 1, 1, ["dornenkleid"], "common", "Wer sie berührt, vergisst es nicht."],
  ["kompassqualle", "Kompassqualle", "s2", 0, 3, ["tintenwolke"], "common", "Ihr Muster zeigt in alle Richtungen zugleich."],
  ["lungenqualle", "Lungenqualle", "s3", 1, 3, ["faeulnis"], "common", "Sie atmet, und das Wasser um sie wird schwer."],
  ["leuchtqualle", "Leuchtqualle", "s2", 1, 2, ["leuchtfeuer"], "common", "Ein Licht, das niemandem gehört."],
  ["seewespe", "Seewespe", "s4", 1, 2, ["todesstachel"], "uncommon", "Klein, fast unsichtbar, tödlich."],
  ["staatsqualle", "Staatsqualle", "s4", 1, 3, ["dornenkleid", "tintenwolke"], "uncommon", "Viele Tiere, ein Wille, ein Stich."],
  ["wurzelmundqualle", "Wurzelmundqualle", "b2", 2, 3, ["tintenwolke"], "uncommon", "Sie treibt dorthin, wo du gerade bist.", { tide: "high" }],
  ["loewenmaehne", "Löwenmähnenqualle", "s6", 2, 4, ["dornenkleid:2", "faeulnis"], "rare", "Ihre Fäden reichen weiter als dein Mut."],
  ["quallenkoenigin", "Die Quallenkönigin", "s7", 2, 5, ["todesstachel", "tintenwolke", "brut"], "legendary", "Sie teilt sich, und jede Hälfte will dich."],
  ["segelqualle", "Segelqualle", "s2", 1, 1, ["wattlaeufer"], "common", "Der Wind entscheidet, wohin sie treibt."],
  ["ohrenqualle", "Ohrenqualle", "s1", 1, 3, ["tintenwolke"], "common", "Vier Ringe, kein Gedanke.", { token: true }],
]);
