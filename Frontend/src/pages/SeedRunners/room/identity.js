// Wer bin ich in den Räumen? Ein zufälliges Token plus der zuletzt benutzte Name, im Browser gespeichert.
//
// Das Token ist die Identität gegenüber dem Server: Wer mit demselben Token in denselben Raum
// zurückkommt (Neuladen, Verbindungsabbruch), ist derselbe Spieler und behält seinen Fortschritt.
// Es verlässt den Browser nur Richtung Server und steht nie in einer Nachricht an andere.
const KEY = 'seedrunners_player';

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

export function getIdentity() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw.token === 'string' && raw.token.length >= 8) {
      return { token: raw.token, name: typeof raw.name === 'string' ? raw.name : '' };
    }
  } catch { /* gesperrt oder kaputt: neu anlegen */ }
  const fresh = { token: randomToken(), name: '' };
  saveIdentity(fresh);
  return fresh;
}

export function saveIdentity(identity) {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch { /* privates Fenster: Identität gilt nur bis zum Neuladen */ }
}

/**
 * Schlüssel für die Tagesrangliste: sha256("sr-daily:" + Token) als Hex. Der Server leitet ihn aus demselben
 * Token ab (backend seedRunners/daily.js), deshalb steht ein Mensch über Solo-Tagesseite und Mehrspieler-
 * Räume hinweg einmal in der Liste — und das Token selbst muss nie in eine Adresse.
 * @returns {Promise<string | null>}  null, wenn der Browser kein crypto.subtle hat (unsichere Verbindung)
 */
export async function getDailyKey() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const data = new TextEncoder().encode(`sr-daily:${getIdentity().token}`);
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function rememberName(name) {
  const id = getIdentity();
  saveIdentity({ ...id, name });
}
