// FlickTournaments.jsx — Turnier-Übersicht (/flick-soccer/turnier): alle Turniere zum Ansehen und Anmelden.
// Der Veranstalter (Admin, vom Server anhand der Twitch-Sitzung erkannt) sieht zusätzlich das Formular für ein neues
// Turnier: Name, Größe und die Regeln je Runde.
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Trophy } from "lucide-react";
import SEO from "../../components/SEO";
import { Seg } from "./components/MatchOptions.jsx";
import RoundRules from "./components/RoundRules.jsx";
import { STATUS_LABEL, TOURNAMENT_SIZES, fitRules, roundsFor, useTournamentSocket } from "./tournament.js";
import { useFlickShell } from "./ui/shellContext.js";

export default function FlickTournaments() {
  const navigate = useNavigate();
  const { prefs } = useFlickShell();
  const [list, setList] = useState(null);
  const [canCreate, setCanCreate] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [size, setSize] = useState(16);
  const [rules, setRules] = useState(() =>
    fitRules([{ goalsToWin: prefs.goalsToWin, turnSeconds: prefs.turnSeconds || 15, replay: prefs.replay, field: prefs.field, chaos: prefs.chaos }], roundsFor(16)),
  );

  const { call } = useTournamentSocket(async (c) => {
    const res = await c("ft:list");
    if (!res.ok) {
      setError(res.error || "Turniere konnten nicht geladen werden.");
      return;
    }
    setError("");
    setList(res.tournaments);
    setCanCreate(res.canCreate);
  });

  const changeSize = (next) => {
    setSize(next);
    setRules((r) => fitRules(r, roundsFor(next)));
  };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await call("ft:create", { name, maxPlayers: size, rules });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Turnier konnte nicht erstellt werden.");
      return;
    }
    navigate(`/flick-soccer/turnier/${res.code}`);
  };

  const open = (list || []).filter((t) => t.status === "signup" || t.status === "running");
  const past = (list || []).filter((t) => t.status === "done" || t.status === "cancelled");

  const row = (t) => (
    <Link key={t.code} to={`/flick-soccer/turnier/${t.code}`} className="fk-tournament-row">
      <span className="fk-tour-entry-star"><Trophy size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold leading-tight truncate">{t.name}</span>
        <span className="block fk-faint fk-num text-[12.5px] leading-snug truncate">
          {t.status === "done" && t.champion ? `Sieger: ${t.champion}` : `${t.players} / ${t.maxPlayers} Spieler`}
        </span>
      </span>
      <span className="fk-chip" style={t.status === "signup" || t.status === "running" ? { color: "var(--fk-lime)" } : undefined}>
        {STATUS_LABEL[t.status]}
      </span>
      <ArrowRight size={16} className="fk-faint shrink-0" />
    </Link>
  );

  return (
    <div className="w-full max-w-[1100px] mx-auto px-4 py-6">
      <SEO title="Flick Soccer — Turniere" description="Turniere in Flick Soccer: anmelden, Turnierbaum ansehen, mitspielen." path="/flick-soccer/turnier" />
      <header className="mb-5">
        <p className="fk-label fk-lime">K.-o.-Runden · eins gegen eins</p>
        <h1 className="fk-display text-[34px] sm:text-[44px] mt-1.5">Turniere</h1>
      </header>
      {error && <p className="fk-red mb-4">{error}</p>}

      <div className={`grid gap-5 items-start ${canCreate ? "lg:grid-cols-[1fr_minmax(340px,420px)]" : ""}`}>
        <div className="grid gap-5">
          <section className="fk-card">
            <h2 className="fk-section-title px-5 pt-4 pb-3">Aktuell</h2>
            {list === null ? (
              <p className="fk-dim px-5 pb-5 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Lade …</p>
            ) : open.length === 0 ? (
              <p className="fk-dim px-5 pb-5">Gerade läuft kein Turnier und es ist keine Anmeldung offen.</p>
            ) : (
              <div className="fk-rows border-t border-[var(--fk-line)]">{open.map(row)}</div>
            )}
          </section>
          {past.length > 0 && (
            <section className="fk-card">
              <h2 className="fk-section-title px-5 pt-4 pb-3">Vergangene</h2>
              <div className="fk-rows border-t border-[var(--fk-line)]">{past.map(row)}</div>
            </section>
          )}
        </div>

        {canCreate && (
          <form onSubmit={create} className="fk-card">
            <div className="fk-rows">
              <section className="p-5 grid gap-3">
                <h2 className="fk-section-title">Neues Turnier</h2>
                <label className="grid gap-1">
                  <span className="fk-label">Name</span>
                  <input className="fk-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Freitags-Pokal" />
                </label>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="fk-label">Plätze</span>
                  <Seg label="Plätze" value={size} onChange={changeSize} options={TOURNAMENT_SIZES.map((s) => ({ value: s, label: String(s) }))} />
                </div>
                <p className="fk-faint text-[13px]">
                  Melden sich weniger an, bekommen manche in der ersten Runde ein Freilos. Reichen die Spieler nur für einen kleineren Baum,
                  entfallen die frühen Runden — das Finale behält seine Regeln.
                </p>
              </section>
              <section className="p-5 grid gap-3">
                <h2 className="fk-section-title">Regeln je Runde</h2>
                <RoundRules rules={rules} onChange={setRules} />
              </section>
              <div className="p-5">
                <button type="submit" className="fk-btn fk-btn-lg w-full" disabled={busy}>
                  Turnier anlegen <ArrowRight size={20} />
                </button>
                <p className="fk-faint text-[13px] mt-2">Danach bekommst du den Link für die Anmeldung. Alles lässt sich bis zum Start noch ändern.</p>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
