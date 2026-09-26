// Verfluchte Karten — nur über Ereignisse erhältlich (Tintenwitwe). Sehr stark, aber mit Fluchmal.
import { defineCards } from "./_define.js";

export default defineCards("stammlose", [
  ["verflucht_aschfluchwolf", "Aschfluch-Wolf", "b1", 4, 3, ["fluchmal"], "rare", "Sein Heulen hat einen Preis, und du zahlst ihn.", { tribe: "bestien", cursed: true }],
  ["verflucht_galgenrabe", "Galgenrabe", "b1", 3, 2, ["schwinge", "fluchmal"], "rare", "Er kennt den Weg zum Galgen. Er zeigt ihn gern.", { tribe: "nachtvoegel", cursed: true }],
  ["verflucht_fluchaal", "Fluchaal", "b1", 3, 4, ["tauchgang", "fluchmal"], "rare", "Wer ihn fängt, wird von ihm gefangen.", { tribe: "tiefe", cursed: true }],
  ["verflucht_tintenwitwe", "Tintenwitwe", "b2", 3, 3, ["todesstachel", "dreizack", "fluchmal"], "rare", "Acht Beine, ein Netz aus Tinte, kein Ausweg.", { tribe: "schwaerme", cursed: true }],
  ["verflucht_bleichebraut", "Bleiche Braut", "k2", 3, 3, ["wiedergaenger", "fluchmal"], "rare", "Sie hat Ja gesagt. Zu allem, für immer.", { tribe: "gebeine", cursed: true }],
  ["verflucht_schwarzkerze", "Schwarzkerze", "w1", 4, 2, ["fluchmal"], "rare", "Ihr Licht ist dunkel, und es wärmt nicht.", { tribe: "kerzenwesen", cursed: true }],
  ["verflucht_hexenbock", "Hexenbock", "b2", 5, 5, ["wucht", "fluchmal"], "rare", "Er trägt die Hörner, die der Teufel ablegte.", { tribe: "gehoernte", cursed: true }],
  ["verflucht_faeulnisherz", "Fäulnisherz", "k3", 3, 5, ["faeulnis:2", "fluchmal"], "rare", "Es schlägt noch. Das ist das Schlimmste daran.", { tribe: "myzel", cursed: true }],
  ["verflucht_gehenkter", "Der Gehenkte", "b0", 3, 3, ["fluchmal"], "rare", "Er schaukelt sanft im Wind, der nicht weht.", { cursed: true }],
]);
