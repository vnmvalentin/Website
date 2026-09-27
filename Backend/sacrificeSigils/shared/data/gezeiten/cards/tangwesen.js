// Tangwesen — Sog, Schlick, Kontrolle. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("tangwesen", [
  ["tangspross", "Tangspross", "s1", 0, 2, ["metamorphose"], "common", "Er wächst, wenn keiner hinsieht.", { evolvesTo: "blasentang" }],
  ["seegras", "Seegras", "b0", 0, 2, ["schlick"], "common", "Wer hier läuft, läuft langsam."],
  ["tangfaden", "Tangfaden", "s2", 1, 2, ["schlick"], "common", "Er greift nach allem, was vorbeikommt."],
  ["zottelalge", "Zottelalge", "b1", 1, 2, ["sog"], "common", "Zieht dich hinab, ganz sanft.", { tide: "high" }],
  ["kelpwaechter", "Kelpwächter", "s3", 1, 4, ["hochwuchs"], "common", "Die Wellen brechen, er nicht."],
  ["strudeltang", "Strudeltang", "s3", 1, 2, ["sog"], "common", "Im Kreis, im Kreis, hinunter."],
  ["netztang", "Netztang", "s5", 2, 3, ["schlick", "sog"], "uncommon", "Erst hält er fest, dann zieht er."],
  ["tanghexe", "Tanghexe", "s4", 2, 3, ["faeulnis"], "uncommon", "Sie flicht Kränze aus Ertrunkenem."],
  ["seetangriese", "Seetangriese", "b3", 3, 5, ["schlick"], "uncommon", "Ein Wald, der aufgestanden ist."],
  ["sargassum", "Sargassum", "s5", 1, 6, ["sog", "anker"], "rare", "Ein treibendes Land, das Schiffe frisst."],
  ["tangkrone", "Die Tangkrone", "s6", 3, 5, ["sog", "schlick", "leittier"], "legendary", "Wo sie treibt, bleibt nichts an seinem Platz.", { balanceNote: "Balancing 5000 Matches (Gezeiten): mit 7 Salz nur 46 % – Salz kommt langsam, deshalb 6." }],
  ["blasenkobold", "Blasenkobold", "b1", 2, 1, ["wattlaeufer"], "common", "Er hüpft von Pfütze zu Pfütze."],
  ["blasentang", "Blasentang", "s1", 1, 3, ["schlick"], "common", "Er platzt nicht. Er wartet.", { token: true }],
]);
