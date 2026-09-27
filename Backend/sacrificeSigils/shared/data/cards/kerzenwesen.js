// Kerzenwesen — Wachsgeister, Dochtmotten. Wachs-Synergien, vergänglich, aber stark.
import { defineCards } from "./_define.js";

export default defineCards("kerzenwesen", [
  ["stummelkerze", "Stummelkerze", "w2", 0, 2, ["metamorphose"], "common", "Sie wartet auf eine Hand, die sie noch einmal entzündet.", { evolvesTo: "hoheflamme" }],
  ["flackerwicht", "Flackerwicht", "w1", 0, 1, ["wachsquelle"], "common", "Er tropft, und jeder Tropfen ist ein Geschenk."],
  ["dochtmotte", "Dochtmotte", "w2", 2, 1, ["kerzendocht:2"], "common", "Sie liebte die Flamme so sehr, dass sie eine wurde."],
  ["talgschemen", "Talgschemen", "w2", 2, 1, ["kerzendocht:3"], "common", "Ein Umriss aus Talg, der sich an Wärme erinnert."],
  ["kerzengeist", "Kerzengeist", "w3", 3, 2, ["kerzendocht:2"], "common", "Hell, heiß und bald vorbei."],
  ["wachsklotz", "Wachsklotz", "w3", 1, 4, [], "common", "Das Wachs von hundert Messen, zu einem Rücken erstarrt."],
  ["wachsmaske", "Wachsmaske", "w3", 1, 2, ["wachsquelle"], "common", "Hinter der Maske schmilzt ein Gesicht, das nie da war."],
  ["ewigeflamme", "Ewige Flamme", "w2", 0, 1, ["ewigesopfer"], "uncommon", "Man kann sie opfern. Man kann sie nicht löschen."],
  ["lichterfresser", "Lichterfresser", "w4", "flammenmass", 3, [], "uncommon", "Er wird größer, je heller es brennt."],
  ["leuchterseele", "Leuchterseele", "w6", 4, 3, ["kerzendocht:3", "schwinge"], "rare", "Sie flog aus dem Kronleuchter und fand nie zurück."],
  ["braut", "Die Brennende Braut", "w6", 4, 3, ["kerzendocht:2", "dreizack"], "rare", "Ihr Schleier fing Feuer. Sie hat es angenommen."],
  ["lichtvater", "Der Lichtvater", "w6", "flammenmass", 4, ["wachsquelle", "leittier"], "legendary", "Jede Kerze der Kapelle brennt für ihn."],
  ["hoheflamme", "Hohe Flamme", "w2", 3, 2, ["kerzendocht:3"], "common", "Einmal noch lodern, dann still sein.", { token: true }],
]);
