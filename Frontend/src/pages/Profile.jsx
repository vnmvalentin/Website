// src/pages/Profile.jsx — Profil-Seite: Verknüpfungen (Twitch/Discord),
// Account wechseln, Code einlösen, Logout und Admin-Zugang.
import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import SEO from "../components/SEO";
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
} from "lucide-react";

const STREAMER_ID = "160224748";

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

function DiscordGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export default function Profile() {
  const { user, login, logout } = useContext(TwitchAuthContext);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = !!user && String(user.id) === STREAMER_ID;

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
      setPromoMsg({ ok: !!data.success, text: data.success ? data.message : (data.error || "Code ungültig") });
      if (data.success) setPromoCode("");
    } catch {
      setPromoMsg({ ok: false, text: "Fehler beim Einlösen" });
    }
    setPromoBusy(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user) {
    return (
      <div className="page-fade flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <SEO title="Profil" description="Dein Profil auf vnmvalentin.de" path="/profile" />
        <div className="panel p-10 max-w-md w-full flex flex-col items-center gap-5">
          <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
            <ShieldCheck size={26} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-white mb-2">Dein Profil</h1>
            <p className="text-sm text-white/50">Melde dich mit Twitch an, um dein Profil, Verknüpfungen und Codes zu verwalten.</p>
          </div>
          <button
            onClick={() => login(false)}
            className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <TwitchGlyph className="w-4 h-4" /> Mit Twitch anmelden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-fade w-full max-w-5xl mx-auto px-2 md:px-4 py-8 md:py-12">
      <SEO title="Profil" description="Dein Profil auf vnmvalentin.de" path="/profile" />

      {/* Kopf */}
      <div className="flex items-center gap-5 mb-10">
        <img src={user.profileImageUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border border-white/10" />
        <div className="min-w-0">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight truncate">{user.displayName}</h1>
          <p className="text-sm text-white/40 mt-1 flex items-center gap-1.5">
            <TwitchGlyph className="w-3.5 h-3.5 text-[#9146FF]" /> @{user.login}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ===== Verknüpfungen ===== */}
        <section className="panel p-6">
          <h2 className="font-display text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Link2 size={18} className="text-violet-300" /> Verknüpfungen
          </h2>
          <p className="text-xs text-white/40 mb-5">Twitch ist dein Standard-Login. Optional kannst du deinen Discord-Account verbinden.</p>

          <div className="space-y-3">
            {/* Twitch */}
            <div className="flex items-center gap-4 rounded-xl bg-black/25 border border-white/10 p-4">
              <span className="flex items-center justify-center w-11 h-11 rounded-lg bg-[#9146FF]/15 border border-[#9146FF]/30 text-[#a970ff] shrink-0">
                <TwitchGlyph className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">Twitch</p>
                <p className="text-xs text-white/40 truncate">{user.displayName}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg shrink-0">
                <Check size={12} /> Verbunden
              </span>
            </div>

            {/* Discord */}
            <div className="flex items-center gap-4 rounded-xl bg-black/25 border border-white/10 p-4">
              <span className="flex items-center justify-center w-11 h-11 rounded-lg bg-[#5865F2]/15 border border-[#5865F2]/30 text-[#7984f5] shrink-0 overflow-hidden">
                {discordStatus.linked && discordStatus.user?.avatar ? (
                  <img src={discordStatus.user.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <DiscordGlyph className="w-5 h-5" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">Discord</p>
                <p className="text-xs text-white/40 truncate">
                  {discordStatus.loading
                    ? "Prüfe Status..."
                    : discordStatus.linked
                      ? (discordStatus.user?.username || "Verknüpft")
                      : "Nicht verknüpft"}
                </p>
              </div>
              {!discordStatus.loading && (
                discordStatus.linked ? (
                  <button
                    onClick={unlinkDiscord}
                    disabled={discordBusy}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-red-300 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 px-2.5 py-1 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                  >
                    <Unlink size={12} /> Trennen
                  </button>
                ) : (
                  <button
                    onClick={linkDiscord}
                    disabled={discordBusy}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#5865F2] hover:bg-[#4752c4] px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                  >
                    <Link2 size={12} /> Verknüpfen
                  </button>
                )
              )}
            </div>

            {linkError && (
              <p className="flex items-center gap-2 text-xs text-red-400 px-1">
                <AlertTriangle size={13} /> Discord-Verknüpfung fehlgeschlagen. Versuch es später erneut.
              </p>
            )}
          </div>
        </section>

        {/* ===== Code einlösen ===== */}
        <section className="panel p-6">
          <h2 className="font-display text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Ticket size={18} className="text-violet-300" /> Code einlösen
          </h2>
          <p className="text-xs text-white/40 mb-5">Hast du einen Promo-Code aus dem Stream? Hier kannst du ihn aktivieren.</p>

          <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value); setPromoMsg(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleRedeem(); }}
              placeholder="Code eingeben"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:border-violet-500 outline-none transition-colors"
            />
            <button
              onClick={handleRedeem}
              disabled={!promoCode.trim() || promoBusy}
              className="px-5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
            >
              {promoBusy ? "..." : "Einlösen"}
            </button>
          </div>
          {promoMsg && (
            <p className={`text-xs mt-3 ${promoMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{promoMsg.text}</p>
          )}
        </section>

        {/* ===== Konto ===== */}
        <section className="panel p-6 lg:col-span-2">
          <h2 className="font-display text-lg font-bold text-white mb-5">Konto</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              onClick={() => login(true)}
              className="group flex items-center gap-3 rounded-xl bg-black/25 border border-white/10 hover:border-white/20 hover:bg-white/5 p-4 text-left transition-colors"
            >
              <RefreshCw size={18} className="text-white/40 group-hover:text-violet-300 transition-colors shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-white">Account wechseln</span>
                <span className="block text-xs text-white/40 mt-0.5">Mit anderem Twitch-Konto anmelden</span>
              </span>
            </button>

            {isAdmin && (
              <Link
                to="/admin"
                className="group flex items-center gap-3 rounded-xl bg-red-500/5 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 p-4 transition-colors"
              >
                <ShieldCheck size={18} className="text-red-400 shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-red-200">Admin Panel</span>
                  <span className="block text-xs text-red-300/50 mt-0.5">Dashboard & Verwaltung</span>
                </span>
                <ArrowRight size={15} className="text-red-400/40 group-hover:text-red-300 group-hover:translate-x-1 transition-all shrink-0" />
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="group flex items-center gap-3 rounded-xl bg-black/25 border border-white/10 hover:border-white/20 hover:bg-white/5 p-4 text-left transition-colors"
            >
              <LogOut size={18} className="text-white/40 group-hover:text-white transition-colors shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-white">Logout</span>
                <span className="block text-xs text-white/40 mt-0.5">Von diesem Gerät abmelden</span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
