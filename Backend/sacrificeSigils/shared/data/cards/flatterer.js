// Flatterer — Motten, Fledermäuse, Nachtfalter. Fliegen, Tricks, Nachziehen. Wachs.
import { defineCards } from "./_define.js";

export default defineCards("flatterer", [
  ["seidenraupe", "Seidenraupe", "w1", 0, 1, ["metamorphose"], "common", "Sie spinnt sich ein Grab und steigt als Schatten heraus.", { evolvesTo: "totenkopffalter" }],
  ["zwergfledermaus", "Zwergfledermaus", "w3", 1, 1, ["kundschafter"], "common", "Sie hört die Karten, bevor du sie ziehst."],
  ["nachtfalter", "Nachtfalter", "w2", 0, 2, ["seher"], "common", "Auf seinen Flügeln stehen die nächsten drei Nächte."],
  ["blendfalter", "Blendfalter", "w2", 0, 3, ["koeder"], "common", "Seine Augen sind gemalt. Das weiß nur niemand."],
  ["staubmotte", "Staubmotte", "w3", 1, 1, ["schwinge"], "common", "Sie lebt vom Staub alter Gebetbücher."],
  ["flughund", "Flughund", "w4", 2, 3, [], "common", "Groß wie eine Krähe, sanft wie ein Hund. Meistens."],
  ["mondspanner", "Mondspanner", "w5", 2, 2, ["schwinge"], "uncommon", "Er vermisst den Mond, Nacht für Nacht, und findet ihn zu klein."],
  ["schattenmotte", "Schattenmotte", "w3", 1, 2, ["fluchtreflex", "kundschafter"], "uncommon", "Wo du hinschlägst, war sie gerade."],
  ["blutsauger", "Blutsauger", "w5", 1, 2, ["schwinge", "aderlass"], "uncommon", "Er trinkt, bis du leichter wirst."],
  ["echofledermaus", "Echofledermaus", "w5", 1, 3, ["seher", "schwinge"], "uncommon", "Sie ruft in dein Deck und hört, was antwortet."],
  ["mottenmutter", "Die Mottenmutter", "w6", 2, 3, ["schwinge", "brut"], "rare", "Wo sie landet, zittert das Kerzenlicht."],
  ["totenkopffalter", "Totenkopffalter", "w1", 2, 2, ["schwinge"], "common", "Auf seinem Rücken grinst jemand, den du kanntest.", { token: true }],
]);
