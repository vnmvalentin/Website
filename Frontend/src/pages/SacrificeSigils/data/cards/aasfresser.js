// Aasfresser — Geier, Hyänen, Krähen. Profitieren vom Tod, Knochen.
import { defineCards } from "./_define.js";

export default defineCards("aasfresser", [
  ["aaskraehe", "Aaskrähe", "b0", 0, 1, ["aschenspende"], "common", "Sie wartet. Warten ist ihr Handwerk.", { silhouette: "bird" }],
  ["kadaverbrut", "Kadaverbrut", "k1", 0, 1, ["nachgeburt"], "common", "Was verwest, summt bald.", { evolvesTo: "fliegenschwarm", silhouette: "insect" }],
  ["lachhyaene", "Lachhyäne", "k3", 2, 1, ["rachsucht"], "common", "Sie lacht über jeden Tod. Am lautesten über den nächsten.", { silhouette: "quadruped" }],
  ["sammlerkraehe", "Sammlerkrähe", "k3", 1, 2, ["kundschafter"], "common", "Knöpfe, Ringe, Zähne. Alles glänzt, wenn man lang genug putzt.", { silhouette: "bird" }],
  ["grabschakal", "Grabschakal", "k3", 1, 2, ["knochenmark"], "common", "Er scharrt, wo andere beten.", { silhouette: "quadruped" }],
  ["leichenkraehe", "Leichenkrähe", "k4", 1, 1, ["schwinge"], "common", "Drei Kreise über dem Feld, dann landet sie.", { silhouette: "bird" }],
  ["moorgeier", "Moorgeier", "k6", 2, 2, ["schwinge"], "uncommon", "Sein Schatten fällt immer zuerst.", { silhouette: "bird" }],
  ["knochenhyaene", "Knochenhyäne", "k5", "knochenlast", 3, ["ruestungsbrecher"], "uncommon", "Mark ist süß. Das Knacken ist süßer.", { silhouette: "quadruped" }],
  ["knochenpicker", "Knochenpicker", "k6", "knochenlast", 2, ["schwinge"], "uncommon", "Je voller der Beinhaufen, desto schärfer der Schnabel.", { silhouette: "bird" }],
  ["fleddergeier", "Fleddergeier", "k8", 3, 3, ["aderlass"], "uncommon", "Er nimmt nicht nur das Fleisch. Er nimmt die Kraft.", { silhouette: "bird" }],
  ["hyaenenfuerstin", "Hyänenfürstin", "k10", 4, 4, ["rachsucht", "durchbohren"], "rare", "Ihr Rudel stirbt für sie. Sie wird davon nur stärker.", { silhouette: "quadruped" }],
  ["fliegenschwarm", "Fliegenschwarm", "k1", 1, 1, ["schwinge"], "common", "Tausend Flügel, ein Hunger.", { token: true, silhouette: "insect" }],
]);
