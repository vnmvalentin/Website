// ui/reskins.js
// Bildpfade für Schuppen-Reskins — NUR fürs Zeichnen (siehe GameContainer.jsx,
// wo area.shed.image danach umgeschaltet wird). Preise, Namen und "schon
// gekauft" kommen ausschließlich vom Server (GET /api/garden/reskins, siehe
// GoldShopModal) — hier steht bewusst nichts, das etwas anderes verspricht,
// als der Server tatsächlich auszahlt (dieselbe Regel wie beim Missionsbrett,
// core/quests.js). MUSS zu core/reskins.js (Backend) UND der gleichnamigen
// Kopie in engine/Renderer.js (Briefkasten + Namensschild) passen.
const BASIS = "/garden-assets/world";

export const SHED_RESKIN_BILD = {
    celestial: `${BASIS}/shed_variants/celestial.png`,
    forge: `${BASIS}/shed_variants/forge.png`,
    herbs: `${BASIS}/shed_variants/herbs.png`,
    observatory: `${BASIS}/shed_variants/observatory.png`,
    orbital: `${BASIS}/shed_variants/orbital.png`,
    seedsman: `${BASIS}/shed_variants/seedsman.png`,
    void_weaver: `${BASIS}/shed_variants/void_weaver.png`,
};
