// src/pages/Profile.jsx — Profil-Seite: Verknüpfungen (Twitch/Discord),
// Account wechseln, Code einlösen, Logout und Admin-Zugang.
import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import SEO from "../components/SEO";
import AboPanel from "../components/AboPanel";
import { PREMIUM_PRICE } from "../utils/billingApi";
import { salesVisible } from "../config/legal";
import { TwitchGlyph, DiscordGlyph } from "../components/BrandGlyphs";
import { Page, PageHeader, Card, Section, Button, Input, Segmented, TwitchLoginButton } from "../components/ui";
import {
  ShieldCheck,
  Link2,
  Unlink,
  LogOut,
  RefreshCw,
  Ticket,
  ArrowRight,
  Check,
  AlertTriangle,
  Sparkles,
  Globe,
} from "lucide-react";

import { STREAMER_ID } from "../config/owner";
const LANG_STORAGE_KEY = "site_lang";

// Nur DE/EN — WinTracker-Login läuft über diese Seite, englischsprachige Zuschauer müssen
// hier Account wechseln/Discord verknüpfen/ausloggen können. Kein globales i18n-System für
// die restliche Seite (siehe wtI18n.js-Kommentar zum selben Muster beim Win-Tracker).
const STRINGS = {
  de: {
    metaTitle: "Profil",
    metaDescription: "Dein Profil auf vnmvalentin.de",
    loggedOutTitle: "Dein Profil",
    loggedOutHint: "Melde dich mit Twitch an, um dein Profil, Verknüpfungen und Codes zu verwalten.",
    loginBtn: "Mit Twitch anmelden",
    linksTitle: "Verknüpfungen",
    linksHint: "Twitch ist dein Standard-Login. Optional kannst du deinen Discord-Account verbinden.",
    twitch: "Twitch",
    connected: "Verbunden",
    discord: "Discord",
    checkingStatus: "Prüfe Status...",
    linked: "Verknüpft",
    notLinked: "Nicht verknüpft",
    unlinkBtn: "Trennen",
    linkBtn: "Verknüpfen",
    discordLinkError: "Discord-Verknüpfung fehlgeschlagen. Versuch es später erneut.",
    redeemTitle: "Code einlösen",
    redeemHint: "Hast du einen Promo-Code aus dem Stream? Hier kannst du ihn aktivieren.",
    redeemPlaceholder: "Code eingeben",
    redeemBusy: "...",
    redeemBtn: "Einlösen",
    redeemGenericError: "Fehler beim Einlösen",
    aboTitle: "Premium-Abo",
    aboHint: (price) => `${price} pro Monat, monatlich kündbar. Schaltet die Stream-Szenen der Twitch-Overlay-Tools frei.`,
    publicTitle: "Öffentliches Profil",
    publicHint: "Eine teilbare Seite mit deinen Erfolgen: Win-Tracker-Statistik, Turniere, Seed-Runners-Level, adVentures und Farm. Nur sichtbar, wenn du es einschaltest — ausschalten geht jederzeit.",
    publicOn: "Öffentlich",
    publicOff: "Nicht öffentlich",
    publicEnable: "Einschalten",
    publicDisable: "Ausschalten",
    publicOpen: "Profil ansehen",
    publicError: "Konnte nicht gespeichert werden.",
    accountTitle: "Konto",
    switchAccount: "Account wechseln",
    switchAccountHint: "Mit anderem Twitch-Konto anmelden",
    adminPanel: "Admin Panel",
    adminPanelHint: "Dashboard & Verwaltung",
    logout: "Logout",
    logoutHint: "Von diesem Gerät abmelden",
    promo: {
      missing_code: "Kein Code",
      invalid: "Code ungültig",
      expired: "Code abgelaufen",
      exhausted: "Code aufgebraucht",
      already_used: "Du hast diesen Code schon benutzt",
      skin_unlocked: (v) => `Skin '${v}' freigeschaltet!`,
      skin_already_owned: (v) => `Skin '${v}' hattest du schon (Code trotzdem verbraucht).`,
    },
  },
  en: {
    metaTitle: "Profile",
    metaDescription: "Your profile on vnmvalentin.de",
    loggedOutTitle: "Your Profile",
    loggedOutHint: "Sign in with Twitch to manage your profile, links and codes.",
    loginBtn: "Sign in with Twitch",
    linksTitle: "Links",
    linksHint: "Twitch is your default login. You can optionally connect your Discord account.",
    twitch: "Twitch",
    connected: "Connected",
    discord: "Discord",
    checkingStatus: "Checking status...",
    linked: "Linked",
    notLinked: "Not linked",
    unlinkBtn: "Unlink",
    linkBtn: "Link",
    discordLinkError: "Discord link failed. Please try again later.",
    redeemTitle: "Redeem Code",
    redeemHint: "Got a promo code from the stream? Activate it here.",
    redeemPlaceholder: "Enter code",
    redeemBusy: "...",
    redeemBtn: "Redeem",
    redeemGenericError: "Error redeeming code",
    aboTitle: "Premium subscription",
    aboHint: (price) => `${price} per month, cancel anytime. Unlocks the stream scenes of the Twitch overlay tools.`,
    publicTitle: "Public profile",
    publicHint: "A shareable page with your achievements: Win Tracker stats, tournaments, Seed Runners levels, adVentures and the farm. Only visible if you turn it on — you can turn it off at any time.",
    publicOn: "Public",
    publicOff: "Not public",
    publicEnable: "Turn on",
    publicDisable: "Turn off",
    publicOpen: "View profile",
    publicError: "Could not be saved.",
    accountTitle: "Account",
    switchAccount: "Switch account",
    switchAccountHint: "Sign in with a different Twitch account",
    adminPanel: "Admin Panel",
    adminPanelHint: "Dashboard & management",
    logout: "Logout",
    logoutHint: "Sign out on this device",
    promo: {
      missing_code: "No code entered",
      invalid: "Invalid code",
      expired: "Code expired",
      exhausted: "Code already used up",
      already_used: "You've already used this code",
      skin_unlocked: (v) => `Unlocked skin '${v}'!`,
      skin_already_owned: (v) => `You already had skin '${v}' (code still used).`,
    },
  },
};

function readLang() {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return stored === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}

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

export default function Profile() {
  const { user, login, logout } = useContext(TwitchAuthContext);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = !!user && String(user.id) === STREAMER_ID;

  const [lang, setLang] = useState(readLang);
  const t = STRINGS[lang];
  const changeLang = (next) => {
    setLang(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* Speicher optional */ }
  };

  const [discordStatus, setDiscordStatus] = useState({ loading: true, linked: false, user: null });
  const [discordBusy, setDiscordBusy] = useState(false);
  const [linkError, setLinkError] = useState(searchParams.get("error") === "auth_failed");

  const [promoCode, setPromoCode] = useState("");
  const [promoMsg, setPromoMsg] = useState(null); // { ok: bool, text: string }
  const [promoBusy, setPromoBusy] = useState(false);

  // Fehler-Parameter aus der URL entfernen, damit er nicht kleben bleibt
  useEffect(() => {
    if (searchParams.get("error")) {
      const next = new URLSearchParams(searchParams);
      next.delete("error");
      setSearchParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/discord/link-status", { credentials: "include" });
        const data = res.ok ? await res.json() : { linked: false };
        if (!cancelled) setDiscordStatus({ loading: false, linked: !!data.linked, user: data.user || null });
      } catch {
        if (!cancelled) setDiscordStatus({ loading: false, linked: false, user: null });
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const linkDiscord = async () => {
    setDiscordBusy(true);
    setLinkError(false);
    try {
      const res = await fetch("/api/discord/login-url?returnTo=/profile", { credentials: "include" });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      setLinkError(true);
    } catch {
      setLinkError(true);
    }
    setDiscordBusy(false);
  };

  const unlinkDiscord = async () => {
    setDiscordBusy(true);
    try {
      await fetch("/api/discord/unlink", { method: "POST", credentials: "include" });
      setDiscordStatus({ loading: false, linked: false, user: null });
    } catch {
      setLinkError(true);
    }
    setDiscordBusy(false);
  };

  const handleRedeem = async () => {
    if (!promoCode.trim() || promoBusy) return;
    setPromoBusy(true);
    setPromoMsg(null);
    try {
      const res = await fetch("/api/promo/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: promoCode }),
      });
      const data = await res.json();
      const entry = t.promo[data.code];
      const text = entry
        ? (typeof entry === "function" ? entry(data.value) : entry)
        : (data.success ? data.message : (data.error || t.promo.invalid));
      setPromoMsg({ ok: !!data.success, text });
      if (data.success) setPromoCode("");
    } catch {
      setPromoMsg({ ok: false, text: t.redeemGenericError });
    }
    setPromoBusy(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const langToggle = (
    <Segmented size="sm" label="Sprache / Language" value={lang} onChange={changeLang}
      options={[{ value: "de", label: "DE" }, { value: "en", label: "EN" }]} />
  );

  if (!user) {
    return (
      <Page width="narrow" className="flex flex-col items-center justify-center min-h-[60vh]">
        <SEO title={t.metaTitle} description={t.metaDescription} path="/profile" lang={lang} />
        <Card className="p-10 max-w-md w-full flex flex-col items-center gap-5 relative text-center">
          <div className="absolute top-4 right-4">{langToggle}</div>
          <span className="flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 border border-accent/25 text-accent-soft">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white mb-2">{t.loggedOutTitle}</h1>
            <p className="text-sm text-white/55">{t.loggedOutHint}</p>
          </div>
          <TwitchLoginButton>{t.loginBtn}</TwitchLoginButton>
        </Card>
      </Page>
    );
  }

  return (
    <Page width="default" className="py-4 md:py-8">
      <SEO title={t.metaTitle} description={t.metaDescription} path="/profile" lang={lang} />

      <PageHeader
        media={<img src={user.profileImageUrl} alt="" className="w-20 h-20 rounded-lg object-cover border border-line" />}
        title={user.displayName}
        description={<span className="flex items-center gap-1.5"><TwitchGlyph size={14} className="text-twitch" /> @{user.login}</span>}
        actions={langToggle}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ===== Verknüpfungen ===== */}
        <Section icon={Link2} title={t.linksTitle} description={t.linksHint}>
          <div className="space-y-3">
            {/* Twitch */}
            <div className="flex items-center gap-4 rounded-lg bg-black/25 border border-line p-4">
              <span className="flex items-center justify-center w-11 h-11 rounded-lg bg-twitch/15 border border-twitch/30 text-[#a970ff] shrink-0">
                <TwitchGlyph size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{t.twitch}</p>
                <p className="text-xs text-white/40 truncate">{user.displayName}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg shrink-0">
                <Check size={12} /> {t.connected}
              </span>
            </div>

            {/* Discord */}
            <div className="flex items-center gap-4 rounded-lg bg-black/25 border border-line p-4">
              <span className="flex items-center justify-center w-11 h-11 rounded-lg bg-discord/15 border border-discord/30 text-[#7984f5] shrink-0 overflow-hidden">
                {discordStatus.linked && discordStatus.user?.avatar ? (
                  <img src={discordStatus.user.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <DiscordGlyph size={20} />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{t.discord}</p>
                <p className="text-xs text-white/40 truncate">
                  {discordStatus.loading
                    ? t.checkingStatus
                    : discordStatus.linked
                      ? (discordStatus.user?.username || t.linked)
                      : t.notLinked}
                </p>
              </div>
              {!discordStatus.loading && (
                discordStatus.linked ? (
                  <Button variant="secondary" size="sm" icon={Unlink} onClick={unlinkDiscord} disabled={discordBusy} className="shrink-0">
                    {t.unlinkBtn}
                  </Button>
                ) : (
                  <Button variant="discord" size="sm" icon={Link2} onClick={linkDiscord} disabled={discordBusy} className="shrink-0">
                    {t.linkBtn}
                  </Button>
                )
              )}
            </div>

            {linkError && (
              <p className="flex items-center gap-2 text-xs text-red-400 px-1">
                <AlertTriangle size={13} /> {t.discordLinkError}
              </p>
            )}
          </div>
        </Section>

        {/* ===== Code einlösen ===== */}
        <Section icon={Ticket} title={t.redeemTitle} description={t.redeemHint}>
          <div className="flex gap-2">
            <Input
              type="text"
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value); setPromoMsg(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleRedeem(); }}
              placeholder={t.redeemPlaceholder}
              aria-label={t.redeemTitle}
              className="flex-1 font-mono"
            />
            <Button onClick={handleRedeem} disabled={!promoCode.trim()} loading={promoBusy} loadingText={t.redeemBusy} className="shrink-0">
              {t.redeemBtn}
            </Button>
          </div>
          {promoMsg && (
            <p role="status" className={`text-xs mt-3 ${promoMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{promoMsg.text}</p>
          )}
        </Section>

        {/* ===== Premium-Abo: Stand, abschließen, verwalten, kündigen =====
            Erst sichtbar, wenn verkauft werden darf (config/legal.js) */}
        {salesVisible() && (
          <Section className="lg:col-span-2" icon={Sparkles} title={t.aboTitle} description={t.aboHint(PREMIUM_PRICE)}>
            <AboPanel returnPath="/profile" lang={lang} />
          </Section>
        )}

        {/* ===== Öffentliches Profil (/u/<login>, opt-in) ===== */}
        <PublicProfileSection user={user} t={t} />

        {/* ===== Konto ===== */}
        <Section className="lg:col-span-2" title={t.accountTitle}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => login(true)}
              className="group flex items-center gap-3 rounded-lg bg-black/25 border border-line hover:border-white/20 hover:bg-white/5 p-4 text-left transition-colors"
            >
              <RefreshCw size={18} className="text-white/40 group-hover:text-accent-soft transition-colors shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-white">{t.switchAccount}</span>
                <span className="block text-xs text-white/40 mt-0.5">{t.switchAccountHint}</span>
              </span>
            </button>

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

            <button
              type="button"
              onClick={handleLogout}
              className="group flex items-center gap-3 rounded-lg bg-black/25 border border-line hover:border-white/20 hover:bg-white/5 p-4 text-left transition-colors"
            >
              <LogOut size={18} className="text-white/40 group-hover:text-white transition-colors shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-white">{t.logout}</span>
                <span className="block text-xs text-white/40 mt-0.5">{t.logoutHint}</span>
              </span>
            </button>
          </div>
        </Section>
      </div>
    </Page>
  );
}
