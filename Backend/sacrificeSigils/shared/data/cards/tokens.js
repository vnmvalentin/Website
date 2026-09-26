// Tokens — Nebendeck, Brutlinge, Hüllen, Moorlaterne. Nie im Draft oder auf dem Pfad.
import { defineCards } from "./_define.js";

const BROOD = [
  ["bestien", "Welpling"], ["nachtvoegel", "Nestling"], ["aasfresser", "Aasling"], ["schwaerme", "Larve"],
  ["tiefe", "Laichling"], ["kriecher", "Schlüpfling"], ["nager", "Mäusling"], ["myzel", "Sporling"],
  ["wurzelvolk", "Keimling"], ["gebeine", "Knöchelchen"], ["kerzenwesen", "Funke"], ["gehoernte", "Kitz"],
  ["flatterer", "Flatterling"], ["stammlose", "Klecks"],
];

export default [
  ...defineCards("stammlose", [
    ["side_moorling", "Moorling", "b0", 0, 1, [], "common", "Ein Klumpen Moor mit Augen. Er will helfen.", { token: true }],
    ["side_knochenkaefer", "Knochenkäfer", "b0", 0, 1, ["markleicht"], "common", "Er stirbt gern, weil er mehr hinterlässt.", { token: true, tribe: "schwaerme" }],
    ["side_wachsling", "Wachsling", "b0", 0, 1, ["wachsgabe"], "common", "Ein Tropfen Wachs, der gehen gelernt hat.", { token: true, tribe: "kerzenwesen" }],
    ["token_huelle", "Abgestreifte Hülle", "b0", 0, 1, [], "common", "Leer, aber sie steht noch im Weg.", { token: true, silhouette: "serpent" }],
    ["token_laterne", "Moorlaterne", "b0", 0, 3, ["hochwuchs"], "common", "Ihr Licht hält die Schwingen fern.", { token: true, silhouette: "candle" }],
  ]),
  ...BROOD.flatMap(([tribe, name]) =>
    defineCards(tribe, [[`token_brut_${tribe}`, name, "b0", 0, 1, [], "common", "Frisch geschlüpft und schon im Weg.", { token: true }]])),
];
