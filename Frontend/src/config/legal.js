// legal.js — Angaben des Betreibers für Impressum, Datenschutzerklärung, AGB und Widerrufsbelehrung.
// EINE Stelle, damit die vier Seiten nie auseinanderlaufen.
//
// Solange Pflichtangaben leer sind, bleibt alles rund ums Bezahlen auf der veröffentlichten
// Website UNSICHTBAR (salesVisible): keine Fußzeile, keine Rechtsseiten, kein Abo-Abschnitt im
// Profil, kein Freischalten-Knopf im Twitch-Dashboard. Sobald alles eingetragen ist, erscheint
// es von selbst. Im Entwicklungsserver ist immer alles zu sehen — dort zeigen die Rechtsseiten
// oben, was noch fehlt (legalMissing).

export const LEGAL = {
  // Inhaber des Gewerbes: Vor- und Nachname (kein Künstlername allein)
  name: "Valentin Heiner",
  // Geschäftsbezeichnung, falls das Gewerbe eine führt (sonst leer lassen)
  businessName: "vnmvalentin",
  // Zusatzzeile über der Straße, z. B. die c/o-Angabe eines Impressum-Service (sonst leer lassen)
  co: "c/o Online-Impressum 13157",
  // Ladungsfähige Anschrift — kein Postfach
  street: "Europaring 90",
  zipCity: "53757 Sankt Augustin",
  country: "Deutschland",
  // Kontakt
  email: "vnmvalbusiness@gmail.com",
  // Telefon — optional; leer = erscheint nirgends
  phone: "015679 841408",
  // Umsatzsteuer-Identifikationsnummer, falls vorhanden
  vatId: "DE365303057",
  // Kleinunternehmer nach § 19 UStG? true = es wird keine Umsatzsteuer ausgewiesen. null = noch nicht angegeben.
  kleinunternehmer: false,
  // Hosting: Name und Sitz des Anbieters, bei dem der Server steht (für die Datenschutzerklärung)
  hoster: "Contabo GmbH, München (Deutschland)",
  // Wie viele Tage der Webserver Zugriffsprotokolle (mit IP-Adresse) aufbewahrt. null = noch nicht angegeben.
  // 14 = nginx-logrotate auf dem Server: daily, rotate 13, maxage 14, ifempty (eingestellt 16.11.2026)
  logRetentionDays: 14,
  // Stand der Texte
  stand: "16. November 2026",
};

// Die Rechtsseiten — für den Fuß der Website und die Querverweise zwischen den Seiten
export const LEGAL_LINKS = [
  { to: "/impressum", label: "Impressum" },
  { to: "/datenschutz", label: "Datenschutz" },
  { to: "/agb", label: "AGB" },
  { to: "/widerruf", label: "Widerrufsrecht" },
  { to: "/abo", label: "Abo kündigen" },
];

/** Welche Pflichtangaben noch fehlen (leere Liste = vollständig) */
export function legalMissing() {
  return [
    !LEGAL.name && "Name des Inhabers",
    !LEGAL.street && "Straße und Hausnummer",
    !LEGAL.zipCity && "PLZ und Ort",
    !LEGAL.email && "E-Mail-Adresse",
    LEGAL.kleinunternehmer === null && "Angabe, ob die Kleinunternehmerregelung gilt",
    !LEGAL.hoster && "Hosting-Anbieter",
    LEGAL.logRetentionDays === null && "Aufbewahrungsdauer der Server-Protokolle",
  ].filter(Boolean);
}

/**
 * Dürfen Abo, Rechtsseiten und Fußzeile gezeigt werden? Auf der veröffentlichten Website erst,
 * wenn keine Pflichtangabe mehr fehlt — ein sichtbar leeres Impressum ist schlechter als keins,
 * und ohne Impressum darf nichts verkauft werden. Im Entwicklungsserver immer.
 */
export const salesVisible = () => import.meta.env.DEV || legalMissing().length === 0;
