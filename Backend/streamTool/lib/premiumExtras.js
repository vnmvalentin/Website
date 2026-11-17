// premiumExtras.js — was in der Overlay-Konfiguration zum Abo gehört (billing/entitlements.js), ohne Datenbank (testbar).
//
// Die Einstellungen bleiben gespeichert, die OBS-Quelle bekommt sie ohne Abo aber nicht: Mit Abo ist alles wieder da.
//  - die vier Szenen (Module, siehe streamToolScenes.IDS) — werden ausgeschaltet
//  - eigene Schrift der Karten (theme.font)
//  - eigene Töne und Bilder der Alerts (modules.alerts.media)
// Happy Hour im Subathon prüft streamToolSubathon.js selbst, sie steckt im Zustand und nicht in der Konfiguration.

/**
 * @param {object|null} config        gespeicherte Konfiguration
 * @param {string[]} premiumModuleIds Abo-Module
 * @returns {object|null} Konfiguration ohne Abo-Teile (eine Kopie; das Original bleibt unverändert)
 */
function stripPremium(config, premiumModuleIds = []) {
  if (!config || typeof config !== "object") return config;
  const out = { ...config };
  if (out.theme && typeof out.theme === "object" && "font" in out.theme) {
    const { font, ...theme } = out.theme;
    out.theme = theme;
  }
  if (out.modules && typeof out.modules === "object") {
    const modules = { ...out.modules };
    for (const id of premiumModuleIds) {
      if (modules[id] && modules[id].enabled) modules[id] = { ...modules[id], enabled: false };
    }
    if (modules.alerts && typeof modules.alerts === "object" && "media" in modules.alerts) {
      const { media, ...alerts } = modules.alerts;
      modules.alerts = alerts;
    }
    out.modules = modules;
  }
  return out;
}

module.exports = { stripPremium };
