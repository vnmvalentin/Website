// Korallen — Wachstum, Riff, Brut. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("korallen", [
  ["korallenpolyp", "Korallenpolyp", "s1", 0, 1, ["brut"], "common", "Wo einer siedelt, wächst ein Riff."],
  ["steinkoralle", "Steinkoralle", "s2", 0, 4, [], "common", "Ein Haus aus tausend Toten."],
  ["feuerkoralle", "Feuerkoralle", "s2", 0, 3, ["dornenkleid"], "common", "Sie brennt nicht, sie sticht."],
  ["seeanemone", "Seeanemone", "s4", 1, 2, ["todesstachel"], "uncommon", "Eine Blume, die zurückbeißt."],
  ["riffbauer", "Riffbauer", "s3", "riffzahl", 3, [], "common", "Je größer das Riff, desto stärker der Bauer."],
  ["hirnkoralle", "Hirnkoralle", "s3", 0, 4, ["seher", "salzader"], "common", "Sie denkt langsam, aber sie denkt an alles."],
  ["weichkoralle", "Weichkoralle", "s1", 0, 2, ["treibgut", "brut"], "common", "Sie wiegt sich, bis die Flut sie nimmt."],
  ["hornkoralle", "Hornkoralle", "s5", 2, 4, ["hochwuchs", "rudelruf"], "uncommon", "Ein Fächer, der die Strömung fängt."],
  ["riffwaechter", "Riffwächter", "s5", "riffzahl", 4, ["leibwaechter"], "uncommon", "Das Riff schützt ihn, er schützt das Riff."],
  ["schwammriff", "Schwammriff", "s5", 1, 6, ["moosheilung"], "rare", "Es saugt das Meer und heilt sich selbst."],
  ["grossesriff", "Das Große Riff", "s7", "riffzahl", 7, ["brut", "leittier"], "legendary", "Ein Tier so groß wie eine Stadt, und es wächst noch."],
  ["orgelkoralle", "Orgelkoralle", "b1", 1, 2, ["salzader"], "common", "Sie singt leise, wenn die Strömung durch sie zieht."],
]);
