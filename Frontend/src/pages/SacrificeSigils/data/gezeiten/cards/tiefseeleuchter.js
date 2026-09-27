// Tiefseeleuchter — Licht in der Tiefe: Leuchtfeuer, Köder, Knochen. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("tiefseeleuchter", [
  ["laternenlarve", "Laternenlarve", "k1", 0, 1, ["metamorphose"], "common", "Ein Funke in der Schwärze.", { evolvesTo: "laternenfisch" }],
  ["glimmfisch", "Glimmfisch", "k2", 1, 1, ["leuchtfeuer"], "common", "Er leuchtet, weil er nicht anders kann."],
  ["anglerfisch", "Anglerfisch", "k5", 2, 3, ["koeder"], "common", "Das Licht ist freundlich. Der Rest nicht."],
  ["viperfisch", "Viperfisch", "k4", 1, 1, ["todesstachel"], "uncommon", "Seine Zähne passen nicht in sein Maul."],
  ["beilfisch", "Beilfisch", "k3", 1, 2, ["tauchgang"], "common", "Schmal wie ein Messer, silbern wie eins."],
  ["pelikanaal", "Pelikanaal", "k5", 2, 3, ["hunger"], "common", "Ein Maul mit einem Aal dran."],
  ["tiefseekalmar", "Tiefseekalmar", "k7", 2, 3, ["tintenwolke", "kundschafter"], "uncommon", "Er verschwindet in einer Wolke, dunkler als die Tiefe."],
  ["schwarzangler", "Schwarzangler", "k8", 2, 4, ["koeder", "leuchtfeuer"], "uncommon", "Er ruft mit Licht und antwortet mit Zähnen."],
  ["drachenfisch", "Drachenfisch", "k8", 3, 2, ["zwillingsbiss"], "rare", "Er sieht rot, wo alle anderen nichts sehen."],
  ["glasauge", "Glasauge", "k3", 0, 3, ["seher", "leuchtfeuer"], "common", "Es hat alles gesehen und schweigt."],
  ["leuchtende", "Die Leuchtende", "k10", 3, 4, ["leuchtfeuer", "koeder", "wiedergaenger"], "legendary", "Wer ihr Licht sieht, hat schon verloren."],
  ["tiefseeassel", "Tiefseeassel", "k4", 0, 4, ["panzer"], "common", "Sie ist älter als das Licht.", { silhouette: "insect" }],
  ["laternenfisch", "Laternenfisch", "k1", 1, 2, ["leuchtfeuer"], "common", "Eine kleine Laterne mit Flossen.", { token: true }],
]);
