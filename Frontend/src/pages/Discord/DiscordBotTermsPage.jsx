import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowLeft } from 'lucide-react';
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

export default function DiscordBotTermsPage() {
  return (
    <div className="page-fade h-full overflow-y-auto custom-scrollbar">
      <SEO
        title="Nutzungsbedingungen – Discord Bot"
        description="Nutzungsbedingungen für den vnmvalentin Discord-Bot und das Bot-Dashboard."
        path="/discord-bot/terms"
      />

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-14">

        <Link to="/discord-bot" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-xs font-semibold mb-6 transition-colors">
          <ArrowLeft size={13} /> Zurück zum Bot-Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
            <FileText size={20} />
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-white tracking-tight">Nutzungsbedingungen</h1>
        </div>
        <p className="text-white/30 text-xs mb-1">Stand: 23. Juli 2026</p>
        <p className="text-white/30 text-xs italic mb-10">
          Diese Bedingungen gelten für die kostenlose, privat betriebene Nutzung des Discord-Bots und seines Web-Dashboards.
        </p>

        <div className="panel-strong p-6 md:p-8 space-y-8">

          <Section title="1. Geltungsbereich">
            <p>
              Diese Nutzungsbedingungen gelten für die Nutzung des Discord-Bots von <strong className="text-white">vnmvalentin</strong> auf
              jedem Discord-Server, auf dem er aktiv ist, sowie für das zugehörige Web-Dashboard unter{' '}
              <code className="text-violet-300 text-xs">vnmvalentin.de/discord-bot</code>. Mit dem Einladen des Bots auf einen Server bzw.
              der Nutzung eines seiner Befehle akzeptierst du diese Bedingungen.
            </p>
          </Section>

          <Section title="2. Voraussetzungen">
            <List items={[
              'Du benötigst ein eigenes, gültiges Discord-Konto und musst die Discord-Nutzungsbedingungen sowie die Discord-Richtlinien einhalten (u. a. das dort geltende Mindestalter von 13 Jahren).',
              'Für das Web-Dashboard ist zusätzlich eine Anmeldung über Twitch sowie optional die Verknüpfung eines Discord-Accounts erforderlich.',
            ]} />
          </Section>

          <Section title="3. Leistungsbeschreibung">
            <p>Der Bot bietet Server-Administrator:innen und Mitgliedern kostenlos u. a. folgende Funktionen:</p>
            <List items={[
              'Moderation (z. B. Image-Only-Kanäle, Rollen-Automatisierung)',
              'Willkommens- und Abschiedsnachrichten',
              'Rollen-Buttons und Bewerbungs-/Genehmigungs-Workflows',
              'Private Sprachkanal-Verwaltung',
              'Support-Ticket-System',
              'Server-übergreifender Chat („Taverne")',
              'Twitch-Live-Benachrichtigungen',
              'Statistiken sowie Spaß-/Unterhaltungsbefehle',
            ]} />
            <p>
              Der Bot wird als privates Freizeitprojekt „wie besehen" (as is) zur Verfügung gestellt. Es besteht kein Anspruch auf
              ständige Verfügbarkeit, Fehlerfreiheit oder eine bestimmte Funktionsweise.
            </p>
          </Section>

          <Section title="4. Pflichten der Nutzer:innen">
            <List items={[
              'Die Befehle des Bots dürfen nicht zur Belästigung, zum Spam oder zu sonstigem missbräuchlichen Verhalten eingesetzt werden.',
              'Für Inhalte, die du selbst über den Bot einreichst (z. B. Texte in Support-Ticket-Formularen oder im server-übergreifenden Chat), bist du selbst verantwortlich. Rechtswidrige, beleidigende oder diskriminierende Inhalte sind untersagt.',
              'Du bist verpflichtet, geltendes Recht sowie die Discord-Richtlinien einzuhalten.',
            ]} />
          </Section>

          <Section title="5. Pflichten der Server-Administrator:innen">
            <p>
              Wer den Bot auf einem eigenen Server einlädt und konfiguriert, ist dafür verantwortlich, die Funktionen im Einklang mit
              geltendem Recht einzurichten (z. B. korrekte Rollen-Zuweisungen) und die Mitglieder des eigenen Servers auf diese
              Nutzungsbedingungen sowie die{' '}
              <Link to="/discord-bot/privacy" className="text-violet-300 hover:text-violet-200 underline">Datenschutzerklärung</Link> hinzuweisen.
            </p>
          </Section>

          <Section title="6. Verfügbarkeit und Änderungen">
            <p>
              Der Bot wird kostenlos als Hobbyprojekt betrieben. Es besteht kein Anspruch auf durchgehende Verfügbarkeit. Funktionen
              können jederzeit ohne Vorankündigung geändert, eingeschränkt, erweitert oder eingestellt werden. Wartungsbedingte
              Unterbrechungen sind möglich.
            </p>
          </Section>

          <Section title="7. Haftungsausschluss">
            <List items={[
              'Es besteht keine Haftung für Datenverlust, Ausfälle oder Schäden, die durch Fehlkonfiguration, Missbrauch oder technische Störungen entstehen, soweit gesetzlich zulässig.',
              'Für Inhalte Dritter — etwa Nachrichten, die über die „Taverne"-Funktion von anderen, verknüpften Servern eingehen — wird keine Haftung übernommen.',
              'Diese Haftungsbeschränkung gilt nicht für Vorsatz oder grobe Fahrlässigkeit sowie nicht bei Verletzung von Leben, Körper oder Gesundheit.',
            ]} />
          </Section>

          <Section title="8. Beendigung">
            <List items={[
              'Server-Administrator:innen können den Bot jederzeit von ihrem eigenen Server entfernen.',
              'Der Betreiber behält sich vor, den Bot bei Missbrauch für einzelne Server oder Nutzer:innen zu sperren oder den Dienst insgesamt einzustellen.',
            ]} />
          </Section>

          <Section title="9. Datenschutz">
            <p>
              Welche Daten dabei verarbeitet werden, ist in der separaten{' '}
              <Link to="/discord-bot/privacy" className="text-violet-300 hover:text-violet-200 underline">Datenschutzerklärung</Link> beschrieben.
            </p>
          </Section>

          <Section title="10. Änderungen dieser Nutzungsbedingungen">
            <p>
              Diese Nutzungsbedingungen können bei Bedarf angepasst werden, insbesondere wenn sich der Funktionsumfang des Bots ändert.
              Die jeweils aktuelle Version ist stets unter dieser Adresse einsehbar.
            </p>
          </Section>

          <Section title="11. Anwendbares Recht">
            <p>
              Es gilt deutsches Recht. Sollte eine Bestimmung dieser Nutzungsbedingungen unwirksam sein oder werden, bleibt die
              Wirksamkeit der übrigen Bestimmungen davon unberührt.
            </p>
          </Section>

          <Section title="12. Kontakt">
            <p>Fragen zu diesen Nutzungsbedingungen beantworten wir gerne über unseren Support-Discord:</p>
            <a href="https://discord.gg/ecRJSx2R6x" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/25 border border-white/10 hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 transition-colors text-white font-semibold text-sm">
              discord.gg/ecRJSx2R6x
            </a>
          </Section>

        </div>

        <p className="text-white/25 text-xs text-center mt-6">
          Siehe auch die <Link to="/discord-bot/privacy" className="text-violet-300/70 hover:text-violet-300 underline">Datenschutzerklärung</Link>.
        </p>
      </div>
    </div>
  );
}
