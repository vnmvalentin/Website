// Ein Schlüssel für ALLE CR-API-Abfragen der Turniere (Kürzel-Prüfung bei der Anmeldung, Kampfsuche).
// Eigener Turnier-Schlüssel, sonst der WinTracker-Schlüssel, sonst undefined → crApi nimmt den geteilten
// Standard-Schlüssel. Hinweis: Schlüssel sind im Supercell-Portal an IP-Adressen gebunden — auf dem VPS
// muss dessen IP beim Schlüssel eingetragen sein.
const crToken = () =>
  process.env.CLASH_ROYALE_API_TOKEN_TOURNAMENT || process.env.CLASH_ROYALE_API_TOKEN_WINTRACKER || undefined;

module.exports = { crToken };
