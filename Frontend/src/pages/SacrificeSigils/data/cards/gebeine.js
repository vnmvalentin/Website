// Gebeine — Skelettwesen, Grabhunde. Wiederkehr und Knochen-Motor.
import { defineCards } from "./_define.js";

export default defineCards("gebeine", [
  ["knochenknecht", "Knochenknecht", "k1", 0, 1, ["aschenspende"], "common", "Er dient. Er hat vergessen, wem."],
  ["knochenhaufen", "Knochenhaufen", "k2", 0, 2, ["nachgeburt"], "common", "Stoß ihn um, und er steht auf allen Vieren wieder auf.", { evolvesTo: "knochenhund" }],
  ["knochensammler", "Knochensammler", "k2", 1, 1, ["knochenmark"], "common", "In seinem Sack klappert die Ernte eines Winters."],
  ["knochenwall", "Knochenwall", "k3", 0, 4, [], "common", "Aus Rippen gebaut, von Rippen gehalten."],
  ["grabhund", "Grabhund", "k4", 2, 2, [], "common", "Er bewacht ein Grab, das längst leer ist."],
  ["gerippe", "Wandelndes Gerippe", "k5", 1, 1, ["wiedergaenger"], "common", "Einmal gestorben ist keinmal gestorben."],
  ["grabdachs", "Grabdachs", "k5", 2, 3, ["grabwuehler"], "common", "Er gräbt nach unten, wo die anderen schlafen."],
  ["schaedeltraeger", "Schädelträger", "k6", "knochenlast", 3, [], "uncommon", "Jeder Schädel an seiner Kette flüstert einen Namen."],
  ["sargwaechter", "Sargwächter", "k9", 2, 4, ["wiedergaenger"], "rare", "Er ist ins eigene Grab gestiegen, um es zu bewachen."],
  ["totentaenzer", "Totentänzer", "k6", 2, 2, ["zwillingsbiss"], "rare", "Die Glocke schlägt, und er tanzt zweimal."],
  ["abt", "Der Beinerne Abt", "k10", 3, 4, ["wiedergaenger", "leittier"], "legendary", "Er betet noch immer. Die Gebete haben jetzt Zähne."],
  ["knochenhund", "Knochenhund", "k2", 2, 2, [], "common", "Aus dem Haufen wurde ein Hund. Er apportiert sich selbst.", { token: true }],
]);
