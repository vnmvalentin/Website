import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import SEO from '../../components/SEO';

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-white">{title}</h2>
      <div className="text-white/60 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function List({ items }) {
  return (
    <ul className="list-disc list-outside pl-5 space-y-1.5">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

export default function DiscordBotPrivacyPage() {
  return (
    <div className="page-fade h-full overflow-y-auto custom-scrollbar">
      <SEO
        title="Datenschutzerklärung – Discord Bot"
        description="Datenschutzerklärung für den vnmvalentin Discord-Bot und das Bot-Dashboard."
        path="/discord-bot/privacy"
      />

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-14">

        <Link to="/discord-bot" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-xs font-semibold mb-6 transition-colors">
          <ArrowLeft size={13} /> Zurück zum Bot-Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
            <ShieldCheck size={20} />
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white tracking-tight">Datenschutzerklärung</h1>
        </div>
        <p className="text-white/30 text-xs mb-1">Stand: 23. Juli 2026</p>
        <p className="text-white/30 text-xs italic mb-10">
          Diese Erklärung beschreibt so genau wie möglich, welche Daten der Discord-Bot und sein Web-Dashboard tatsächlich verarbeiten. Sie ersetzt keine Rechtsberatung — bei rechtlichen Zweifeln bitte anwaltlich prüfen lassen.
        </p>

        <div className="panel-strong p-6 md:p-8 space-y-8">

          <Section title="1. Geltungsbereich">
            <p>
              Diese Datenschutzerklärung gilt für die Nutzung des Discord-Bots von <strong className="text-white">vnmvalentin</strong> auf
              jedem Discord-Server, auf dem der Bot aktiv ist, sowie für das zugehörige Web-Dashboard unter{' '}
              <code className="text-violet-300 text-xs">vnmvalentin.de/discord-bot</code>.
            </p>
          </Section>

          <Section title="2. Verantwortlicher">
            <p>
              Verantwortlich im Sinne der DSGVO ist <strong className="text-white">vnmvalentin</strong>. Da dieses Projekt privat und
              nicht-kommerziell betrieben wird, erfolgt der Kontakt ausschließlich über den offiziellen Support-Discord-Server:
            </p>
            <a href="https://discord.gg/ecRJSx2R6x" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/25 border border-white/10 hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 transition-colors text-white font-semibold text-sm">
              discord.gg/ecRJSx2R6x
            </a>
          </Section>

          <Section title="3. Verhältnis zu Discord">
            <p>
              Der Bot läuft technisch vollständig auf der Plattform Discord und nutzt deren offizielle API. Für alle Daten, die Discord
              selbst im Rahmen der Plattformnutzung verarbeitet (z. B. Kontoerstellung, Nachrichtenspeicherung auf Discord-Servern,
              Endgeräte-Daten), gilt zusätzlich die Datenschutzerklärung von Discord Inc.:{' '}
              <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:text-violet-200 underline">
                discord.com/privacy
              </a>. Die folgenden Abschnitte beschreiben ausschließlich die zusätzliche Verarbeitung durch unseren Bot.
            </p>
          </Section>

          <Section title="4. Welche Daten verarbeitet der Bot?">
            <p><strong className="text-white/80">Discord-Kontodaten (bei jeder Interaktion):</strong></p>
            <List items={[
              'Discord-Nutzer-ID, Benutzername/Anzeigename und Avatar-URL — werden gelesen, um Befehle zu beantworten, Nachrichten zu personalisieren oder Rollen zu vergeben. Ohne separate Erwähnung unten werden diese Daten nicht dauerhaft gespeichert.',
            ]} />

            <p><strong className="text-white/80">Server-Konfigurationsdaten (von Admins im Dashboard eingerichtet):</strong></p>
            <List items={[
              'Allgemeine Einstellungen wie Präfix, Bot-Nickname, Fun-Command-Kanal, deaktivierte Befehle',
              'Willkommens-/Abschieds-Kanal und -Nachrichtenvorlagen',
              'Rollen-Buttons (welche Discord-Rollen ein Reaction-Role-Button vergibt)',
              'Bewerbungs-/Genehmigungs-Setups inkl. der Nutzer-IDs festgelegter Prüfer:innen',
              'Sprachkanal-Automatisierung (Trigger-Kanal für private Voice-Channels)',
              'Twitch-Live-Benachrichtigungen (Twitch-Nutzernamen, Ziel-Kanal)',
              '„Live"-Rolle bei Streaming-Status',
              'Image-Only-Kanal-Konfiguration',
              '„Taverne"-Server-Chat-Verknüpfungen inklusive der dafür angelegten Discord-Webhook-Zugangsdaten',
              'Ticket-System-Konfiguration (Formularfelder, zuständige Rollen)',
              'Auto-Role-Automatisierungen',
            ]} />
            <p>Diese Konfigurationsdaten betreffen den Server als Ganzes und werden gespeichert, solange der Bot auf dem jeweiligen Server aktiv ist.</p>

            <p><strong className="text-white/80">Personenbezogene Daten, die dauerhaft gespeichert werden:</strong></p>
            <List items={[
              'Support-Tickets: Deine Nutzer-ID, dein Benutzername sowie die von dir frei eingegebenen Antworten im Ticket-Formular — bleiben auch nach Schließung des Tickets in unserer Datenbank gespeichert (aktuell keine automatische Löschung).',
              'Bewerbungs-/Genehmigungsanfragen: Deine Nutzer-ID, die zugehörige Thread-ID, der Status (offen/angenommen/abgelehnt) sowie Zeitstempel.',
              'Sprachkanal-Aktivität: Deine Nutzer-ID, der genutzte Sprachkanal und die Verbindungsdauer, aggregiert pro Tag.',
            ]} />
            <p>
              Aktuell existiert für keine dieser drei Tabellen eine automatische Löschfrist — auch wenn der Bot von einem Server entfernt
              wird oder du den Server verlässt, bleiben bereits gespeicherte Einträge bestehen, bis sie aktiv gelöscht werden
              (siehe Abschnitt 9 „Deine Rechte").
            </p>

            <p><strong className="text-white/80">Weitere Verarbeitung ohne dauerhafte Speicherung:</strong></p>
            <List items={[
              '„Taverne" (serverübergreifender Chat): Schreibst du in einem dafür konfigurierten Kanal, werden dein Nachrichtentext, angehängte Dateien, dein Anzeigename und Avatar live per Webhook an alle anderen verknüpften Server weitergeleitet.',
              'Image-Only-Kanäle: Nachrichten werden auf Bildanhänge geprüft; Nachrichten ohne Bild werden automatisch gelöscht.',
              'Spaß-Befehle (z. B. /pp, /iq, /größe, /gewicht, /aussehen, /ship, /coinflip, /connect3, /magische_miesmuschel): Nutzer-ID/Name der aufrufenden bzw. erwähnten Person wird nur zur Erzeugung der Antwort gelesen, nicht gespeichert.',
              'Nachrichten-Statistiken: Es werden ausschließlich aggregierte Nachrichtenzähler pro Kanal und Tag gespeichert — ohne Inhalte und ohne Zuordnung zu einzelnen Nutzer:innen.',
            ]} />

            <p><strong className="text-white/80">Web-Dashboard (Discord-Verknüpfung):</strong></p>
            <List items={[
              'Verknüpfst du im Dashboard deinen Discord-Account, speichern wir in deiner Sitzung: Discord-Zugriffs- und Refresh-Token, deine Discord-ID, deinen Benutzernamen und deine Avatar-URL. Die Sitzung ist maximal 30 Tage gültig oder bis du die Verknüpfung über „Discord trennen" aufhebst.',
              'Mit diesem Zugriffstoken ruft das Dashboard kurzzeitig (max. 5 Minuten im Arbeitsspeicher zwischengespeichert) die Liste deiner Discord-Server samt Berechtigungen ab, um dir nur die Server anzuzeigen, in denen du Admin-Rechte hast.',
              'Zur Serververwaltung ruft das Dashboard außerdem live die Mitgliederliste (ID, Benutzername, Anzeigename, Avatar) des jeweils ausgewählten Servers von Discord ab — diese wird nicht dauerhaft bei uns gespeichert.',
            ]} />

            <p>Es werden keine IP-Adressen protokolliert.</p>
          </Section>

          <Section title="5. Zwecke der Verarbeitung">
            <List items={[
              'Bereitstellung und Betrieb der Bot-Funktionen (Moderation, Rollenvergabe, Willkommens-/Abschiedsnachrichten, Sprachkanal-Verwaltung, Support-Tickets, Statistiken, Unterhaltung)',
              'Konfiguration des Bots durch Server-Administrator:innen über das Web-Dashboard',
              'Missbrauchsprävention und Einhaltung der Discord-Richtlinien',
            ]} />
          </Section>

          <Section title="6. Rechtsgrundlage">
            <List items={[
              'Art. 6 Abs. 1 lit. b DSGVO — zur Erfüllung des Nutzungsverhältnisses, wenn du den Bot oder das Dashboard aktiv nutzt',
              'Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an Statistik, Missbrauchsprävention und Serververwaltung',
              'Art. 6 Abs. 1 lit. a DSGVO — Einwilligung, z. B. beim freiwilligen Ausfüllen eines Support-Ticket-Formulars',
            ]} />
          </Section>

          <Section title="7. Weitergabe an Dritte">
            <List items={[
              'Discord Inc. als Plattformbetreiber — technisch zwingend, da der Bot ausschließlich über die Discord-API funktioniert.',
              'Andere verknüpfte Discord-Server bei aktivierter „Taverne"-Funktion — dein Nachrichtentext, Anzeigename und Avatar werden dorthin weitergeleitet.',
            ]} />
            <p>Eine darüber hinausgehende Weitergabe an Dritte findet nicht statt. Deine Daten werden nicht verkauft.</p>
          </Section>

          <Section title="8. Speicherdauer">
            <List items={[
              'Server-Konfigurationsdaten: solange der Bot auf dem jeweiligen Server aktiv ist.',
              'Support-Tickets, Bewerbungsanfragen und Sprachkanal-Aktivität: aktuell unbegrenzt, da noch kein automatischer Löschprozess existiert. Löschung ist jederzeit auf Anfrage möglich (siehe unten).',
              'Web-Dashboard-Sitzung inkl. verknüpftem Discord-Account: läuft automatisch nach 30 Tagen ab oder wird sofort gelöscht, sobald du die Verknüpfung trennst.',
            ]} />
          </Section>

          <Section title="9. Deine Rechte">
            <p>Dir stehen die folgenden Rechte nach der DSGVO zu:</p>
            <List items={[
              'Auskunft über die zu dir gespeicherten Daten (Art. 15)',
              'Berichtigung unrichtiger Daten (Art. 16)',
              'Löschung deiner Daten (Art. 17)',
              'Einschränkung der Verarbeitung (Art. 18)',
              'Datenübertragbarkeit (Art. 20)',
              'Widerspruch gegen die Verarbeitung (Art. 21)',
              'Beschwerde bei einer Datenschutz-Aufsichtsbehörde',
            ]} />
            <p>
              Um eines dieser Rechte auszuüben — zum Beispiel die Löschung deiner Ticket- oder Sprachkanal-Daten zu verlangen —
              kontaktiere uns bitte über den Support-Discord-Server (siehe Abschnitt 2).
            </p>
          </Section>

          <Section title="10. Datensicherheit">
            <p>
              Alle Bot-Daten werden in einer lokal gehosteten Datenbank gespeichert und regelmäßig gesichert. Der Zugriff auf das
              Web-Dashboard erfolgt ausschließlich über OAuth-Anmeldung bei Twitch und Discord — es werden keine eigenen Passwörter
              erhoben oder gespeichert.
            </p>
          </Section>

          <Section title="11. Kinder und Jugendliche">
            <p>
              Discord selbst verlangt ein Mindestalter von 13 Jahren für die Kontoerstellung. Unser Bot erhebt keine über die normale
              Discord-Nutzung hinausgehenden Daten von Personen, die dieses Mindestalter nicht erfüllen.
            </p>
          </Section>

          <Section title="12. Änderungen dieser Datenschutzerklärung">
            <p>
              Diese Erklärung kann angepasst werden, wenn sich die Funktionen des Bots oder die rechtlichen Anforderungen ändern.
              Die jeweils aktuelle Version ist stets unter dieser Adresse einsehbar.
            </p>
          </Section>

          <Section title="13. Kontakt">
            <p>Fragen zum Datenschutz beantworten wir gerne über unseren Support-Discord:</p>
            <a href="https://discord.gg/ecRJSx2R6x" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/25 border border-white/10 hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 transition-colors text-white font-semibold text-sm">
              discord.gg/ecRJSx2R6x
            </a>
          </Section>

        </div>

        <p className="text-white/25 text-xs text-center mt-6">
          Siehe auch die <Link to="/discord-bot/terms" className="text-violet-300/70 hover:text-violet-300 underline">Nutzungsbedingungen</Link>.
        </p>
      </div>
    </div>
  );
}
