// Leuchtturmwärter — Licht, Information, Unterstützung. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("waerter", [
  ["laternentraeger", "Laternenträger", "s1", 0, 1, ["seher"], "common", "Ein Licht, das nur ein paar Schritte weit reicht."],
  ["funkenwaerter", "Funkenwärter", "s2", 1, 2, ["leuchtfeuer"], "common", "Solange er brennt, versteckt sich niemand."],
  ["nebelhorn", "Nebelhorn", "b1", 0, 3, ["glockenschlag"], "common", "Es ruft alle nach vorn."],
  ["lampenputzer", "Lampenputzer", "s2", 0, 2, ["salzader"], "common", "Salz auf dem Glas, Salz in der Tasche."],
  ["signalgaenger", "Signalgänger", "s3", 1, 3, ["flaschenpost"], "common", "Er liest die Nachrichten, bevor das Meer sie verschluckt."],
  ["leuchtturmwaerter", "Leuchtturmwärter", "s4", 2, 2, ["leuchtfeuer", "kundschafter"], "uncommon", "Er hat die Nacht gezählt. Sie ist länger geworden."],
  ["kuestenwacht", "Küstenwacht", "b2", 1, 4, ["leibwaechter", "hochwuchs"], "common", "Niemand geht an Land, den sie nicht gesehen hat."],
  ["gezeitenschreiber", "Gezeitenschreiber", "s3", 1, 2, ["mondzug", "seher"], "uncommon", "Er schreibt die Flut auf, bevor sie kommt."],
  ["blinkfeuer", "Blinkfeuer", "s5", 2, 3, ["leuchtfeuer", "leittier"], "uncommon", "An, aus, an. Wer es sieht, weiß, wo er ist."],
  ["lotsin", "Die Lotsin", "s5", 2, 3, ["seher", "kundschafter", "leittier"], "rare", "Sie hat noch jedes Schiff heimgebracht. Fast jedes."],
  ["letzterwaerter", "Der Letzte Wärter", "s5", 3, 5, ["leuchtfeuer", "flaschenpost", "leittier"], "legendary", "Das Licht brennt noch. Er schon lange nicht mehr.", { balanceNote: "Balancing 5000 Matches (Gezeiten): mit 7 Salz 46 %, mit 6 Salz 44–45 % – Salz kommt langsam, deshalb 5." }],
  ["sturmlaterne", "Sturmlaterne", "s2", 2, 1, ["treibgut"], "common", "Hell, bis die Flut kommt."],
]);
