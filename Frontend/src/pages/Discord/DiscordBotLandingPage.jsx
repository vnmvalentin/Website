// DiscordBotLandingPage.jsx — Einstiegsseite des Discord-Bots /tools/discord-bot (Ausbauplan „discord-verzeichnis“).
// Für Bot-Listen, Discords App-Verzeichnis und die Begrüßung des Bots auf neuen Servern: oben Text und ein Beispiel,
// wie der Bot schreibt, darunter Funktionen, drei Schritte, Fragen und die Rechtstexte. Sieht für alle gleich aus,
// Deutsch und Englisch (?lang=en), vorgerendert (prerender.js). Aufbau wie die Produktseiten der Overlays.
// Texte: landingTexts.js. Einladungs-Link und Server-Zahl: GET /api/discord/bot-info (Backend/discord/api/setup.js).
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, UserPlus, MousePointerClick, LifeBuoy, Radio, Volume2, Coins, BarChart3, CheckSquare, Languages, Bot,
} from "lucide-react";
import SEO from "../../components/SEO";
import FaqAccordion from "../../components/FaqAccordion";
import { Page, SectionHeading, Button } from "../../components/ui";
import { useLanguage } from "../../i18n/language";
import { withLang } from "../StreamerTools/productTexts";
import { LANDING_TEXTS, LANDING_PATH, LANDING_IMAGE, buildLandingJsonLd } from "./landingTexts";
import "./discord.css";

/** Symbole der Funktionen, in der Reihenfolge von features in landingTexts.js. */
const FEATURE_ICONS = [UserPlus, MousePointerClick, LifeBuoy, Radio, Volume2, Coins, BarChart3, CheckSquare, Languages];

const SECTION = "mb-14 md:mb-20 scroll-mt-6";

/** Fettdruck mit **…** wie in Discord, sonst Text (die Beispiele kommen aus landingTexts.js, nie vom Nutzer). */
function Md({ text }) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong> : part
  ));
}

/** Eine Nachricht des Bots im Stil von Discords dunklem Design (Klassen aus discord.css). */
function BotMessage({ c, children, first = false }) {
  return (
    <div className={`flex gap-3.5 px-4 ${first ? "pt-4" : "pt-1"} pb-1`}>
      {first ? (
        <span className="dc-preview-avatar" aria-hidden="true"><Bot size={20} /></span>
      ) : (
        <span className="w-10 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        {first && (
          <div className="dc-preview-head">
            <b>{c.bot}</b>
            <span className="dc-preview-app">APP</span>
            <time>{c.today}</time>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function ChatExample({ c }) {
  const [before, after] = c.welcome.split("{user}");
  return (
    <div className="rounded-lg overflow-hidden border border-line bg-[#313338] pb-4 text-left"
      style={{ fontFamily: '"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <BotMessage c={c} first>
        <p className="dc-preview-text">{before}<span className="dc-mention">@Mika</span>{after}</p>
      </BotMessage>
      <BotMessage c={c}>
        <div className="dc-embed !mt-1">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[#f2f3f5]">{c.rolesTitle}</p>
            <p className="dc-embed-text">{c.rolesText}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {c.roles.map((r) => (
            <span key={r} className="h-8 px-3.5 inline-flex items-center rounded-[3px] bg-[#4e5058] text-[14px] font-medium text-white">{r}</span>
          ))}
        </div>
      </BotMessage>
      <BotMessage c={c}>
        <p className="dc-preview-text mt-1"><Md text={c.live} /></p>
      </BotMessage>
      <BotMessage c={c}>
        <div className="dc-embed !mt-1 !border-l-[#f0b232]">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[#f2f3f5]">{c.dailyTitle}</p>
            <p className="dc-embed-text whitespace-pre-line"><Md text={c.dailyBody} /></p>
          </div>
        </div>
      </BotMessage>
    </div>
  );
}

export default function DiscordBotLandingPage() {
  const { lang } = useLanguage({ supported: LANDING_TEXTS.langs, syncUrl: true });
  const t = LANDING_TEXTS.dict(lang);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/discord/bot-info")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setInfo(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Ohne Antwort (Vorrendern, Server startet neu) führt „Hinzufügen“ ins Dashboard — dort steht je Server ein Einladen-Knopf
  const dashboard = withLang("/discord-bot", lang);
  const addButton = info?.invite
    ? <Button href={info.invite} size="lg" icon={ArrowRight} data-discord-add>{t.ui.add}</Button>
    : <Button to={dashboard} size="lg" icon={ArrowRight} data-discord-add>{t.ui.add}</Button>;

  return (
    <Page width="wide" className="py-4 md:py-8">
      <SEO
        title={t.seoTitle}
        description={t.description}
        keywords={t.keywords}
        path={LANDING_PATH}
        search={lang === "en" ? "?lang=en" : ""}
        lang={lang}
        image={LANDING_IMAGE}
        alternates={[
          { hrefLang: "de", path: LANDING_PATH },
          { hrefLang: "en", path: LANDING_PATH, search: "?lang=en" },
          { hrefLang: "x-default", path: LANDING_PATH },
        ]}
        jsonLd={buildLandingJsonLd(lang)}
      />

      <Button to={withLang("/tools", lang)} variant="ghost" icon={ArrowLeft} className="-ml-3 mb-6 md:mb-8">{t.ui.back}</Button>

      {/* ── Kopf: Text links, Beispiel rechts ─────────────────────────────── */}
      <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 lg:gap-12 items-center mb-14 md:mb-20">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-soft/80 mb-3">{t.kicker}</p>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight text-balance">{t.h1}</h1>
          <p className="text-white/60 text-base md:text-lg mt-4 leading-relaxed max-w-xl">{t.lead}</p>
          <div className="flex flex-wrap gap-3 mt-7">
            {addButton}
            <Button to={dashboard} variant="secondary" size="lg">{t.ui.dashboard}</Button>
          </div>
          <p className="text-white/40 text-xs mt-4">
            {t.ui.facts}
            {info?.servers > 0 && <span data-discord-servers> · {t.ui.servers(info.servers)}</span>}
          </p>
        </div>
        <figure className="min-w-0">
          <ChatExample c={t.chat} />
          <figcaption className="text-xs text-white/40 mt-2.5">{t.ui.previewNote}</figcaption>
        </figure>
      </header>

      {/* ── Funktionen ───────────────────────────────────────────────────── */}
      <section aria-labelledby="db-features" className={SECTION}>
        <SectionHeading id="db-features" title={t.ui.featuresHeading} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8">
          {t.features.map((f, i) => {
            const Icon = FEATURE_ICONS[i] || Bot;
            return (
              <div key={f.title} className="flex items-start gap-3.5 min-w-0">
                <Icon size={18} className="text-white/40 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-white font-semibold text-sm mb-1.5">{f.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{f.text}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-10 border-t border-line pt-6">
          <h3 className="text-white font-semibold text-sm mb-3">{t.ui.alsoHeading}</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2 text-sm text-white/55">
            {t.also.map((a) => <li key={a} className="flex gap-2"><span aria-hidden="true" className="text-white/25">–</span>{a}</li>)}
          </ul>
        </div>
      </section>

      {/* ── Drei Schritte ─────────────────────────────────────────────────── */}
      <section aria-labelledby="db-steps" className={SECTION}>
        <SectionHeading id="db-steps" title={t.ui.stepsHeading} />
        <ol className="grid grid-cols-1 md:grid-cols-3 rounded-lg border border-line divide-y md:divide-y-0 md:divide-x divide-white/10">
          {t.steps.map((s, i) => (
            <li key={s.name} id={`schritt-${i + 1}`} className="p-5 md:p-6">
              <span className="block font-display text-2xl font-bold text-white/30 tabular-nums mb-3">{i + 1}</span>
              <h3 className="font-semibold text-white mb-1.5">{s.name}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">{addButton}</div>
      </section>

      {/* ── Fragen ───────────────────────────────────────────────────────── */}
      <section className={`${SECTION} max-w-3xl`}>
        <FaqAccordion items={t.faq} heading={t.ui.faqHeading}
          headingClassName="font-display text-lg md:text-xl font-bold text-white tracking-tight mb-4 md:mb-5" />
      </section>

      {/* ── Rechtliches (Pflicht für Bot-Listen und Discords App-Verzeichnis) ─ */}
      <section aria-labelledby="db-legal" className="max-w-3xl">
        <h2 id="db-legal" className="text-white font-semibold text-sm mb-3">{t.ui.legalHeading}</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to="/discord-bot/privacy" className="text-accent-soft hover:text-white underline underline-offset-2">{t.ui.privacy}</Link>
          <Link to="/discord-bot/terms" className="text-accent-soft hover:text-white underline underline-offset-2">{t.ui.terms}</Link>
        </div>
      </section>
    </Page>
  );
}
