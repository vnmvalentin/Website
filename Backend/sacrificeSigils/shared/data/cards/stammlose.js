// Stammlose — Konstrukte, Kuriositäten. Neutral, Utility, alle Kostentypen.
import { defineCards } from "./_define.js";

export default defineCards("stammlose", [
  ["tintenkleks", "Tintenklecks", "b0", 1, 1, [], "common", "Ein Fehler auf dem Pergament, der beschlossen hat zu bleiben."],
  ["vogelscheuche", "Vogelscheuche", "w2", 0, 3, ["hochwuchs"], "common", "Sie hat noch nie einen Vogel verscheucht. Sie hat es versucht."],
  ["standuhr", "Standuhr", "w3", 0, 4, [], "common", "Sie schlägt dreizehn, wenn jemand stirbt."],
  ["kapellenglocke", "Kapellenglocke", "w2", 0, 2, ["glockenschlag"], "common", "Ein Schlag, und alle stehen auf."],
  ["irrlicht", "Irrlicht", "w1", 1, 1, ["wanderer"], "common", "Folge ihm nicht. Es weiß selbst nicht, wohin."],
  ["aufziehkaefer", "Aufziehkäfer", "b1", 2, 2, ["wanderer"], "common", "Klick, klack, klick. Irgendwann läuft er ab."],
  ["stoffpuppe", "Stoffpuppe", "k2", 1, 1, ["nesthueter"], "common", "Wirf sie weg. Sie liegt morgen wieder auf deinem Kissen."],
  ["knochenwuerfel", "Knochenwürfel", "k2", 1, 2, [], "common", "Er zeigt immer die Zahl, die du nicht wolltest."],
  ["spiegelscherbe", "Spiegelscherbe", "b1", 0, 2, ["spiegelbild"], "common", "Sie zeigt dir, wie stark dein Gegner ist. Dann ist sie es auch."],
  ["holzgolem", "Holzgolem", "b2", 2, 3, ["hochwuchs"], "common", "Aus Kirchenbänken geschnitzt. Er kniet nicht mehr."],
  ["tintengolem", "Tintengolem", "b3", 3, 5, [], "uncommon", "Wo er geht, bleiben schwarze Fußspuren auf dem Pergament."],
  ["messingautomat", "Messingautomat", "w6", 2, 4, ["panzer"], "rare", "Ein Uhrwerk mit einem Gewissen aus Zahnrädern."],
  ["leereruestung", "Leere Rüstung", "b2", 1, 4, ["panzer"], "uncommon", "Der Ritter ist gegangen. Die Rüstung hat weitergekämpft."],
  ["schuldner", "Der Schuldner", "b1", 1, 2, ["blutschuld"], "uncommon", "Er zahlt mit deinem Gewicht."],
  ["kristallkugel", "Kristallkugel", "w2", 0, 2, ["seher", "kundschafter"], "uncommon", "Sie zeigt die Zukunft. Leider verkehrt herum."],
  ["pestdoktor", "Pestdoktor", "b2", 2, 3, ["faeulnis"], "uncommon", "Seine Behandlung ist gründlich. Sehr gründlich."],
  ["koederpuppe", "Köderpuppe", "k4", 0, 5, ["koeder"], "uncommon", "Sie trägt dein Gesicht besser als du."],
  ["glasgolem", "Glasgolem", "b2", 0, 4, ["spiegelbild", "schildrinde"], "rare", "Wer ihn schlägt, schlägt sich selbst."],
  ["kartograph", "Der Kartograph", "b3", 3, 3, ["seher", "kundschafter:2", "leittier"], "legendary", "Er hat das Moor gezeichnet. Das Moor hat zurückgezeichnet."],
  ["tintenherz", "Das Tintenherz", "b4", "handschwere", 6, ["dornenkleid", "wiedergaenger"], "legendary", "Es schlägt in jeder Zeichnung, die je gezeichnet wurde."],
]);
