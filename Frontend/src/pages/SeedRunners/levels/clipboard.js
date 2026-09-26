// In die Zwischenablage kopieren. navigator.clipboard gibt es nur in sicheren Kontexten (https, localhost); sonst der alte Weg
// über ein Textfeld. Liefert, ob es geklappt hat — die Aufrufer zeigen dann "Kopiert" oder den Text zum Selbstkopieren.
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* weiter zum Ausweichweg */ }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
