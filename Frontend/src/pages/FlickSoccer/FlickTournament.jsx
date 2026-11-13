// FlickTournament.jsx — ein Turnier (/flick-soccer/turnier/:code): Anmeldung, Turnierbaum, eigenes nächstes Spiel.
// Mitspielen geht ohne Login (Name + der Token dieses Browsers, wie in den Online-Räumen). Wird das eigene Spiel
// geöffnet, springt die Seite einmal von selbst in den Raum; danach führt ein Knopf dorthin.
// Der Veranstalter (isAdmin vom Server) bekommt zusätzlich: Regeln je Runde, Größe, Start, Spieler entfernen,
// offene Paarungen entscheiden, Absagen und Löschen.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Check, Copy, Home, Loader2, Trophy, X } from "lucide-react";
import SEO from "../../components/SEO";
import Bracket from "./components/Bracket.jsx";
import Countdown from "./components/Countdown.jsx";
import RoundRules from "./components/RoundRules.jsx";
import { Seg } from "./components/MatchOptions.jsx";
import { matchInfo } from "./matchInfo.js";
import { getToken } from "./prefs.js";
import { playNotify } from "./sound.js";
import { STATUS_LABEL, TOURNAMENT_SIZES, roundName, useTournamentSocket } from "./tournament.js";
import { useFlickShell } from "./ui/shellContext.js";

const AUTO_KEY = "flickSoccer.tournamentAuto"; // zuletzt automatisch betretenes Spiel (nur einmal springen)

// Knopf, der erst beim zweiten Klick auslöst (Absagen, Löschen)
function ConfirmButton({ children, confirm, onConfirm, className = "fk-btn fk-btn-sm fk-btn-ghost" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirm : children}
    </button>
  );
}

export default function FlickTournament() {
  const { code: rawCode } = useParams();
  const code = String(rawCode || "").toUpperCase();
  const navigate = useNavigate();
  const { prefs, updatePrefs } = useFlickShell();

  const [state, setState] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [missing, setMissing] = useState(false);
  const [offset, setOffset] = useState(0); // Serverzeit − Ortszeit
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const [nameDraft, setNameDraft] = useState(prefs.name);
  const [titleDraft, setTitleDraft] = useState(null); // Turniername, solange der Veranstalter tippt

  const apply = (v) => {
    setOffset(v.serverNow - Date.now());
    setState(v);
  };

  const { call, connected } = useTournamentSocket(
    async (c) => {
      const res = await c("ft:watch", { code, token: getToken() });
      if (!res.ok) {
        if (res.error === "notFound") setMissing(true);
        else setToast(res.error || "Turnier konnte nicht geladen werden.");
        return;
      }
      setIsAdmin(res.isAdmin);
      apply(res.state);
    },
    { onState: apply, onGone: () => setMissing(true) },
  );

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const act = async (event, payload = {}) => {
    const res = await call(event, { code, ...payload });
    if (!res.ok) setToast(res.error || "Das hat nicht geklappt.");
    return res;
  };

  const me = state?.me || null;
  const players = useMemo(() => state?.players || [], [state?.players]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const matches = useMemo(() => (state?.rounds ? state.rounds.flat() : []), [state?.rounds]);
  const myMatch = me ? matches.find((m) => (m.status === "ready" || m.status === "live") && (m.a === me || m.b === me)) || null : null;
  const eliminated = !!me && matches.some((m) => m.status === "done" && (m.a === me || m.b === me) && m.winner !== me);

  // Eigenes Spiel ist offen: melden und einmal von selbst hineinspringen
  const autoRef = useRef(null);
  const myRoom = myMatch?.room || null;
  const myMatchKey = myMatch ? `${code}:${myMatch.id}:${myRoom}` : "";
  useEffect(() => {
    if (!myMatchKey || !myRoom || autoRef.current === myMatchKey) return;
    autoRef.current = myMatchKey;
    let seen = null;
    try {
      seen = sessionStorage.getItem(AUTO_KEY);
    } catch {
      seen = null;
    }
    if (seen === myMatchKey) return;
    try {
      sessionStorage.setItem(AUTO_KEY, myMatchKey);
    } catch {
      /* ohne Merker springt die Seite beim Zurückkommen eben nochmal */
    }
    playNotify();
    navigate(`/flick-soccer/${myRoom}`);
  }, [myMatchKey, myRoom, navigate]);

  const seo = <SEO title={`Flick Soccer — ${state?.name || "Turnier"}`} description="Turnier in Flick Soccer." path={`/flick-soccer/turnier/${code}`} noindex />;

  if (missing) {
    return (
      <div className="w-full max-w-[460px] mx-auto px-4 py-10">
        {seo}
        <div className="fk-card px-5 py-5 grid gap-3">
          <h1 className="fk-display text-[28px]">Turnier nicht gefunden</h1>
          <p className="fk-dim">Dieses Turnier gibt es nicht (mehr).</p>
          <Link to="/flick-soccer/turnier" className="fk-btn"><Trophy size={16} /> Alle Turniere</Link>
        </div>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 fk-dim py-16">
        {seo}
        <Loader2 size={18} className="animate-spin" /> Verbinde …
      </div>
    );
  }

  const { status, rounds, rules } = state;
  const signupOpen = status === "signup";
  const running = status === "running";
  const full = players.length >= state.maxPlayers;
  const champ = state.champion ? byId.get(state.champion) : null;
  const shareUrl = `${window.location.origin}/flick-soccer/turnier/${code}`;
  const lockedRounds = rounds ? rounds.map((round) => round.some((m) => m.room || (m.status === "done" && m.how !== "bye"))) : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setToast("Kopieren nicht möglich — Link bitte von Hand kopieren.");
    }
  };

  const signup = async (e) => {
    e.preventDefault();
    const n = nameDraft.trim().slice(0, 20);
    if (!n) return;
    const res = await act("ft:signup", { name: n, token: getToken() });
    if (res.ok) updatePrefs({ name: n });
  };

  const saveTitle = () => {
    if (titleDraft === null) return;
    const next = titleDraft.trim();
    setTitleDraft(null);
    if (next && next !== state.name) act("ft:update", { name: next });
  };

  // ── Was als Nächstes für mich ansteht ─────────────────────────────────────
  let banner = null;
  if (status === "cancelled") {
    banner = <p className="fk-dim">Dieses Turnier wurde abgesagt.</p>;
  } else if (status === "done") {
    banner = (
      <div className="flex items-center gap-3">
        <span className="fk-tour-entry-star"><Trophy size={19} /></span>
        <div>
          <p className="fk-label">Turniersieg</p>
          <p className="fk-display text-[26px] fk-lime">{champ ? champ.name : "—"}</p>
        </div>
      </div>
    );
  } else if (myMatch) {
    const opponent = byId.get(myMatch.a === me ? myMatch.b : myMatch.a);
    banner = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="fk-label fk-lime">{roundName(rounds.length, myMatch.round)} · {matchInfo(rules[myMatch.round])}</p>
          <p className="font-bold text-[18px] truncate">Dein Spiel gegen {opponent?.name || "?"}</p>
          <p className="fk-dim text-[14px]">
            {myMatch.status === "live" ? "Das Spiel läuft." : (
              <>Anpfiff spätestens in {myMatch.deadline ? <Countdown until={myMatch.deadline - offset} /> : "Kürze"} — wer dann fehlt, verliert kampflos.</>
            )}
          </p>
        </div>
        <Link to={`/flick-soccer/${myMatch.room}`} className="fk-btn fk-btn-lg">Zum Spiel <ArrowRight size={20} /></Link>
      </div>
    );
  } else if (running && me && eliminated) {
    banner = <p className="fk-dim">Du bist ausgeschieden. Die laufenden Spiele kannst du im Baum ansehen.</p>;
  } else if (running && me) {
    banner = <p className="fk-dim">Du bist weiter. Sobald dein nächster Gegner feststeht, geht es von selbst los.</p>;
  } else if (running) {
    banner = <p className="fk-dim">Das Turnier läuft. Die laufenden Spiele kannst du im Baum ansehen.</p>;
  } else if (me) {
    banner = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="fk-dim">
          <span className="fk-lime font-bold">Du bist angemeldet.</span> Lass diese Seite offen — dein erstes Spiel öffnet sich von selbst, sobald das Turnier startet.
        </p>
        <button type="button" className="fk-btn fk-btn-sm fk-btn-ghost" onClick={() => act("ft:withdraw", { token: getToken() })}>Abmelden</button>
      </div>
    );
  } else {
    banner = (
      <form onSubmit={signup} className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
        <label className="grid gap-1">
          <span className="fk-label">Dein Name im Turnier</span>
          <input className="fk-input" maxLength={20} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Dein Name" disabled={full} />
        </label>
        <button type="submit" className="fk-btn" disabled={full || !nameDraft.trim()}>{full ? "Turnier ist voll" : "Anmelden"}</button>
      </form>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 py-5 lg:py-7">
      {seo}
      {toast && <div className="fk-toast">{toast}</div>}

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="fk-label">
            <Link to="/flick-soccer/turnier" className="hover:text-[var(--fk-text)]">Turniere</Link> · <span className={signupOpen || running ? "fk-lime" : ""}>{STATUS_LABEL[status]}</span>
            {!connected && <span className="fk-red"> · getrennt</span>}
          </p>
          <h1 className="fk-display text-[30px] sm:text-[40px] mt-1.5 break-words">{state.name}</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" className="fk-btn fk-btn-sm fk-btn-quiet" onClick={copy}>
            {copied ? <Check size={15} /> : <Copy size={15} />} Link kopieren
          </button>
          <Link to="/flick-soccer" className="fk-btn fk-btn-sm fk-btn-ghost"><Home size={15} /> Menü</Link>
        </div>
      </header>

      <div className="fk-card px-5 py-4 mb-5">{banner}</div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr] items-start">
        <div className="grid gap-5">
          <section className="fk-card">
            <div className="px-5 pt-4 pb-3 flex items-baseline justify-between gap-3">
              <h2 className="fk-section-title">Spieler</h2>
              <span className="fk-faint fk-num text-[13px]">{players.length} / {state.maxPlayers}</span>
            </div>
            {players.length === 0 ? (
              <p className="fk-dim px-5 pb-4">Noch niemand angemeldet. Schick den Link herum.</p>
            ) : (
              <ul className="fk-player-list px-5 pb-4">
                {players.map((p) => {
                  const out = matches.some((m) => m.status === "done" && (m.a === p.id || m.b === p.id) && m.winner !== p.id);
                  return (
                    <li key={p.id} className={out ? "out" : ""}>
                      <span className="truncate">{p.name}</span>
                      {p.id === me && <span className="fk-chip">du</span>}
                      {state.champion === p.id && <span className="fk-chip" style={{ color: "var(--fk-lime)" }}>Sieger</span>}
                      {isAdmin && signupOpen && (
                        <button type="button" className="ml-auto fk-faint hover:text-[var(--fk-red)]" title={`${p.name} entfernen`} aria-label={`${p.name} entfernen`} onClick={() => act("ft:kick", { playerId: p.id })}>
                          <X size={15} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {isAdmin && (
            <section className="fk-card">
              <div className="fk-rows">
                <div className="p-5 grid gap-3">
                  <h2 className="fk-section-title">Veranstalter</h2>
                  {(signupOpen || running) && (
                    <label className="grid gap-1">
                      <span className="fk-label">Name</span>
                      <input
                        className="fk-input"
                        maxLength={40}
                        value={titleDraft ?? state.name}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={saveTitle}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                    </label>
                  )}
                  {signupOpen && (
                    <>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="fk-label">Plätze</span>
                        <Seg
                          label="Plätze"
                          value={state.maxPlayers}
                          onChange={(maxPlayers) => act("ft:update", { maxPlayers })}
                          options={TOURNAMENT_SIZES.map((s) => ({ value: s, label: String(s) }))}
                        />
                      </div>
                      <button type="button" className="fk-btn fk-btn-lg w-full" disabled={players.length < 2} onClick={() => act("ft:start")}>
                        Auslosen und starten <ArrowRight size={20} />
                      </button>
                      <p className="fk-faint text-[13px]">
                        {players.length < 2 ? "Es braucht mindestens zwei Spieler." : "Die Paarungen werden zufällig gelost, die ersten Spiele öffnen sofort."}
                      </p>
                    </>
                  )}
                  {running && (
                    <p className="fk-faint text-[13px]">
                      Hängt ein Spiel oder erscheint niemand: im Baum den Spieler anklicken, der weiterkommen soll, und noch einmal bestätigen.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(signupOpen || running) && (
                      <ConfirmButton confirm="Wirklich absagen?" onConfirm={() => act("ft:cancel")}>Turnier absagen</ConfirmButton>
                    )}
                    {(status === "done" || status === "cancelled") && (
                      <ConfirmButton
                        confirm="Wirklich löschen?"
                        onConfirm={async () => {
                          const res = await act("ft:delete");
                          if (res.ok) navigate("/flick-soccer/turnier");
                        }}
                      >
                        Turnier löschen
                      </ConfirmButton>
                    )}
                  </div>
                </div>
                {(signupOpen || running) && (
                  <div className="p-5 grid gap-3">
                    <h2 className="fk-section-title">Regeln je Runde</h2>
                    <RoundRules rules={rules} locked={lockedRounds} onChange={(next) => act("ft:update", { rules: next })} />
                    {signupOpen && (
                      <p className="fk-faint text-[13px]">
                        Gilt für einen vollen Baum. Reichen die Anmeldungen nur für einen kleineren, entfallen die frühen Runden.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <section className="fk-card p-4 min-w-0">
          {rounds ? (
            <Bracket
              rounds={rounds}
              rules={rules}
              players={players}
              me={me}
              offset={offset}
              onDecide={isAdmin && running ? (m, winner) => act("ft:setWinner", { matchId: m.id, winner }) : null}
            />
          ) : (
            <>
              <h2 className="fk-section-title mb-3">So wird gespielt</h2>
              <ol className="fk-rule-list">
                {rules.map((rule, r) => (
                  <li key={r}>
                    <span className="font-bold">{roundName(rules.length, r)}</span>
                    <span className="fk-dim">{matchInfo(rule)}{rule.turnSeconds ? ` · ${rule.turnSeconds} s Zugzeit` : ""}</span>
                  </li>
                ))}
              </ol>
              <p className="fk-faint text-[13px] mt-3">
                K.-o.-System: Wer verliert, ist raus. Der Baum wird beim Start ausgelost. Für jedes Spiel hast du drei Minuten, um im Raum zu sein.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
