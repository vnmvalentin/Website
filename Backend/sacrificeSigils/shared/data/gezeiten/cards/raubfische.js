// Raubfische — Haie und Jäger: Angriff, Blutrausch. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("raubfische", [
  ["fischbrut", "Raubfischbrut", "b0", 0, 1, ["metamorphose"], "common", "Klein, hungrig, schon mit Zähnen.", { evolvesTo: "barrakuda" }],
  ["hornhecht", "Hornhecht", "b1", 2, 1, [], "common", "Grün die Gräten, spitz der Kopf."],
  ["muraene", "Muräne", "b2", 2, 2, ["hinterhalt"], "common", "Sie wohnt im Wrack und öffnet nur für Besucher."],
  ["dornhai", "Dornhai", "b2", 3, 2, ["dornenkleid"], "common", "Selbst sein Rücken beißt."],
  ["blauhai", "Blauhai", "b2", 3, 3, [], "common", "Er folgt Schiffen tagelang. Er hat Zeit."],
  ["katzenhai", "Katzenhai", "b1", 1, 2, ["rudelruf"], "common", "Nachts jagen sie zu vielen."],
  ["hammerhai", "Hammerhai", "b3", 3, 4, ["gabelstoss"], "uncommon", "Er sieht beide Seiten und beißt in beide."],
  ["schwertfisch", "Schwertfisch", "b2", 3, 2, ["durchbohren", "vorpreschen"], "uncommon", "Er fragt nicht, was dahinter steht."],
  ["tigerhai", "Tigerhai", "b3", 4, 3, ["aderlass"], "uncommon", "Er frisst alles. Wirklich alles."],
  ["weisserhai", "Weißer Hai", "b3", 4, 3, ["zwillingsbiss"], "rare", "Zweimal. Immer zweimal."],
  ["megalodon", "Der Megalodon", "b4", 6, 5, ["durchbohren"], "legendary", "Die Knochen am Grund gehören ihm. Alle."],
  ["bonitoschwarm", "Bonitoschwarm", "b1", 1, 1, ["rudelruf", "brandung"], "common", "Silber in der Brandung, dann nur noch Gischt.", { tide: "high" }],
  ["barrakuda", "Barrakuda", "b1", 3, 1, [], "common", "Lang, schnell, schlecht gelaunt.", { token: true }],
]);
