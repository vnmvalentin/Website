// Tokens des Gezeiten-Zirkels — Nebendeck (Strandkrabbe, für beide gleich) und Brutlinge. Nie im Draft oder auf dem Pfad.
import { defineCards } from "../../cards/_define.js";

const BROOD = [["muschelvolk", "Muschelkind"], ["ertrunkene", "Kleiner Ertrunkener"], ["tangwesen", "Tangsprössling"], ["moewen", "Möwenjunges"], ["waerter", "Funkenkind"], ["scherenvolk", "Krabbenjunges"], ["quallen", "Quallenknospe"], ["robben", "Robbenjunges"], ["raubfische", "Jungfisch"], ["tiefseeleuchter", "Glimmling"], ["schnecken", "Schneckchen"], ["korallen", "Korallenknospe"], ["wracks", "Splitter"], ["treibgut", "Strandfund"]];

export default [
  ...defineCards("treibgut", [
    ["side_strandkrabbe", "Strandkrabbe", "b0", 0, 1, [], "common", "Sie kam mit der Ebbe und bleibt, bis man sie braucht.", { token: true, silhouette: "fish" }],
  ]),
  ...BROOD.flatMap(([tribe, name]) =>
    defineCards(tribe, [[`token_brut_${tribe}`, name, "b0", 0, 1, [], "common", "Gerade angespült und schon im Weg.", { token: true }]])),
];
