// Wattschnecken — langsam, Schale, Perlen, Knochen. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("schnecken", [
  ["schneckenlaich", "Schneckenlaich", "k2", 0, 1, ["metamorphose"], "common", "Ein Tropfen Gallert voller Geduld.", { evolvesTo: "wellhornschnecke" }],
  ["napfschnecke", "Napfschnecke", "k1", 0, 2, ["anker"], "common", "Sie hat einen Platz gefunden und bleibt."],
  ["strandschnecke", "Strandschnecke", "k3", 1, 2, ["perle"], "common", "Langsam, aber sie kommt überall an."],
  ["kreiselschnecke", "Kreiselschnecke", "k3", 1, 3, ["wanderer"], "common", "Immer im Kreis, immer weiter."],
  ["purpurschnecke", "Purpurschnecke", "k4", 1, 2, ["aderlass"], "common", "Aus ihr macht man Farbe. Sie macht aus dir Farbe."],
  ["kegelschnecke", "Kegelschnecke", "k5", 1, 2, ["todesstachel"], "uncommon", "Schön, langsam und gefährlicher als alles hier."],
  ["meeresnacktschnecke", "Meeresnacktschnecke", "k3", 1, 1, ["stinkdruese", "faeulnis"], "common", "Bunt heißt hier: fass mich nicht an."],
  ["tritonshorn", "Tritonshorn", "k7", 2, 3, ["glockenschlag", "leittier"], "uncommon", "Wer hineinbläst, ruft die Flut."],
  ["perlboot", "Perlboot", "k8", 2, 4, ["perle", "tauchgang"], "uncommon", "Ein Haus mit Kammern, und jede ist leer."],
  ["seehase", "Seehase", "k6", 1, 4, ["tintenwolke"], "common", "Er wirft Tinte und geht in Ruhe weiter."],
  ["ammonit", "Der Ammonit", "k10", 2, 5, ["panzer", "wiedergaenger"], "legendary", "Er war schon alt, als das Meer noch jung war."],
  ["porzellanschnecke", "Porzellanschnecke", "k7", 2, 4, ["salzkruste"], "rare", "Glänzend und unzerbrechlich, fast."],
  ["wellhornschnecke", "Wellhornschnecke", "k1", 1, 3, ["panzer"], "common", "Ihr Haus trägt sie wie eine Rüstung.", { token: true }],
]);
