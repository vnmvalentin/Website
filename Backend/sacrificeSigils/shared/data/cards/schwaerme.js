// Schwärme — Ameisen, Wespen, Käfer. Viele kleine Körper, Stärke nach Anzahl.
import { defineCards } from "./_define.js";

export default defineCards("schwaerme", [
  ["larvenknaeuel", "Larvenknäuel", "k1", 0, 2, ["metamorphose"], "common", "Es zuckt, es wartet, es wird Flügel haben.", { evolvesTo: "goldwespe" }],
  ["wachsameise", "Wachsameise", "w1", 1, 1, [], "common", "Sie trägt Tropfen von Kerzen, die niemand mehr anzündet."],
  ["heerameise", "Heerameise", "b1", "schwarmzahl", 1, [], "common", "Eine ist nichts. Hundert sind ein Fluss."],
  ["mistkaefer", "Mistkäfer", "w2", 1, 2, ["rammbock"], "common", "Er rollt die Welt vor sich her und fragt nicht, wohin."],
  ["panzerkaefer", "Panzerkäfer", "w3", 0, 3, ["panzer"], "common", "Sein Rücken hat Hagel, Hufe und Hämmer gesehen."],
  ["wespenschwarm", "Wespenschwarm", "b2", "schwarmzahl", 2, ["schwinge"], "uncommon", "Das Summen kommt vor dem Schmerz."],
  ["saebelkaefer", "Säbelkäfer", "b2", 3, 2, [], "common", "Seine Zangen klappern wie Scheren im Dunkeln."],
  ["brutkoenigin", "Brutkönigin", "b2", 1, 3, ["brut"], "uncommon", "Sie spricht nie. Sie legt."],
  ["stachelwespe", "Stachelwespe", "b1", 1, 1, ["todesstachel"], "uncommon", "Ein Stich. Mehr braucht es nicht."],
  ["termitenhuegel", "Termitenhügel", "w4", 0, 5, ["brut"], "uncommon", "Ein Berg aus Speichel und Geduld."],
  ["schwarmkoenigin", "Schwarmkönigin", "b3", "schwarmzahl", 4, ["brut", "leittier"], "rare", "Jeder Schlag ihrer Flügel ist ein Befehl an tausend."],
  ["goldwespe", "Goldwespe", "b1", 1, 1, ["schwinge"], "common", "Sie glänzt wie ein Versprechen, das sticht.", { token: true }],
]);
