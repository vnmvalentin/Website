// Raumeinstellungen als reine Daten — getrennt von der Komponente, damit Startseite,
// Raum und Renderer dieselben Vorgaben nutzen können.

export const DEFAULT_SETTINGS = {
  mode: "1v1",
  crossNet: true,
  maxTouches: 0,   // 0 = unbegrenzt
  powerups: false,
};

export const POWERUP_LABELS = {
  speed: "Schneller",
  grow: "Größer",
  shrink: "Gegner klein",
  netHigh: "Pfeiler hoch",
  netLow: "Pfeiler tief",
};

export function normalizeSettings(raw) {
  return {
    mode: raw?.mode === "2v2" ? "2v2" : "1v1",
    crossNet: raw?.crossNet !== false,
    maxTouches: Number(raw?.maxTouches) === 3 ? 3 : 0,
    powerups: !!raw?.powerups,
  };
}

// Kurzfassung für die Kopfzeile im Raum
export function settingsSummary(s) {
  const n = normalizeSettings(s);
  return [
    n.mode === "2v2" ? "2 gegen 2" : "1 gegen 1",
    n.crossNet ? "Pfeiler überspringbar" : "Hälften getrennt",
    n.maxTouches === 3 ? "max. 3 Berührungen" : "Berührungen frei",
    n.powerups ? "Powerups an" : "Powerups aus",
  ];
}
