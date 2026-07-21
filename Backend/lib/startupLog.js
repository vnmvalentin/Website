// startupLog.js — einheitliches, knappes Format für Start-Meldungen.
// status: true = ✅, false = ❌, "warn" = ⚠️
function step(label, status = true, detail = "") {
  const icon = status === true ? "✅" : status === false ? "❌" : "⚠️";
  console.log(`${icon} ${label}${detail ? ` (${detail})` : ""}`);
}

module.exports = { step };
