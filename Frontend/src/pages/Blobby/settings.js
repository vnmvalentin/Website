// Raumeinstellungen als reine Daten — getrennt von der Komponente, damit Startseite,
// Raum und Renderer dieselben Vorgaben nutzen können.

export const DEFAULT_SETTINGS = {
  mode: "1v1",
  crossNet: true,
  maxTouches: 0,   // 0 = unbegrenzt
  powerups: false,
  party: [],       // Partyregeln (nur klassisch): doppelball, wind, riesenball, mininetz
  koenig: false,   // König des Strandes
};

export const PARTY_RULES = ["doppelball", "wind", "riesenball", "mininetz"];
export const PARTY_LABELS = { doppelball: "Doppelball", wind: "Wind", riesenball: "Riesenball", mininetz: "Mini-Netz" };

export const POWERUP_LABELS = {
  speed: "Schneller",
  grow: "Größer",
  shrink: "Gegner klein",
  netHigh: "Pfeiler hoch",
  netLow: "Pfeiler tief",
};

export function normalizeSettings(raw) {
  // "beach" = Ego-Volleyball: 3D-Feld aus der Ich-Sicht (beach/), gerechnet beim Host statt
  // auf dem Server. Der Wert heißt noch wie das Feld "Beach 3D", das es ersetzt hat.
  const field = raw?.field === "beach" ? "beach" : "classic";
  // Partyregeln und König gibt es nur auf dem klassischen Feld (Ego 3D rechnet beim Host)
  const party = field === "beach" ? [] : PARTY_RULES.filter((r) => (Array.isArray(raw?.party) ? raw.party : []).includes(r));
  return {
    mode: raw?.mode === "2v2" ? "2v2" : "1v1",
    crossNet: raw?.crossNet !== false,
    // mit zwei Bällen zählt niemand Berührungen
    maxTouches: party.includes("doppelball") ? 0 : Number(raw?.maxTouches) === 3 ? 3 : 0,
    powerups: !!raw?.powerups,
    field,
    party,
    koenig: field !== "beach" && !!raw?.koenig,
  };
}

// Kurzfassung für die Kopfzeile im Raum
export function settingsSummary(s) {
  const n = normalizeSettings(s);
  if (n.field === "beach") {
    return [
      "Ego 3D",
      n.mode === "2v2" ? "2 gegen 2" : "1 gegen 1",
      n.maxTouches === 3 ? "max. 3 Berührungen" : "Berührungen frei",
      n.powerups ? "Powerups an" : "Powerups aus",
    ];
  }
  return [
    n.koenig ? "König des Strandes" : null,
    n.mode === "2v2" ? "2 gegen 2" : "1 gegen 1",
    ...n.party.map((r) => PARTY_LABELS[r]),
    n.crossNet ? "Pfeiler überspringbar" : "Hälften getrennt",
    n.maxTouches === 3 ? "max. 3 Berührungen" : "Berührungen frei",
    n.powerups ? "Powerups an" : "Powerups aus",
  ].filter(Boolean);
}
