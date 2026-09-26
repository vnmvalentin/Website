// Kriecher — Nattern, Echsen, Kröten. Gift, Häutung, Ausweichen. Knochen.
import { defineCards } from "./_define.js";

export default defineCards("kriecher", [
  ["froschlaich", "Froschlaich", "k1", 0, 1, ["metamorphose"], "common", "Hundert Augen in einer Schale aus Schleim.", { evolvesTo: "moorfrosch" }],
  ["moorunke", "Moorunke", "k1", 0, 2, [], "common", "Ihr Ruf klingt wie eine Glocke unter Wasser."],
  ["flinkechse", "Flinkechse", "k2", 1, 1, ["fluchtreflex"], "common", "Sie lässt dir ihren Schwanz. Behalt ihn."],
  ["grauechse", "Grauechse", "k3", 1, 2, ["haeutung"], "common", "Sie trägt ihre alte Haut wie einen Umhang, den sie jederzeit ablegt."],
  ["warzenkroete", "Warzenkröte", "k3", 0, 3, ["dornenkleid"], "common", "Hässlich, giftig und sehr zufrieden damit."],
  ["aschnatter", "Aschnatter", "k5", 1, 2, ["todesstachel"], "common", "Grau wie kalte Glut, und genauso trügerisch."],
  ["schlingnatter", "Schlingnatter", "k5", 3, 2, [], "uncommon", "Sie umarmt, bis nichts mehr atmet."],
  ["nebelsalamander", "Nebelsalamander", "k5", 2, 2, ["nesthueter"], "uncommon", "Er kriecht aus dem Feuer, als wäre es Regen."],
  ["giftschleicher", "Giftschleicher", "k6", 1, 3, ["stinkdruese", "faeulnis"], "uncommon", "Er vergiftet die Luft, dann die Wunde."],
  ["kreuzotter", "Kreuzotter", "k8", 2, 3, ["todesstachel"], "uncommon", "Das Kreuz auf ihrem Rücken ist kein Segen."],
  ["vielhaeutige", "Die Vielhäutige", "k10", 3, 3, ["haeutung", "todesstachel"], "rare", "Sie war schon hundert Schlangen. Keine davon ist gestorben."],
  ["moorfrosch", "Moorfrosch", "k1", 1, 2, ["fluchtreflex"], "common", "Er springt, bevor du weißt, dass du nach ihm greifst.", { token: true }],
]);
