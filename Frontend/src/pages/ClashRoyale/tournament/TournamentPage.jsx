// Turnierseite (/clash-royale/turnier/:id) — Infos, Regeln, Minigames,
// Teilnehmer, Anmeldung, Veranstalter-Werkzeuge; nach dem Start zusätzlich Gruppen + Bracket
// (TournamentStructure.jsx). Match-Räume folgen in Phase 3 (Backend/clashRoyale/PLANUNG_TURNIER.md).
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { useLanguage } from '../useLanguage';
import { useProfile } from '../useProfile';
import { modeInfo, modeNameFor } from '../modesConfig';
import ChunkyButton from '../ui/ChunkyButton';
import ArcadeTitle from '../ui/ArcadeTitle';
import Section from '../ui/Section';
import { RankBadge } from '../lobby/PlayerList';
import {
  CrTourneyTrophy, CrCards, CrBook, CrInfo, CrUser, CrUserAdd, CrUserRemove, CrClock, CrCrown,
  CrKingBlue, CrSettings, CrCancel, CrCheck, CrSocial, CrBattle,
} from '../ui/CrIcons';
import TournamentStructure from './TournamentStructure';
import TournamentFrame from './TournamentFrame';
import { tDict, tError } from './tI18n';
import { tournamentApi, withLang } from './tournamentApi';

const STATUS_STYLE = {
  registration: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
  running: 'text-[var(--cr-arcade-gold)] border-amber-300/40 bg-amber-400/10',
  finished: 'text-white/60 border-white/15 bg-white/5',
  cancelled: 'text-red-300 border-red-400/40 bg-red-500/10',
};
const STATUS_LABEL = { registration: 'statusRegistration', running: 'statusRunning', finished: 'statusFinished', cancelled: 'statusCancelled' };

const formatDate = (ms, lang) => new Date(ms).toLocaleString(lang === 'de' ? 'de-DE' : lang === 'es' ? 'es-ES' : 'en-GB', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Eine Teilnehmerzeile — derselbe Banner-Stil wie die Spielerliste der Lobby. */
function ParticipantRow({ p, isMe, canRemove, onRemove, t }) {
  return (
    <div className={`cr-row cr-banner overflow-hidden ${isMe ? 'cr-row--me' : ''}`}>
      <div className="flex items-center gap-3 pl-3.5 pr-2 py-2 min-h-[52px]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-cr text-white text-base leading-tight truncate">{p.displayName}</span>
            {p.isOwner && <CrCrown size={18} />}
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-white/55 text-[11px]">
            <CrKingBlue size={12} />
            <span className="truncate">{p.crName}</span>
            <span className="text-white/30">#{p.crTag}</span>
          </div>
        </div>
        <RankBadge p={p} />
        {canRemove && (
          <button onClick={onRemove} title={t.remove} aria-label={t.remove}
            className="cr-arcade-icon-btn cr-arcade-icon-btn--red w-[34px] h-[34px] shrink-0">
            <CrUserRemove size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Anmeldeformular: CR-Kürzel Pflicht, Name nur ohne Twitch-Login, Freundschaftslink optional. */
function SignupForm({ tournament, user, profile, onJoined, t }) {
  const open = tournament.settings.signupMode === 'open';
  const [crTag, setCrTag] = useState(profile?.crTag ? `#${profile.crTag}` : '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [friendLink, setFriendLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Profil kommt asynchron — aktiven Account vorschlagen, solange noch nichts getippt ist
  useEffect(() => {
    if (profile?.crTag) setCrTag(prev => prev || `#${profile.crTag}`);
  }, [profile?.crTag]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await tournamentApi.join(tournament.id, { crTag, displayName, friendLink });
      onJoined();
    } catch (e) {
      setError(tError(t, e));
    } finally {
      setBusy(false);
    }
  };

  const accounts = profile?.crAccounts || [];
  return (
    <div className="space-y-4">
      {(open || !user) && (
        <label className="block">
          <span className="cr-eyebrow">{t.displayName}</span>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={24}
            className="cr-input mt-1.5 px-4 py-2.5 text-base font-semibold" />
        </label>
      )}
      <div>
        <label className="block">
          <span className="cr-eyebrow">{t.crTag}</span>
          <input value={crTag} onChange={e => setCrTag(e.target.value.toUpperCase())} placeholder={t.crTagPh}
            maxLength={16} onKeyDown={e => e.key === 'Enter' && submit()}
            className="cr-input mt-1.5 px-4 py-2.5 text-base font-cr tracking-wider" />
        </label>
        {accounts.length > 0 && (
          <div className="mt-2">
            <p className="text-white/45 text-[11px] mb-1.5">{t.savedAccounts}</p>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map(a => (
                <button key={a.tag} type="button" onClick={() => setCrTag(`#${a.tag}`)}
                  aria-pressed={crTag.replace('#', '') === a.tag}
                  className="cr-chip rounded-lg px-2.5 py-1 text-xs text-white flex items-center gap-1.5 aria-pressed:border-[var(--cr-arcade-gold)]!">
                  <CrKingBlue size={14} />{a.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <label className="block">
        <span className="cr-eyebrow">{t.friendLink}</span>
        <input value={friendLink} onChange={e => setFriendLink(e.target.value.trim())}
          placeholder="https://link.clashroyale.com/…"
          className="cr-input mt-1.5 px-4 py-2.5 text-sm" />
        <span className="block text-white/45 text-[11px] mt-1.5">{t.friendLinkNote}</span>
      </label>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <ChunkyButton variant="green" size="lg" block icon={CrUserAdd} iconSize={26} disabled={busy} onClick={submit}>
        {busy ? t.joining : t.join}
      </ChunkyButton>
    </div>
  );
}

/** Eigene Anmeldung: Freundschaftslink nachpflegen, abmelden. */
function MyEntry({ tournament, me, canLeave, onChanged, t }) {
  const [friendLink, setFriendLink] = useState(me.friendLink || '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const saveLink = async () => {
    setError(''); setStatus('');
    try { await tournamentApi.setFriendLink(tournament.id, friendLink); setStatus(t.saved); onChanged(); }
    catch (e) { setError(tError(t, e)); }
  };
  const leave = async () => {
    if (!window.confirm(t.leaveConfirm)) return;
    try { await tournamentApi.leave(tournament.id); onChanged(); }
    catch (e) { setError(tError(t, e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-300 font-cr text-lg">
        <CrCheck size={24} />{t.youAreIn}
      </div>
      <label className="block">
        <span className="cr-eyebrow">{t.friendLink}</span>
        <div className="flex gap-2 mt-1.5">
          <input value={friendLink} onChange={e => { setFriendLink(e.target.value.trim()); setStatus(''); }}
            placeholder="https://link.clashroyale.com/…" className="cr-input px-4 py-2.5 text-sm flex-1 min-w-0" />
          <ChunkyButton variant="blue" size="sm" onClick={saveLink} disabled={friendLink === (me.friendLink || '')}>
            {status || t.saveLink}
          </ChunkyButton>
        </div>
        <span className="block text-white/45 text-[11px] mt-1.5">{t.friendLinkNote}</span>
      </label>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {canLeave && (
        <ChunkyButton variant="red" size="sm" icon={CrUserRemove} onClick={leave}>{t.leave}</ChunkyButton>
      )}
    </div>
  );
}

export default function TournamentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, login } = useContext(TwitchAuthContext);
  const { profile } = useProfile(user);
  const { lang, changeLang } = useLanguage();
  const t = tDict(lang);

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await tournamentApi.get(id));
      setLoadError('');
    } catch (e) {
      setLoadError(e?.error || 'network');
    }
  }, [id]);

  // Erstes Laden + leises Nachladen, damit neue Anmeldungen ohne Neuladen erscheinen.
  // Der Login-Zustand gehört dazu: nach dem Twitch-Login kennt der Server "me" erst neu.
  useEffect(() => {
    reload();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 15000);
    return () => clearInterval(timer);
  }, [reload, user?.login]);

  const frame = (content) => (
    <TournamentFrame lang={lang} changeLang={changeLang} backTo="/clash-royale" backLabel={t.toHub} width="max-w-6xl">
      {content}
    </TournamentFrame>
  );

  if (loadError && !data) {
    return frame(
      <div className="cr-arcade-panel p-6 max-w-md mx-auto text-center space-y-4">
        <CrTourneyTrophy size={56} className="mx-auto opacity-60" />
        <p className="text-white/80">{loadError === 'tournamentNotFound' ? t.notFound : tError(t, { error: loadError })}</p>
        <ChunkyButton variant="blue" onClick={() => navigate(withLang('/clash-royale', lang))}>{t.toHub}</ChunkyButton>
      </div>
    );
  }
  if (!data) return frame(<p className="text-center text-white/60 py-16">{t.loading}</p>);

  const { tournament, participants, isOwner, me } = data;
  const s = tournament.settings;
  const registration = tournament.status === 'registration';
  const full = participants.length >= s.maxPlayers;
  const inviteUrl = `${window.location.origin}/clash-royale/turnier/${tournament.id}`;

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt(t.inviteLink, inviteUrl); }
  };
  const startTournament = async () => {
    if (!window.confirm(t.startConfirm(participants.length))) return;
    setStarting(true); setActionError('');
    try { await tournamentApi.start(tournament.id); await reload(); }
    catch (e) { setActionError(tError(t, e)); }
    finally { setStarting(false); }
  };
  const cancelTournament = async () => {
    if (!window.confirm(t.cancelConfirm)) return;
    try { await tournamentApi.cancel(tournament.id); reload(); }
    catch (e) { setActionError(tError(t, e)); }
  };
  const removeParticipant = async (p) => {
    if (!window.confirm(t.removeConfirm(p.displayName))) return;
    try { await tournamentApi.removeParticipant(tournament.id, p.id); reload(); }
    catch (e) { setActionError(tError(t, e)); }
  };

  const rules = [
    s.groupStage.enabled ? t.ruleGroups(s.groupStage.groupSize, s.groupStage.advancePerGroup) : t.ruleNoGroups,
    s.doubleElimination ? t.ruleBracketDouble : t.ruleBracketSingle,
    t.ruleBestOf(s.bestOf.normal, s.bestOf.finals),
    s.modeSelection === 'pickban' ? `${t.ruleModePickban} — ${t.pickbanNote}` : t.ruleModeRandom,
    t.ruleMatch,
    s.deckCheck ? t.ruleDeckCheck : null,
    t.ruleShowUp(s.showUpMinutes),
  ].filter(Boolean);

  // Anmelde-Bereich: je nach Zustand Formular, eigene Anmeldung oder ein Hinweis
  let signup;
  if (me) {
    signup = <MyEntry tournament={tournament} me={me} canLeave={registration} onChanged={reload} t={t} />;
  } else if (!registration) {
    signup = <p className="text-white/60 text-sm">{t.notOpen}</p>;
  } else if (full) {
    signup = <p className="text-white/60 text-sm">{t.full}</p>;
  } else if (s.signupMode === 'twitch' && !user) {
    signup = (
      <div className="space-y-3">
        <p className="text-white/70 text-sm">{t.loginToJoin}</p>
        <ChunkyButton variant="blue" size="lg" block onClick={login}>{t.login}</ChunkyButton>
      </div>
    );
  } else {
    signup = <SignupForm tournament={tournament} user={user} profile={user ? profile : null} onJoined={reload} t={t} />;
  }

  return frame(
    <div className="cr-anim-rise space-y-4">
      {/* ── Kopf ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <CrTourneyTrophy size={64} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${STATUS_STYLE[tournament.status] || STATUS_STYLE.finished}`}>
            {t[STATUS_LABEL[tournament.status]] || tournament.status}
          </span>
          <ArcadeTitle as="h1" className="text-3xl md:text-4xl leading-tight mt-1 break-words">{s.name}</ArcadeTitle>
          <p className="text-white/55 text-sm mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>{t.organizer(tournament.ownerLogin)}</span>
            <span className="flex items-center gap-1"><CrClock size={16} />{s.startsAt ? t.startsOn(formatDate(s.startsAt, lang)) : t.startManual}</span>
            <span className="flex items-center gap-1"><CrUser size={16} />{t.players(participants.length, s.maxPlayers)}</span>
          </p>
        </div>
      </div>

      {/* ── Nach dem Start: nächstes Match, Gruppen, Bracket — volle Breite ── */}
      {data.structure && (
        <TournamentStructure tournament={tournament} structure={data.structure} participants={participants}
          me={me} isOwner={isOwner} onChanged={reload} t={t} />
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-4 items-start">
        {/* ── Links: Infos ────────────────────────────────────────────── */}
        <div className="cr-arcade-panel overflow-hidden">
          {s.description && (
            <Section icon={CrInfo} title={t.about}>
              <p className="text-white/80 text-sm whitespace-pre-line break-words">{s.description}</p>
            </Section>
          )}
          <Section icon={CrBook} title={t.rules}>
            <ul className="space-y-2">
              {rules.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-white/80">
                  <span className="text-[var(--cr-arcade-gold)] font-cr shrink-0">{i + 1}.</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section icon={CrCards} title={t.modes} aside={s.modes.length}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {s.modes.map(mid => {
                const Icon = modeInfo(mid).icon;
                return (
                  <div key={mid} className="cr-tile-btn cr-tile-btn--static px-3 py-2">
                    <span className="cr-tile-icon w-9 h-9"><Icon size={24} /></span>
                    <span className="font-cr text-white text-sm truncate">{modeNameFor(mid, lang)}</span>
                  </div>
                );
              })}
            </div>
          </Section>
          {registration && (
            <Section>
              <p className="text-white/45 text-xs">{t.drawNote}</p>
            </Section>
          )}
        </div>

        {/* ── Rechts: Anmeldung, Veranstalter, Teilnehmer — auf dem Handy zuerst ── */}
        <div className="space-y-4 order-first lg:order-none">
          {isOwner && (
            <div className="cr-arcade-panel overflow-hidden">
              <Section icon={CrSettings} title={t.ownerTools}>
                <p className="cr-eyebrow mb-1.5">{t.inviteLink}</p>
                <div className="flex gap-2">
                  <input readOnly value={inviteUrl} onFocus={e => e.target.select()}
                    className="cr-input px-3 py-2 text-xs flex-1 min-w-0" />
                  <ChunkyButton variant="blue" size="sm" onClick={copyInvite}>{copied ? t.copied : t.copy}</ChunkyButton>
                </div>
                {registration && (
                  <ChunkyButton variant="green" size="lg" block icon={CrBattle} iconSize={26} className="mt-4"
                    disabled={starting || participants.length < 2} onClick={startTournament}>
                    {t.startTournament}
                  </ChunkyButton>
                )}
                {registration && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <ChunkyButton variant="gold" size="sm" icon={CrSettings}
                      onClick={() => navigate(withLang(`/clash-royale/turnier/${tournament.id}/bearbeiten`, lang))}>
                      {t.edit}
                    </ChunkyButton>
                    <ChunkyButton variant="red" size="sm" icon={CrCancel} onClick={cancelTournament}>{t.cancelTournament}</ChunkyButton>
                  </div>
                )}
                {actionError && <p className="text-red-400 text-sm mt-3">{actionError}</p>}
              </Section>
            </div>
          )}

          <div className="cr-arcade-panel overflow-hidden">
            {/* Nach dem Start nur noch für Angemeldete (Freundschaftslink pflegen) */}
            {(registration || me) && <Section icon={CrUserAdd} title={t.signupTitle}>{signup}</Section>}
            <Section icon={CrSocial} title={t.players(participants.length, s.maxPlayers)}>
              {participants.length === 0 ? (
                <p className="text-white/50 text-sm">{t.noPlayers}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {participants.map(p => (
                    <ParticipantRow key={p.id} p={p} t={t}
                      isMe={me?.id === p.id}
                      canRemove={isOwner && registration}
                      onRemove={() => removeParticipant(p)} />
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
