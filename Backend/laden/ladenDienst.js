// laden/ladenDienst.js — Laden der Website: Einmalkäufe über Stripe (Bezahlseite im Modus „payment“, Preis direkt
// im Aufruf, nichts muss in Stripe angelegt werden), Verbuchen nach dem Webhook (billing/billingService.js reicht
// Sitzungen mit metadata.art = "laden" hierher), Abzeichen „Unterstützer“, Dankesliste, Besitz für die Spiele.
// Volle Erstattung oder Rückbuchung nimmt den Kauf wieder zurück (ruecknahme, ebenfalls vom Webhook).
//
// Vor jedem Kauf ist die Zustimmung Pflicht, dass die Leistung sofort beginnt und damit das Widerrufsrecht erlischt
// (digitale Inhalte, § 356 Abs. 5 BGB) — der Wortlaut steht im Kauf-Fenster und unter /widerruf.
'use strict';

const { UNTERSTUETZER_BETRAEGE, gueltigeArtikel, spielInfo } = require('./katalog');

const RUECKWEGE = new Set(['/laden', '/profile']);

// Steht auf der Bezahlseite und (als Beschreibung der Zahlung) auf dem Beleg von Stripe — damit die Zustimmung zum
// sofortigen Beginn auch in der Bestätigung steht (§ 312f Abs. 3 BGB). Belege per E-Mail im Stripe-Dashboard einschalten.
const BELEG_HINWEIS = {
  de: 'Sie haben ausdrücklich zugestimmt, dass die Bereitstellung sofort beginnt, und bestätigt, dass Ihr Widerrufsrecht damit erlischt.',
  en: 'You expressly agreed that delivery starts immediately and confirmed that you thereby lose your right of withdrawal.',
};

/**
 * @param {object} deps
 * @param {ReturnType<import('./ladenStore').createLadenStore>} deps.store
 * @param {object} deps.kontoStore
 * @param {() => object} deps.stripe        Stripe-Client (Tests: Attrappe)
 * @param {(n: object) => Promise<any>} deps.melde   lib/mitteilungen.js meldeMitteilung
 */
function createLadenDienst({ store, kontoStore, stripe, melde = async () => null, frontendUrl = process.env.FRONTEND_URL || '', artikel = gueltigeArtikel(), log = console }) {
  const artikelVon = new Map(artikel.map((a) => [a.id, a]));
  const basis = String(frontendUrl).replace(/\/+$/, '');

  /**
   * Bezahlseite öffnen.
   * @returns {Promise<{ url: string } | { fehler: string }>}
   */
  async function checkout({ kontoId, typ, artikelId = null, betragCent, aufListe = false, returnPath = '/laden', lang = 'de' }) {
    let betrag;
    let name;
    if (typ === 'unterstuetzer') {
      betrag = Number(betragCent);
      if (!UNTERSTUETZER_BETRAEGE.includes(betrag)) return { fehler: 'betrag' };
      name = lang === 'en' ? 'Support vnmvalentin.de' : 'Unterstützung für vnmvalentin.de';
    } else if (typ === 'artikel') {
      const a = artikelVon.get(artikelId);
      if (!a) return { fehler: 'artikel' };
      if (store.besitzt(kontoId, a.id)) return { fehler: 'schon' };
      betrag = a.preisCent;
      name = a.name[lang] || a.name.de;
    } else {
      return { fehler: 'typ' };
    }
    store.merkeZustimmung(kontoId, `widerruf-${typ}`);
    const zurueck = `${basis}${RUECKWEGE.has(returnPath) ? returnPath : '/laden'}`;
    const metadata = { art: 'laden', konto_id: kontoId, typ, artikel_id: artikelId || '', auf_liste: aufListe ? '1' : '0' };
    const beleg = BELEG_HINWEIS[lang === 'en' ? 'en' : 'de'];
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      // Betrag ist der Endpreis inkl. Umsatzsteuer (AGB); Stripe Tax rechnet den Steueranteil aus der Rechnungsadresse heraus
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: betrag, tax_behavior: 'inclusive', product_data: { name } } }],
      automatic_tax: { enabled: true },
      client_reference_id: kontoId,
      metadata,
      payment_intent_data: { metadata, description: `${name}. ${beleg}` },
      custom_text: { submit: { message: beleg } },
      billing_address_collection: 'required',
      locale: lang === 'en' ? 'en' : 'de',
      success_url: `${zurueck}?kauf=ok`,
      cancel_url: `${zurueck}?kauf=abbruch`,
    });
    return { url: session.url };
  }

  /** Bezahlte Stripe-Sitzung verbuchen (vom Webhook, schon EU-geprüft). Doppelte Zustellung bucht nichts doppelt. */
  async function abschliessen(session) {
    const kontoId = session.metadata?.konto_id || session.client_reference_id;
    const typ = session.metadata?.typ;
    if (!kontoId || !['unterstuetzer', 'artikel'].includes(typ)) {
      log.error?.(`[laden] Sitzung ${session.id} ohne Konto oder Art — nicht verbucht`);
      return false;
    }
    const artikelId = typ === 'artikel' ? session.metadata?.artikel_id || null : null;
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
    const neu = store.verbuche({
      sessionId: session.id, kontoId, typ, artikelId, paymentIntent,
      betragCent: Number(session.amount_total) || 0, aufListe: session.metadata?.auf_liste === '1',
    });
    if (!neu) return false;
    if (typ === 'unterstuetzer') {
      try { kontoStore.meldeErfolge(kontoId, 'website', ['unterstuetzer']); } catch (e) { log.error?.('[laden] Abzeichen:', e.message); }
      melde({
        thema: 'laden', konten: [kontoId], nurGlocke: true,
        titel: { de: 'Danke für deine Unterstützung!', en: 'Thanks for your support!' },
        text: { de: 'Dein Abzeichen „Unterstützer“ steht jetzt im Profil und auf deiner Visitenkarte.', en: 'Your “Supporter” badge is now in your profile and on your profile card.' },
        url: '/profile', tag: `laden-${session.id}`,
      });
    } else {
      // Die Glocke führt direkt ins Spiel und sagt, wo das Design auszuwählen ist (katalog.js SPIEL_INFO)
      const a = artikelVon.get(artikelId);
      const info = a ? spielInfo(a.spiel) : null;
      const satz = (lang) => [`${a?.name[lang] || artikelId} ${lang === 'en' ? 'is yours now.' : 'gehört jetzt dir.'}`, info?.wo?.[lang]].filter(Boolean).join(' ');
      melde({
        thema: 'laden', konten: [kontoId], nurGlocke: true,
        titel: { de: 'Kauf angekommen', en: 'Purchase received' },
        text: { de: satz('de'), en: satz('en') },
        url: info?.pfad || '/laden', tag: `laden-${session.id}`,
      });
    }
    return true;
  }

  /**
   * Volle Erstattung (vom Betreiber im Stripe-Dashboard) oder Rückbuchung über die Bank (vom Webhook): Kauf
   * zurücknehmen. Design weg; war es der letzte Beitrag, sind auch Abzeichen „Unterstützer“ und Dankesliste weg.
   * Zahlungen, die nicht aus dem Laden stammen (Abo), kennt der Laden nicht — dann passiert nichts.
   * @param {{ paymentIntent: string, grund: 'erstattet'|'rueckbuchung' }} r
   * @returns {boolean} true, wenn etwas zurückgenommen wurde
   */
  function ruecknahme({ paymentIntent, grund }) {
    const r = store.nimmZurueck(paymentIntent);
    if (!r) return false;
    if (r.typ === 'unterstuetzer' && !r.nochUnterstuetzer) {
      try { kontoStore.entziehErfolg(r.kontoId, 'website', 'unterstuetzer'); } catch (e) { log.error?.('[laden] Abzeichen entziehen:', e.message); }
    }
    log.warn?.(`[laden] ${grund === 'rueckbuchung' ? 'Rückbuchung' : 'Erstattung'}: ${r.typ}${r.artikelId ? ` ${r.artikelId}` : ''} von Konto ${r.kontoId} zurückgenommen`);
    return true;
  }

  function meinStand(kontoId) {
    return { besitz: store.besitz(kontoId), unterstuetzer: store.unterstuetzer(kontoId) };
  }

  /** Namen auf der Dankesliste (nur wer zugestimmt hat; Name wie im Konto) */
  function dankesliste() {
    return store.dankesliste().map((e) => ({ name: kontoStore.ansicht(e.kontoId)?.name || null, seit: e.seit })).filter((e) => e.name);
  }

  /** Discord-IDs der Unterstützer mit verknüpftem Discord (für eine Discord-Rolle, Anschluss unterstuetzer-discord) */
  function discordIdsDerUnterstuetzer() {
    return store.unterstuetzerIds().map((k) => kontoStore.ansicht(k)?.discord?.id).filter(Boolean);
  }

  return {
    checkout,
    abschliessen,
    ruecknahme,
    meinStand,
    dankesliste,
    discordIdsDerUnterstuetzer,
    besitzt: (kontoId, artikelId) => store.besitzt(kontoId, artikelId),
    besitzImSpiel: (kontoId, spiel) => store.besitz(kontoId).filter((id) => artikelVon.get(id)?.spiel === spiel),
    artikel: () => artikel.map(({ id, spiel, name, text, preisCent, bild }) => ({ id, spiel, name, text, preisCent, bild: bild || null })),
  };
}

module.exports = { createLadenDienst };
