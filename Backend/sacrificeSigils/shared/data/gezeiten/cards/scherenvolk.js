// Scherenvolk — Krebse und Krabben: Panzer, Gabelstoß. Gezeiten-Zirkel.
import { defineCards } from "../../cards/_define.js";

export default defineCards("scherenvolk", [
  ["krebslarve", "Krebslarve", "b0", 0, 1, ["metamorphose"], "common", "Durchsichtig, aber schon mit Scheren.", { evolvesTo: "strandkrebs" }],
  ["taschenkrebs", "Taschenkrebs", "b1", 1, 2, ["gezeitenschild"], "common", "Er geht seitwärts durchs Leben und kommt trotzdem an."],
  ["winkerkrabbe", "Winkerkrabbe", "b1", 1, 2, ["gabelstoss"], "common", "Eine Schere zum Winken, eine zum Kneifen."],
  ["einsiedlerkrebs", "Einsiedlerkrebs", "b1", 0, 3, ["panzer"], "common", "Das Haus ist geliehen, der Trotz ist echt."],
  ["schwimmkrabbe", "Schwimmkrabbe", "b1", 2, 1, ["tauchgang"], "common", "Paddelt davon, sobald es ernst wird."],
  ["pistolenkrebs", "Pistolenkrebs", "b2", 3, 2, ["ruestungsbrecher"], "common", "Ein Knall, und die Schale ist hin."],
  ["hummer", "Hummer", "b2", 2, 3, ["panzer"], "uncommon", "Alt, gepanzert und nachtragend."],
  ["languste", "Languste", "b2", 2, 3, ["dornenkleid"], "common", "Alles an ihr sticht."],
  ["scherenkoenigin", "Scherenkönigin", "b3", 3, 3, ["gabelstoss", "panzer"], "uncommon", "Sie hält zwei Lanes in der Zange."],
  ["kokosraeuber", "Kokosräuber", "b3", 4, 4, ["ruestungsbrecher"], "rare", "Er knackt, was andere nicht einmal anheben."],
  ["riesenkrabbe", "Die Riesenkrabbe", "b4", 4, 5, ["dreizack", "panzer"], "legendary", "Wenn sie sich bewegt, bebt der Strand."],
  ["springkrebs", "Springkrebs", "b1", 2, 1, ["fluchtreflex"], "common", "Ein Zucken, und er ist weg."],
  ["strandkrebs", "Strandkrebs", "b1", 2, 2, ["gabelstoss"], "common", "Groß geworden zwischen den Steinen.", { token: true }],
]);
