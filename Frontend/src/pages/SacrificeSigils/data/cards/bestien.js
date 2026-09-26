// Bestien — Wölfe, Bären, Luchse, Keiler. Hohe Werte, Rudelboni, meist Blut.
import { defineCards } from "./_define.js";

export default defineCards("bestien", [
  ["grauwelpe", "Grauwelpe", "b0", 0, 1, ["metamorphose"], "common", "Noch blind, und doch folgt sie schon der Spur der Asche.", { evolvesTo: "grauwolf" }],
  ["moorkeiler", "Moorkeiler", "b1", 1, 3, [], "common", "Er gräbt nach Wurzeln, die nach Eisen schmecken."],
  ["hetzwolf", "Hetzwolf", "b1", 2, 1, ["rudelruf"], "common", "Allein ist er ein Schatten. Im Rudel ist er die Nacht."],
  ["aschwolf", "Aschwolf", "b2", 3, 2, ["rudelruf"], "common", "Er riecht das Feuer, bevor es brennt."],
  ["borstenkeiler", "Borstenkeiler", "b2", 2, 3, ["dornenkleid"], "common", "Wer ihn streift, trägt seine Borsten noch drei Tage."],
  ["bachenmutter", "Bachenmutter", "b2", 2, 2, ["brut"], "common", "Wo sie wühlt, quiekt es bald aus jedem Graben."],
  ["aschbaer", "Aschbär", "b3", 4, 4, [], "uncommon", "Sein Winterschlaf dauerte ein Jahrhundert. Er ist hungrig."],
  ["rudelmutter", "Rudelmutter", "b2", 1, 3, ["leittier"], "uncommon", "Sie jagt nicht. Sie zeigt nur, wohin."],
  ["luchsschatten", "Luchsschatten", "b2", 2, 2, ["hinterhalt", "fluchtreflex"], "uncommon", "Man sieht nur die Ohren. Dann nichts mehr."],
  ["hungerwolf", "Hungerwolf", "b1", 3, 1, ["hunger"], "uncommon", "Er frisst, was neben ihm steht. Auch Freunde."],
  ["mondluchs", "Mondluchs", "b3", 4, 3, ["zwillingsbiss"], "rare", "Zwei Bisse, ein Atemzug. Der Mond zählt mit."],
  ["grauerfuerst", "Der Graue Fürst", "b3", 4, 4, ["rudelruf", "leittier"], "legendary", "Jeder Wolf im Moor senkt den Kopf, wenn er vorbeigeht."],
  ["grauwolf", "Grauwolf", "b1", 2, 2, ["rudelruf"], "common", "Aus der Welpe wurde, was der Nebel versprach.", { token: true }],
]);
