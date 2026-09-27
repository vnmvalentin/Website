// Robben — robust, Tauchgang, Rudel. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("robben", [
  ["heuler", "Heuler", "b0", 0, 1, ["metamorphose"], "common", "Er ruft, bis jemand kommt.", { evolvesTo: "seehund" }],
  ["sandbankrobbe", "Sandbankrobbe", "b1", 1, 3, [], "common", "Liegt, döst und blockiert den Weg."],
  ["ringelrobbe", "Ringelrobbe", "b1", 1, 2, ["tauchgang"], "common", "Ein Kopf taucht auf, und weg ist er."],
  ["kegelrobbe", "Kegelrobbe", "b2", 2, 3, ["rudelruf"], "common", "Wo eine liegt, liegen bald zwanzig."],
  ["seeleopard", "Seeleopard", "b2", 3, 2, ["hinterhalt"], "uncommon", "Er wartet unter dem Eis, das es hier nicht gibt."],
  ["moenchsrobbe", "Mönchsrobbe", "b2", 2, 4, ["tauchgang"], "common", "Still, geduldig, schwer zu fassen."],
  ["walross", "Walross", "b3", 3, 5, ["wucht"], "uncommon", "Zwei Zähne, eine Meinung."],
  ["seeelefant", "See-Elefant", "b3", 4, 4, ["flutwelle"], "uncommon", "Er brüllt, und die Welle rollt über den Strand."],
  ["robbenmutter", "Robbenmutter", "b2", 1, 4, ["nesthueter", "rudelruf"], "uncommon", "Keines ihrer Jungen geht verloren."],
  ["bartrobbe", "Bartrobbe", "b1", 2, 2, ["brandung"], "common", "Sie liebt den Sturm und singt darin.", { tide: "high" }],
  ["seeloewe", "Seelöwe", "b3", 3, 4, ["rudelruf", "leittier"], "rare", "Der Lauteste führt. Er ist der Lauteste."],
  ["alterbulle", "Der Alte Bulle", "b4", 5, 6, ["tauchgang", "rudelruf"], "legendary", "Narben über Narben, und keine von hinten."],
  ["seehund", "Seehund", "b1", 2, 3, ["tauchgang"], "common", "Neugierig und nie ganz zu sehen.", { token: true }],
]);
