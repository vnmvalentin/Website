// Muschelvolk — Schalen, Salz, zähe Verteidigung. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("muschelvolk", [
  ["muschelbrut", "Muschelbrut", "s1", 0, 1, ["metamorphose"], "common", "Noch weich. Die Schale kommt mit dem Salz.", { evolvesTo: "miesmuschel" }],
  ["seepocke", "Seepocke", "b0", 0, 2, ["anker"], "common", "Klebt fest, wo sie einmal sitzt."],
  ["herzmuschel", "Herzmuschel", "s2", 0, 3, ["perle"], "common", "Wer sie öffnet, findet selten, was er sucht."],
  ["auster", "Auster", "s3", 0, 3, ["salzkruste"], "common", "Rau außen, still innen."],
  ["schalenwall", "Schalenwall", "s3", 0, 4, ["muschelgrab"], "common", "Ein Riff aus leeren Häusern."],
  ["klappmuschel", "Klappmuschel", "b1", 1, 2, ["muschelgrab"], "common", "Schnappt zu, bevor sie zerbricht."],
  ["riesenmuschel", "Riesenmuschel", "s5", 1, 5, ["salzkruste"], "uncommon", "Hundert Jahre im Schlick, und noch nicht satt."],
  ["perlenmutter", "Perlenmutter", "s4", 1, 3, ["perle", "leibwaechter"], "uncommon", "Sie hütet, was die anderen verlieren."],
  ["muschelritter", "Muschelritter", "b2", 2, 3, ["gezeitenschild"], "uncommon", "Er kämpft am liebsten, wenn das Wasser steigt."],
  ["salzhueter", "Salzhüter", "s3", 1, 3, ["salzader"], "common", "Er kratzt das Salz von den Steinen, Korn für Korn."],
  ["perlkoenig", "Perlkönig", "s6", 2, 6, ["salzkruste", "perle"], "rare", "Seine Krone ist aus Tränen gewachsen."],
  ["alteschale", "Die Alte Schale", "s7", 3, 6, ["salzkruste", "leibwaechter"], "legendary", "Das Meer hat sie hundertmal verschluckt. Sie kam immer zurück."],
  ["miesmuschel", "Miesmuschel", "s1", 1, 3, ["anker"], "common", "Hält sich fest und hält aus.", { token: true }],
  ["token_muschel", "Leere Muschel", "b0", 0, 2, [], "common", "Was bleibt, wenn das Tier geht.", { token: true }],
]);
