// Gehörnte — Hirsche, Böcke, Widder. Rückstoß, Schieben, Frontkontrolle.
import { defineCards } from "./_define.js";

export default defineCards("gehoernte", [
  ["hirschkalb", "Hirschkalb", "b0", 0, 1, ["metamorphose"], "common", "Seine Stirn juckt. Da wächst etwas.", { evolvesTo: "junghirsch" }],
  ["moorbock", "Moorbock", "b1", 1, 2, ["wucht"], "common", "Er stößt, weil er es kann."],
  ["gabelbock", "Gabelbock", "b2", 2, 3, ["gabelstoss"], "common", "Sein Geweih zeigt in zwei Richtungen. Beide stimmen."],
  ["rammwidder", "Rammwidder", "b2", 2, 3, ["rammbock", "wucht"], "common", "Er kennt nur eine Richtung: durch."],
  ["aschhirsch", "Aschhirsch", "b2", 2, 4, [], "common", "Die Asche in seinem Fell ist von einem Brand, der noch schwelt."],
  ["sturmwidder", "Sturmwidder", "b2", 3, 2, ["vorpreschen"], "common", "Er wartet nicht, bis die Reihe an ihm ist."],
  ["kronenhirsch", "Kronenhirsch", "b3", 3, 4, ["dreizack"], "uncommon", "Seine Krone hat zwölf Enden und keine Gnade."],
  ["geisterbock", "Geisterbock", "b2", 2, 2, ["ruestungsbrecher", "wucht"], "uncommon", "Seine Hörner gehen durch Holz, Stein und Ausreden."],
  ["moorelch", "Moorelch", "b3", 2, 5, ["leibwaechter", "hochwuchs"], "uncommon", "Er steht zwischen dir und allem, was kommt."],
  ["donnerwidder", "Donnerwidder", "b3", 4, 3, ["rammbock", "durchbohren"], "rare", "Wenn er anläuft, klirren die Fenster der Kapelle."],
  ["weisserhirsch", "Der Weiße Hirsch", "b4", 4, 5, ["wucht", "schildrinde", "leittier"], "legendary", "Wer ihm folgt, kommt nicht zurück. Wer nicht folgt, auch nicht."],
  ["junghirsch", "Junghirsch", "b1", 2, 3, ["wucht"], "common", "Die Stirn juckt nicht mehr. Jetzt juckt es die anderen.", { token: true }],
]);
