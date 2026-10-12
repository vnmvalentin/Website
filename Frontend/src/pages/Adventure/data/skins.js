// data/skins.js — Farbvarianten der Kits. Freigeschaltet werden sie über Erfolge (Backend/adventure/meta.js, Erfolg
// "<skin>_<kit>"); hier steht nur, wie sie aussehen: pal ersetzt die Kleidungsfarbe der Figur (render/flat/heroes.js).

export const SKINS = {
  schatten: { name: "Schatten", pal: { main: "#3a2a5a", mainDark: "#261a40" } },
  frost: { name: "Frost", pal: { main: "#8fd6ff", mainDark: "#5fb0e0" } },
  gold: { name: "Gold", pal: { main: "#f5cf4a", mainDark: "#c9a022" } },
};

export const SKIN_ORDER = ["schatten", "frost", "gold"];
