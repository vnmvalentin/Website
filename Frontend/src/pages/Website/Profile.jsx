// src/pages/Website/Profile.jsx — Profil-Seite: Stufe und Abzeichen, Anmeldewege des Kontos (Twitch, Discord,
// Wiederherstellungscode), Abo, öffentliches Profil, Name, Abmelden und Konto löschen.
//
// Zwei Arten von Angemeldeten: mit Twitch (TwitchAuthContext.user, dazu immer ein Konto) und nur mit Discord oder als
// Gast (nur das Konto aus utils/konto.js). Abo und öffentliches Profil gibt es nur mit Twitch.
import { isValidElement, useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import SEO from "../../components/SEO";
import AboPanel from "../../components/AboPanel";
import KontoBild from "../../components/KontoBild";
import { PREMIUM_PRICE } from "../../utils/billingApi";
import { salesVisible } from "../../config/legal";
import { TwitchGlyph, DiscordGlyph } from "../../components/BrandGlyphs";
import { Page, PageHeader, Card, Section, Button, Input, Field, Dialog } from "../../components/ui";
import LanguageSwitch from "../../i18n/LanguageSwitch";
import { useLanguage } from "../../i18n/language.js";
import { PROFIL_TEXTE } from "./profilTexte.js";
import {
  useKonto, oeffneAnmeldung, mitDiscordAnmelden, trenneAnmeldeweg, erstelleNeuenCode, setzeKontoName, loescheKonto,
} from "../../utils/konto.js";
import {
  ShieldCheck, Link2, Unlink, LogOut, RefreshCw, ArrowRight, Check, Sparkles, Globe, KeyRound, Copy, Trash2, Award,
  ExternalLink, AlertTriangle,
} from "lucide-react";

import { STREAMER_ID } from "../../config/owner";

const zahl = (n) => Number(n || 0).toLocaleString("de-DE");

// Schalter fürs öffentliche Profil. Name und Bild schickt der Browser mit — der Server kennt sonst nur ID und Login.
function PublicProfileSection({ user, t }) {
  const [state, setState] = useState({ loading: true, enabled: false, login: "", busy: false, error: false });

  useEffect(() => {
    let alive = true;
    fetch("/api/public-profile/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setState((s) => ({ ...s, loading: false, enabled: !!d?.enabled, login: d?.login || "" })); })
      .catch(() => { if (alive) setState((s) => ({ ...s, loading: false })); });
    return () => { alive = false; };
  }, [user?.id]);

  const toggle = async () => {
    const next = !state.enabled;
    setState((s) => ({ ...s, busy: true, error: false }));
    try {
      const r = await fetch("/api/public-profile/me", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next, displayName: user.displayName, avatar: user.profileImageUrl }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error();
      setState((s) => ({ ...s, busy: false, enabled: !!d.enabled, login: d.login }));
    } catch {
      setState((s) => ({ ...s, busy: false, error: true }));
    }
  };

  const login = state.login || String(user.login || "").toLowerCase();
  return (
    <Section className="lg:col-span-2" icon={Globe} title={t.publicTitle} description={t.publicHint}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-sm font-semibold ${state.enabled ? "text-emerald-300" : "text-white/45"}`}>
          {state.loading ? "…" : state.enabled ? t.publicOn : t.publicOff}
        </span>
        <Button variant="secondary" onClick={toggle} disabled={state.loading || state.busy}>
          {state.enabled ? t.publicDisable : t.publicEnable}
        </Button>
        {state.enabled && (
          <Link to={`/u/${login}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-soft hover:text-white">
            {t.publicOpen} <ArrowRight size={14} />
          </Link>
        )}
        {state.enabled && <span className="text-xs text-white/35">vnmvalentin.de/u/{login}</span>}
        {state.error && <span className="text-xs text-red-300">{t.publicError}</span>}
      </div>
    </Section>
  );
}

// Website-Stufe aus den Erfahrungspunkten aller angebundenen Spiele, dazu Spiele und Abzeichen
function FortschrittSection({ konto, t, lang }) {
  const { stufe } = konto;
  const spanne = Math.max(1, stufe.naechste - stufe.ab);
  const anteil = Math.min(100, Math.round(((stufe.xp - stufe.ab) / spanne) * 100));
  const name = (e) => e.name?.[lang] || e.name?.de || e.erfolg;
  return (
    <Section className="lg:col-span-2" icon={Award} title={t.fortschrittTitel} description={t.fortschrittHinweis}>
      <div className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <span className="font-display text-2xl font-bold text-white">{t.stufe(stufe.stufe)}</span>
            <span className="text-xs text-white/45 tabular-nums">{t.xpBisNaechste(zahl(stufe.naechste - stufe.xp), stufe.stufe + 1)}</span>
          </div>
          <div className="h-2.5 rounded-sm bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${anteil}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">{t.spieleTitel}</h3>
            {konto.spiele.length === 0 ? (
              <p className="text-sm text-white/40">{t.nochNichts}</p>
            ) : (
              <ul className="divide-y divide-white/5 rounded-lg border border-line bg-black/20">
                {konto.spiele.map((s) => (
                  <li key={s.spiel} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-white/85 truncate">{s.name}</span>
                    <span className="text-white/50 tabular-nums shrink-0">{t.xp(zahl(s.xp))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">{t.abzeichenTitel}</h3>
            {konto.erfolge.length === 0 ? (
              <p className="text-sm text-white/40">{t.keineAbzeichen}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {konto.erfolge.map((e) => (
                  <li key={`${e.spiel}:${e.erfolg}`} title={e.text?.[lang] || e.text?.de || ""}
                    className="flex items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                    <Award size={12} className="text-amber-300" /> {name(e)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

// icon: ein Symbol-Bauteil (lucide/BrandGlyphs — oft forwardRef-Objekte, keine Funktionen) oder ein fertiges Element
function WegZeile({ icon, farbe, titel, text, children }) {
  const Icon = icon;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg bg-black/25 border border-line p-4">
      <span className={`flex items-center justify-center w-11 h-11 rounded-lg shrink-0 overflow-hidden ${farbe}`}>
        {isValidElement(Icon) ? Icon : <Icon size={20} />}
      </span>
      <div className="flex-1 min-w-[10rem]">
        <p className="text-sm font-semibold text-white truncate">{titel}</p>
        <p className="text-xs text-white/45">{text}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

function Verbunden({ t }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
      <Check size={12} /> {t.connected}
    </span>
  );
}

// Anmeldewege des Kontos. Twitch verknüpfen = die normale Twitch-Anmeldung: der Server hängt Twitch an das Konto der
// laufenden Sitzung (Backend/index.js, POST /api/auth/twitch). Discord läuft über /api/konto/discord/start.
function AnmeldewegeSection({ konto, t, onTwitch, onCode }) {
  const [busy, setBusy] = useState("");
  const [fehler, setFehler] = useState("");
  const wege = (konto.twitch ? 1 : 0) + (konto.discord ? 1 : 0) + (konto.hatCode ? 1 : 0);

  const trennen = async (art) => {
    if (art === "twitch" && !window.confirm(t.twitchTrennenHinweis)) return;
    setBusy(art);
    setFehler("");
    try {
      await trenneAnmeldeweg(art);
      if (art === "twitch") window.location.reload(); // Twitch-Stand im Browser passt sonst nicht mehr
    } catch (e) {
      setFehler(e?.fehler === "letzter-weg" ? t.letzterWeg : (e?.message || t.fehler));
    }
    setBusy("");
  };

  return (
    <Section className="lg:col-span-2" icon={Link2} title={t.wegeTitel} description={t.wegeHinweis}>
      <div className="space-y-3">
        <WegZeile icon={TwitchGlyph} farbe="bg-twitch/15 border border-twitch/30 text-[#a970ff]" titel={t.twitch}
          text={konto.twitch ? konto.twitch.name : t.notLinked}>
          {konto.twitch ? (
            <>
              <Verbunden t={t} />
              <Button variant="ghost" size="sm" icon={Unlink} onClick={() => trennen("twitch")} disabled={busy !== "" || wege < 2}
                title={wege < 2 ? t.letzterWeg : undefined}>{t.unlinkBtn}</Button>
            </>
          ) : (
            <Button variant="twitch" size="sm" icon={Link2} onClick={onTwitch}>{t.linkBtn}</Button>
          )}
        </WegZeile>

        <WegZeile
          icon={konto.discord?.avatar ? <img src={konto.discord.avatar} alt="" className="w-full h-full object-cover" /> : DiscordGlyph}
          farbe="bg-discord/15 border border-discord/30 text-[#7984f5]" titel={t.discord}
          text={konto.discord ? konto.discord.name : t.notLinked}>
          {konto.discord ? (
            <>
              <Verbunden t={t} />
              <Button variant="ghost" size="sm" icon={Unlink} onClick={() => trennen("discord")} disabled={busy !== "" || wege < 2}
                title={wege < 2 ? t.letzterWeg : undefined}>{t.unlinkBtn}</Button>
            </>
          ) : (
            <Button variant="discord" size="sm" icon={Link2} onClick={() => mitDiscordAnmelden("/profile")}>{t.linkBtn}</Button>
          )}
        </WegZeile>

        <WegZeile icon={KeyRound} farbe="bg-white/[0.06] border border-line text-white/70" titel={t.code}
          text={konto.hatCode ? t.codeVorhanden : t.codeFehlt}>
          <Button variant="secondary" size="sm" icon={KeyRound} onClick={onCode}>{konto.hatCode ? t.codeNeu : t.codeErstellen}</Button>
        </WegZeile>

        {fehler && (
          <p className="flex items-center gap-2 text-xs text-red-300 px-1"><AlertTriangle size={13} /> {fehler}</p>
        )}
      </div>
    </Section>
  );
}

function CodeDialog({ code, onClose, t }) {
  const [kopiert, setKopiert] = useState(false);
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch { /* abschreiben geht immer */ }
  };
  return (
    <Dialog open={Boolean(code)} onClose={onClose} title={t.codeDialogTitel} width="sm" dismissible={false}
      footer={<Button onClick={onClose}>{t.fertig}</Button>}>
      <p className="text-sm text-white/70 mb-4">{t.codeDialogText}</p>
      <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-4 space-y-3">
        <code className="block text-center font-mono text-xl font-bold tracking-wider text-white select-all whitespace-nowrap">{code}</code>
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" icon={kopiert ? Check : Copy} onClick={kopieren}>{kopiert ? t.kopiert : t.kopieren}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function NameFeld({ konto, anzeigeName, t }) {
  const [name, setName] = useState(anzeigeName);
  const [stand, setStand] = useState({ busy: false, ok: false, fehler: "" });
  useEffect(() => { setName(anzeigeName); }, [anzeigeName]);
  const speichern = async (e) => {
    e.preventDefault();
    setStand({ busy: true, ok: false, fehler: "" });
    try {
      await setzeKontoName(name);
      setStand({ busy: false, ok: true, fehler: "" });
    } catch (err) {
      setStand({ busy: false, ok: false, fehler: err?.message || t.fehler });
    }
  };
  return (
    <form onSubmit={speichern}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t.nameFeld} className="flex-1 min-w-[12rem]">
          <Input value={name} onChange={(e) => { setName(e.target.value); setStand((s) => ({ ...s, ok: false })); }} maxLength={24} />
        </Field>
        <Button type="submit" variant="secondary" icon={stand.ok ? Check : undefined}
          disabled={stand.busy || (konto.nameEigen && name.trim() === konto.name) || name.trim() === anzeigeName || name.trim().length < 2}>
          {stand.ok ? t.nameGespeichert : t.nameSpeichern}
        </Button>
      </div>
      {/* Hinweis unter der Zeile statt im Feld — sonst säße der Knopf tiefer als das Eingabefeld */}
      <p className={`text-xs mt-1.5 ${stand.fehler ? "text-red-300" : "text-white/40"}`}>{stand.fehler || t.nameHinweis}</p>
    </form>
  );
}

const kachel = "group flex items-center gap-3 rounded-lg bg-black/25 border border-line hover:border-white/20 hover:bg-white/5 p-4 text-left transition-colors";

export default function Profile() {
  const { user, login, logout } = useContext(TwitchAuthContext);
  const { konto, geladen } = useKonto();
  const navigate = useNavigate();
  const isAdmin = !!user && String(user.id) === STREAMER_ID;
  const { lang, setLang } = useLanguage({ supported: PROFIL_TEXTE.langs });
  const t = PROFIL_TEXTE.dict(lang);

  const [botStatus, setBotStatus] = useState(null); // Discord-Verknüpfung des Bot-Dashboards (Twitch-Konten)
  const [neuerCode, setNeuerCode] = useState("");
  const [codeFehler, setCodeFehler] = useState("");
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenBusy, setLoeschenBusy] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    fetch("/api/discord/link-status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setBotStatus(d?.linked ? d.user : null); })
      .catch(() => { /* ohne Status keine Zeile */ });
    return () => { cancelled = true; };
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const codeErstellen = async () => {
    setCodeFehler("");
    try {
      setNeuerCode(await erstelleNeuenCode());
    } catch (e) {
      setCodeFehler(e?.message || t.fehler);
    }
  };

  const kontoLoeschen = async () => {
    setLoeschenBusy(true);
    try {
      await loescheKonto();
      logout();
      navigate("/");
    } catch {
      setLoeschenBusy(false);
    }
  };

  const sprachwahl = <LanguageSwitch lang={lang} langs={PROFIL_TEXTE.langs} onChange={setLang} label={t.sprache} />;
  const seo = <SEO title={t.metaTitle} description={t.metaDescription} path="/profile" lang={lang} />;

  if (!user && !konto) {
    return (
      <Page width="narrow" className="flex flex-col items-center justify-center min-h-[60vh]">
        {seo}
        <Card className="p-10 max-w-md w-full flex flex-col items-center gap-5 relative text-center">
          <div className="absolute top-4 right-4">{sprachwahl}</div>
          <span className="flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 border border-accent/25 text-accent-soft">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white mb-2">{t.loggedOutTitle}</h1>
            <p className="text-sm text-white/55">{geladen ? t.loggedOutHint : t.laedt}</p>
          </div>
          {geladen && <Button onClick={oeffneAnmeldung}>{t.anmelden}</Button>}
        </Card>
      </Page>
    );
  }

  const unterzeile = user
    ? <span className="flex items-center gap-1.5"><TwitchGlyph size={14} className="text-twitch" /> @{user.login}</span>
    : <span>{konto?.discord ? t.discordKonto(konto.discord.name) : t.gastKonto}</span>;
  // Twitch-Nutzer heißen wie bei Twitch, solange sie sich keinen eigenen Namen geben (das Konto alter Sitzungen kennt
  // anfangs nur den Login in Kleinbuchstaben)
  const anzeigeName = user ? (konto?.nameEigen ? konto.name : user.displayName) : konto.name;
  // Stufe und Abzeichen erst zeigen, wenn es etwas zu zeigen gibt — bis die Spiele angebunden sind (Spur D), stünde
  // sonst bei allen „Stufe 1“ ohne Abzeichen
  const hatFortschritt = Boolean(konto && (konto.spiele.length > 0 || konto.erfolge.length > 0));

  return (
    <Page width="default" className="py-4 md:py-8">
      {seo}

      <PageHeader
        media={user
          ? <img src={user.profileImageUrl} alt="" className="w-20 h-20 rounded-lg object-cover border border-line" />
          : <KontoBild konto={konto} className="w-20 h-20 rounded-lg" schrift="text-3xl" />}
        title={anzeigeName}
        description={(
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {unterzeile}
            {hatFortschritt && <span className="text-accent-soft font-semibold">{t.stufe(konto.stufe.stufe)}</span>}
          </span>
        )}
        actions={sprachwahl}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {hatFortschritt && <FortschrittSection konto={konto} t={t} lang={lang} />}

        {konto && <AnmeldewegeSection konto={konto} t={t} onTwitch={() => login(false)} onCode={codeErstellen} />}
        {codeFehler && <p className="lg:col-span-2 text-xs text-red-300">{codeFehler}</p>}

        {/* Die Discord-Verbindung des Bot-Dashboards (Server verwalten, eigener Zugriff) — verknüpft wird im Dashboard */}
        {user && botStatus && (
          <Section className="lg:col-span-2" icon={DiscordGlyph} title={t.botTitel} description={t.botHinweis(botStatus.username || "Discord")}>
            <Button to="/discord-bot" variant="secondary" icon={ExternalLink}>{t.botOeffnen}</Button>
          </Section>
        )}

        {/* ===== Premium-Abo: Stand, abschließen, verwalten, kündigen =====
            Erst sichtbar, wenn verkauft werden darf (config/legal.js) */}
        {user && salesVisible() && (
          <Section className="lg:col-span-2" icon={Sparkles} title={t.aboTitle} description={t.aboHint(PREMIUM_PRICE)}>
            <AboPanel returnPath="/profile" lang={lang === "en" ? "en" : "de"} />
          </Section>
        )}

        {/* ===== Öffentliches Profil (/u/<login>, opt-in) ===== */}
        {user && <PublicProfileSection user={user} t={t} />}

        {/* ===== Konto ===== */}
        <Section className="lg:col-span-2" title={t.accountTitle}>
          {konto && <div className="mb-4"><NameFeld konto={konto} anzeigeName={anzeigeName} t={t} /></div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {user && (
              <button type="button" onClick={() => login(true)} className={kachel}>
                <RefreshCw size={18} className="text-white/40 group-hover:text-accent-soft transition-colors shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-white">{t.switchAccount}</span>
                  <span className="block text-xs text-white/40 mt-0.5">{t.switchAccountHint}</span>
                </span>
              </button>
            )}

            {isAdmin && (
              <Link
                to="/admin"
                className="group flex items-center gap-3 rounded-lg bg-red-500/5 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 p-4 transition-colors"
              >
                <ShieldCheck size={18} className="text-red-400 shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-red-200">{t.adminPanel}</span>
                  <span className="block text-xs text-red-300/50 mt-0.5">{t.adminPanelHint}</span>
                </span>
                <ArrowRight size={15} className="text-red-400/40 group-hover:text-red-300 group-hover:translate-x-1 transition-all shrink-0" />
              </Link>
            )}

            <button type="button" onClick={handleLogout} className={kachel}>
              <LogOut size={18} className="text-white/40 group-hover:text-white transition-colors shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-white">{t.logout}</span>
                <span className="block text-xs text-white/40 mt-0.5">{t.logoutHint}</span>
              </span>
            </button>

            {konto && (
              <button type="button" onClick={() => setLoeschenOffen(true)}
                className="group flex items-center gap-3 rounded-lg bg-black/25 border border-line hover:border-red-500/40 hover:bg-red-500/5 p-4 text-left transition-colors">
                <Trash2 size={18} className="text-white/40 group-hover:text-red-300 transition-colors shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-white">{t.loeschen}</span>
                  <span className="block text-xs text-white/40 mt-0.5">{t.loeschenHint}</span>
                </span>
              </button>
            )}
          </div>
        </Section>
      </div>

      <CodeDialog code={neuerCode} onClose={() => setNeuerCode("")} t={t} />

      <Dialog open={loeschenOffen} onClose={() => setLoeschenOffen(false)} title={t.loeschenTitel} width="sm"
        dismissible={!loeschenBusy}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setLoeschenOffen(false)} disabled={loeschenBusy}>{t.abbrechen}</Button>
            <Button variant="danger" icon={Trash2} onClick={kontoLoeschen} loading={loeschenBusy}>{t.endgueltig}</Button>
          </>
        )}>
        <p className="text-sm text-white/70">{t.loeschenText}</p>
        {user && <p className="text-xs text-white/45 mt-3">{t.loeschenTwitch}</p>}
      </Dialog>
    </Page>
  );
}
