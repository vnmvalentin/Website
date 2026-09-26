// Tiefe — Aale, Welse, Krebse, Tintenfische. Abtauchen und Kontrolle.
import { defineCards } from "./_define.js";

export default defineCards("tiefe", [
  ["aalbrut", "Aalbrut", "b0", 0, 1, ["metamorphose"], "common", "Durchsichtig wie Regen auf schwarzem Wasser.", { evolvesTo: "glasaal" }],
  ["schlammgrundel", "Schlammgrundel", "b0", 0, 2, [], "common", "Sie lebt, wo das Licht aufgibt."],
  ["moraal", "Moraal", "b1", 1, 2, ["tauchgang"], "common", "Er beißt und ist schon wieder Schlamm."],
  ["scherenkrebs", "Scherenkrebs", "b1", 1, 2, ["gabelstoss"], "common", "Zwei Scheren, zwei Seiten, keine Gnade."],
  ["nesselqualle", "Nesselqualle", "b1", 0, 2, ["dornenkleid", "faeulnis"], "common", "Wer sie berührt, brennt noch im Traum."],
  ["moorwels", "Moorwels", "b2", 2, 4, [], "common", "Er ist älter als der Steg, und breiter."],
  ["hechtschatten", "Hechtschatten", "b2", 3, 2, ["hinterhalt"], "uncommon", "Er steht im Schilf wie ein vergessener Speer."],
  ["tintenkrake", "Tintenkrake", "b2", 2, 3, ["tauchgang", "stinkdruese"], "uncommon", "Sie schreibt mit Tinte, die niemand lesen will."],
  ["grundkrake", "Grundkrake", "b3", 3, 4, ["koeder"], "rare", "Ein Arm lockt, sieben warten."],
  ["schlingaal", "Schlingaal", "b2", 2, 2, ["tauchgang", "todesstachel"], "rare", "Sein Biss ist kalt wie der Grund des Sees."],
  ["tiefenmutter", "Die Tiefenmutter", "b4", 4, 5, ["tauchgang", "koeder", "schildrinde"], "legendary", "Unter der Kapelle schläft sie. Unter ihr nichts mehr."],
  ["glasaal", "Glasaal", "b1", 1, 2, ["tauchgang"], "common", "Man sieht sein Herz schlagen. Man sieht ihn nicht kommen.", { token: true }],
]);
