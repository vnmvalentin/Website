// Wurzelvolk — knorrige Stümpfe, Dornsträucher. Mauern, Dornen, Regeneration. Wachs.
import { defineCards } from "./_define.js";

export default defineCards("wurzelvolk", [
  ["samenkapsel", "Samenkapsel", "w1", 0, 1, ["metamorphose"], "common", "Sie platzt, wenn niemand hinsieht.", { evolvesTo: "dornschoessling" }],
  ["dornspross", "Dornspross", "w1", 0, 2, [], "common", "Klein, grün und entschlossen, im Weg zu stehen."],
  ["knorrstumpf", "Knorrstumpf", "w2", 0, 4, [], "common", "Er war ein Baum. Jetzt ist er ein Vorwurf."],
  ["dornbusch", "Dornbusch", "w2", 0, 2, ["dornenkleid"], "common", "Er hält fest, was ihn berührt."],
  ["efeuwuerger", "Efeuwürger", "w4", 1, 2, ["aderlass"], "common", "Er umarmt die Kraft aus allem, woran er wächst."],
  ["moosschrat", "Moosschrat", "w4", 1, 3, ["moosheilung"], "common", "Jede Wunde wächst bei ihm grün zu."],
  ["wurzelwacht", "Wurzelwacht", "w3", 0, 3, ["hochwuchs", "leibwaechter"], "common", "Ihre Wurzeln reichen unter jede Lane."],
  ["dornvater", "Dornvater", "w5", 2, 3, ["dornenkleid"], "uncommon", "Er hat die Dornen nicht gewollt. Er hat sie gebraucht."],
  ["rindenhueter", "Rindenhüter", "w5", 1, 4, ["schildrinde"], "uncommon", "Die erste Axt prallt ab. Die zweite auch, meistens."],
  ["wurzelbrecher", "Wurzelbrecher", "w6", 3, 3, ["panzer"], "rare", "Er bricht aus dem Boden wie ein alter Streit."],
  ["weidenmutter", "Weidenmutter", "w6", 1, 5, ["moosheilung", "leittier"], "rare", "Sie weint in den Tümpel, und der Tümpel heilt."],
  ["dornschoessling", "Dornschössling", "w1", 2, 3, ["dornenkleid"], "common", "Aus der Kapsel wuchs ein Zaun mit Zähnen.", { token: true }],
]);
