// Nachtvögel — Eulen, Raben, Ziegenmelker. Fliegen und Tempo, Blut.
import { defineCards } from "./_define.js";

export default defineCards("nachtvoegel", [
  ["kauzkueken", "Kauzküken", "b0", 0, 1, ["metamorphose"], "common", "Es übt das Rufen, bis die Stille antwortet.", { evolvesTo: "steinkauz" }],
  ["ziegenmelker", "Ziegenmelker", "b1", 1, 1, ["schwinge"], "common", "Er trinkt aus Ziegen, sagen die Alten. Er trinkt aus Träumen."],
  ["sturmsegler", "Sturmsegler", "b1", 2, 1, ["vorpreschen"], "common", "Er landet nie. Er fällt nur langsamer."],
  ["wachkauz", "Wachkauz", "b1", 0, 3, ["leibwaechter"], "common", "Ein Auge offen, das andere auch."],
  ["schleiereule", "Schleiereule", "b2", 2, 2, ["schwinge"], "common", "Ihr Gesicht ist eine Maske aus Mondlicht."],
  ["nachtreiher", "Nachtreiher", "b2", 1, 4, ["hochwuchs"], "common", "Er steht im Schilf, bis das Schilf ihn vergisst."],
  ["uhu", "Moor-Uhu", "b3", 3, 3, ["schwinge"], "uncommon", "Wenn er ruft, verstummen die Frösche."],
  ["blutfink", "Blutfink", "b1", 0, 1, ["dreifachblut"], "uncommon", "Klein wie ein Tropfen, schwer wie drei."],
  ["glockenrabe", "Glockenrabe", "b2", 2, 2, ["schwinge", "glockenschlag"], "uncommon", "Er hat im Turm gewohnt, als es noch eine Glocke gab."],
  ["nestmutter", "Nestmutter", "b2", 1, 3, ["nesthueter", "schwinge"], "uncommon", "Kein Ei geht verloren, das sie gezählt hat."],
  ["sturmkauz", "Sturmkauz", "b3", 3, 2, ["schwinge", "zwillingsbiss"], "rare", "Er jagt mit dem Donner um die Wette."],
  ["mitternachtseule", "Die Mitternachtseule", "b4", 4, 4, ["schwinge", "schildrinde", "kundschafter"], "legendary", "Sie sah die Kapelle sinken und hat nicht geblinzelt."],
  ["steinkauz", "Steinkauz", "b1", 1, 2, ["schwinge"], "common", "Klein, grau und nie wieder blind.", { token: true }],
]);
