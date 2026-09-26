// Myzel — Pilze und Sporenwesen. Brut, Verbreitung, Fäulnis. Knochen.
import { defineCards } from "./_define.js";

export default defineCards("myzel", [
  ["sporenknirps", "Sporenknirps", "k1", 0, 1, ["brut"], "common", "Wo er niest, wächst morgen ein Wald."],
  ["schleimpilz", "Schleimpilz", "k2", 0, 3, [], "common", "Er kriecht, er denkt, er wartet auf Regen."],
  ["stinkmorchel", "Stinkmorchel", "k2", 1, 1, ["stinkdruese"], "common", "Niemand kämpft gut, wenn ihm die Augen tränen."],
  ["moderhut", "Moderhut", "k3", 1, 2, ["faeulnis"], "common", "Sein Schatten ist feucht, sein Atem auch."],
  ["hexenring", "Hexenring", "k3", 0, 2, ["nachgeburt"], "common", "Tritt nicht hinein. Tritt nie hinein.", { evolvesTo: "sporenwolke" }],
  ["hallimasch", "Hallimasch", "k4", 2, 2, [], "common", "Er leuchtet in alten Stämmen wie verschüttete Sterne."],
  ["fliegenpilz", "Fliegenpilz", "k5", 2, 2, ["dornenkleid"], "uncommon", "Rot mit weißen Tupfen. Wie ein Märchen, das beißt."],
  ["leuchtkappe", "Leuchtkappe", "k4", "knochenlast", 2, [], "uncommon", "Sie nährt ihr Licht aus dem, was unter ihr liegt."],
  ["sporenmutter", "Sporenmutter", "k7", 1, 4, ["brut", "faeulnis"], "uncommon", "Ihre Kinder sind grau, weich und überall."],
  ["faulbauch", "Faulbauch", "k10", 3, 5, ["faeulnis", "hunger"], "rare", "Er verdaut alles. Auch die, die ihn lieben."],
  ["myzelkrone", "Die Myzelkrone", "k10", 2, 5, ["brut", "moosheilung", "faeulnis"], "legendary", "Das Moor ist ein einziger Pilz. Das hier ist sein Gesicht."],
  ["sporenwolke", "Sporenwolke", "k1", 1, 1, ["faeulnis"], "common", "Atme nicht. Es ist zu spät.", { token: true }],
]);
