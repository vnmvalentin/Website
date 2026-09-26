// Nager — Ratten, Maulwürfe, Wühlmäuse. Billige Opfer, Graben, Nachziehen.
import { defineCards } from "./_define.js";

export default defineCards("nager", [
  ["siebenschlaefer", "Siebenschläfer", "b0", 0, 1, ["metamorphose"], "common", "Er träumt von Kämpfen, die er verschläft.", { evolvesTo: "nachtbilch" }],
  ["moorratte", "Moorratte", "w1", 0, 1, ["kundschafter"], "common", "Sie kennt jeden Gang unter der Kapelle."],
  ["aschmaus", "Aschmaus", "b1", 2, 1, [], "common", "Grau, klein, und immer schon da."],
  ["wuehlmaus", "Wühlmaus", "b0", 0, 2, ["grabwuehler"], "common", "Wo die Erde bebt, ist sie schon angekommen."],
  ["schermaus", "Schermaus", "b1", 1, 2, ["grabwuehler"], "common", "Sie nagt Wurzeln, Wände und Geduld."],
  ["nestratte", "Nestratte", "b1", 1, 1, ["nesthueter"], "common", "Für jede, die fällt, huschen zwei aus dem Stroh."],
  ["blindmaulwurf", "Blindmaulwurf", "b2", 2, 4, ["grabwuehler"], "common", "Er sieht nichts. Er hört dein Herz."],
  ["opferratte", "Opferratte", "b1", 0, 1, ["dreifachblut"], "uncommon", "Sie kennt ihren Wert. Er ist dreimal höher als ihrer."],
  ["spitzmaus", "Unsterbliche Spitzmaus", "b1", 0, 1, ["ewigesopfer"], "rare", "Man hat sie schon oft geopfert. Sie hat es nie bemerkt."],
  ["pestratte", "Pestratte", "b1", 1, 2, ["faeulnis"], "uncommon", "Sie bringt ein Geschenk mit, das niemand will."],
  ["schuldratte", "Schuldratte", "b1", 1, 1, ["blutschuld"], "uncommon", "Sie leiht dir Karten. Die Zinsen zahlt die Waage."],
  ["rattenkoenig", "Rattenkönig", "b2", "handschwere", 3, ["kundschafter"], "rare", "Zwölf Schwänze, ein Knoten, eine Krone aus Stroh."],
  ["nachtbilch", "Nachtbilch", "b1", 1, 2, ["kundschafter"], "common", "Endlich wach. Und sehr, sehr schlecht gelaunt.", { token: true }],
]);
