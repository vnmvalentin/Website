// Treibgut — stammlos: angespültes Zeug, gemischte Kosten. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("treibgut", [
  ["treibholz", "Treibholz", "b0", 0, 1, ["salzgabe"], "common", "Es kommt von weit her und bringt ein wenig Salz."],
  ["flaschenhals", "Flaschenhals", "b0", 1, 1, [], "common", "Grün, scharf und überall im Sand."],
  ["fischernetz", "Fischernetz", "s2", 0, 3, ["schlick"], "common", "Es fängt noch immer, auch ohne Fischer."],
  ["boje", "Boje", "s2", 0, 3, ["hochwuchs", "anker"], "common", "Sie bleibt, wo sie ist, und warnt alle."],
  ["strandkorb", "Strandkorb", "s2", 0, 4, [], "common", "Er wartet auf einen Sommer, der nicht kommt."],
  ["wetterfahne", "Wetterfahne", "b1", 1, 2, ["wanderer"], "common", "Sie dreht sich mit jedem Wind."],
  ["sandmann", "Sandmann", "b1", 2, 3, ["treibgut"], "common", "Die Flut nimmt ihn zurück, Korn für Korn."],
  ["netzflicker", "Netzflicker", "k3", 1, 2, ["kundschafter"], "common", "Er findet in jedem Loch noch etwas."],
  ["salzgolem", "Salzgolem", "s5", 2, 4, ["salzkruste"], "uncommon", "Er löst sich auf, wenn es regnet. Es regnet nie."],
  ["spiegelpfuetze", "Spiegelpfütze", "b0", 0, 2, ["spiegelbild"], "common", "Sie zeigt dir, was dir gegenübersteht."],
  ["gezeitenuhr", "Gezeitenuhr", "s3", 0, 3, ["mondzug", "seher"], "uncommon", "Sie geht vor. Das Meer folgt ihr."],
  ["sandgolem", "Sandgolem", "b2", 3, 4, ["treibgut"], "common", "Stark, solange das Wasser ihn lässt."],
  ["schuldschein", "Nasser Schuldschein", "b1", 1, 2, ["blutschuld"], "uncommon", "Die Tinte läuft, die Schuld bleibt."],
  ["flaschengeist", "Flaschengeist", "s3", 1, 2, ["flaschenpost"], "uncommon", "Er erfüllt keine Wünsche. Er bringt Post."],
  ["strandvogt", "Der Strandvogt", "b3", 3, 4, ["strandgut", "leittier", "kundschafter"], "legendary", "Alles, was angespült wird, gehört ihm. Auch du."],
  ["sturmflut", "Die Sturmflut", "s5", "salzmass", 5, ["flutwelle", "brandung"], "legendary", "Sie kommt nicht oft. Aber sie kommt immer ganz."],
]);
