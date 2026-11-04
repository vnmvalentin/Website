// Stilprobe für Virtual Farm: dieselben fünf Motive in mehreren Stilrichtungen, damit man einen
// neuen Look an echten Bildern aussucht statt an Beschreibungen. Genutzt von farmArt.js --stilprobe
// (immer mit --lora 0: die LoRA zieht jedes Bild in den glänzenden 3D-Look zurück).
//
// Nur Vorschau — die Motive haben kein `ziel` und landen nie im Spiel.

/** Je Stil ein Satz für freigestellte Objekte und einer für randlose Bodentexturen. */
export const STILE = {
  flach: {
    objekt: "flat 2D vector game art, clean simple shapes, flat colors with one hard-edged shadow tone, thin dark brown outlines, matte muted earthy colors, seen slightly from above, isolated on a plain white background",
    boden: "flat 2D vector game art, clean simple shapes, flat colors with one hard-edged shadow tone, matte muted earthy colors, flat even lighting",
  },
  gouache: {
    objekt: "hand-painted gouache storybook illustration, visible brush strokes and a slight paper texture, soft muted earthy palette, matte finish, gentle even lighting, seen slightly from above, isolated on a plain white background",
    boden: "hand-painted gouache storybook illustration, visible brush strokes and a slight paper texture, soft muted earthy palette, matte finish, flat even lighting",
  },
  tusche: {
    objekt: "hand-drawn ink line art with loose watercolor washes, slightly uneven sketchy lines, soft desaturated colors, cozy indie game look, seen slightly from above, isolated on a plain white background",
    boden: "hand-drawn ink lines with loose watercolor washes, soft desaturated colors, cozy indie game look, flat even lighting",
  },
  pixel: {
    objekt: "detailed 16-bit pixel art sprite, limited color palette, crisp hard pixels, cozy farming game, isolated on a plain white background",
    // 04.11.: die erste Fassung malte gerahmte Kacheln mit dunkler Vignette — die ließen sich
    // nicht aneinanderlegen. Jetzt ausdrücklich randlos und überall gleich hell.
    boden: "seamless repeating pixel art texture, limited color palette, crisp hard pixels, no border, no frame, no vignette, the same brightness and density from edge to edge, cozy farming game, flat even lighting",
  },
};

const MOTIVE_PROBE = [
  { name: "katze", art: "objekt", breite: 832, hoehe: 1088, text: "game character for a cozy farming game, a small cat farmer standing upright on two legs facing the viewer, orange tabby fur, small simple eyes, a straw hat, a red checkered shirt and green overalls, full body" },
  { name: "huhn", art: "objekt", text: "game asset for a cozy farming game, a plump brown hen standing, side view facing right, red comb, yellow legs, full body" },
  { name: "tomate", art: "objekt", breite: 832, hoehe: 1088, text: "game asset for a cozy farming game, a tomato plant with ripe red tomatoes, short stem with a few thin roots, the whole plant floating freely" },
  { name: "gras", art: "boden", text: "seamless tileable ground texture for a top-down farming game, short green lawn grass, seen straight from above, the pattern evenly filling the whole image edge to edge" },
  { name: "acker", art: "boden", text: "seamless tileable ground texture for a top-down farming game, tilled brown farm soil with straight furrows, seen straight from above, the pattern evenly filling the whole image edge to edge" },
];

/**
 * Motive im Format von MOTIVE (artMotive.js). `prompt` ist fertig — promptFuer() nimmt ihn
 * unverändert; art "boden" schaltet in farmArt.js das Freistellen ab.
 */
export const STILPROBEN = Object.entries(STILE).flatMap(([stil, s]) =>
  MOTIVE_PROBE.map((m) => ({
    id: `probe_${stil}_${m.name}`,
    art: m.art === "boden" ? "boden" : "probe",
    breite: m.breite,
    hoehe: m.hoehe,
    motiv: m.text,
    prompt: `${m.text}, ${m.art === "boden" ? s.boden : s.objekt}`,
  })),
);
