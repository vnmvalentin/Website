// Anzeige-Zustand der Verifizierung eines Entwurfs. Maßgeblich ist der Server (er hat den Lauf nachgespielt); der
// lokale Merker (drafts.js) springt ein, solange der Server nicht befragt werden konnte — nicht angemeldet, offline,
// oder der Entwurf wurde seit der Abfrage verändert.
//
// Die Verifizierung hängt am INHALTS-HASH des Spielinhalts: Ändert sich Gelände, ein Element oder die Tempo-Klasse,
// ändert sich der Hash und die Verifizierung gilt nicht mehr. Name, Beschreibung, Tags und Biom ändern ihn nicht.

/**
 * @param {{ hash: string | null, local: object | null, server: object | null }} input
 *   hash    Inhalts-Hash des Entwurfs jetzt (null: das Level ist ungültig)
 *   local   der Merker im Browser { hash, ticks, deaths } oder null
 *   server  die letzte Antwort des Servers { hash, verified, current, ticks, deaths } — `hash` = wofür er gefragt wurde
 * @returns {{ kind: 'verified' | 'outdated' | 'changed' | 'none', ticks?: number, deaths?: number }}
 *   verified  gilt für genau diesen Inhalt
 *   outdated  war verifiziert, aber gegen eine ältere Physik (das Spiel wurde aktualisiert): erneut durchspielen
 *   changed   der Inhalt wurde seit der Verifizierung geändert: erneut durchspielen
 *   none      noch nie verifiziert (oder das Level ist ungültig)
 */
export function verificationState({ hash, local, server }) {
  if (!hash) return { kind: 'none' };
  if (server && server.hash === hash) {
    if (server.verified) {
      return server.current === false
        ? { kind: 'outdated', ticks: server.ticks, deaths: server.deaths }
        : { kind: 'verified', ticks: server.ticks, deaths: server.deaths };
    }
    return local && local.hash !== hash ? { kind: 'changed', ticks: local.ticks } : { kind: 'none' };
  }
  if (local && local.hash === hash) return { kind: 'verified', ticks: local.ticks, deaths: local.deaths };
  if (local) return { kind: 'changed', ticks: local.ticks };
  return { kind: 'none' };
}
