// Turnier anlegen (/clash-royale/turnier/neu) und vor dem Start bearbeiten
// (/clash-royale/turnier/:id/bearbeiten). Eine Fläche mit Abschnitten wie Lobby und
// Einstellungsfenster. Geprüft wird endgültig auf dem Server (tournament/settings.js);
// hier stehen nur die Hinweise, die man beim Ausfüllen sofort sehen soll.
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import { useLanguage } from '../useLanguage';
import { MODES, modeInfo, modeNameFor } from '../modesConfig';
import ChunkyButton from '../ui/ChunkyButton';
import Toggle from '../ui/Toggle';
import SettingRow, { SegmentedControl } from '../ui/SettingRow';
import ArcadeTitle from '../ui/ArcadeTitle';
import { CrTourneyTrophy, CrCards, CrClock, CrRandom, CrSwap, CrUser, CrCheck } from '../ui/CrIcons';
import TournamentFrame, { Stepper } from './TournamentFrame';
import { tDict, tError } from './tI18n';
import { tournamentApi, withLang } from './tournamentApi';

const SHOW_UP_OPTIONS = [5, 10, 15, 20, 30];
const BATTLE_OPTIONS = [10, 15, 20, 30, 45, 60];

// datetime-local arbeitet in Ortszeit ohne Zeitzone; der Server speichert Unix-ms
const toLocalInput = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (s) => {
  if (!s) return null;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export default function TournamentForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { user, login } = useContext(TwitchAuthContext);
  const { lang, changeLang } = useLanguage();
  const t = tDict(lang);

  const [meta, setMeta] = useState(null);
  const [s, setS] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await tournamentApi.meta();
        if (cancelled) return;
        setMeta(m);
        if (!editing) { setS(m.defaults); return; }
        const data = await tournamentApi.get(id);
        if (cancelled) return;
        if (!data.isOwner) { setLoadError(t.errors.noPermission); return; }
        if (data.tournament.status !== 'registration') { setLoadError(t.errors.tournamentAlreadyStarted); return; }
        setS(data.tournament.settings);
      } catch (e) {
        if (!cancelled) setLoadError(tError(t, e));
      }
    })();
    return () => { cancelled = true; };
    // t hängt nur an lang — ein Sprachwechsel soll nicht neu laden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editing]);

  const set = (patch) => setS(prev => ({ ...prev, ...patch }));
  const setGroup = (patch) => setS(prev => ({ ...prev, groupStage: { ...prev.groupStage, ...patch } }));

  // Nur Modi, die der Server als Solo-Modus kennt — in der Reihenfolge der Hub-Liste
  const soloModes = useMemo(
    () => (meta ? MODES.filter(m => meta.soloModes.includes(m.id)) : []),
    [meta],
  );

  const groupHint = useMemo(() => {
    if (!s?.groupStage.enabled) return null;
    const { groupSize, advancePerGroup } = s.groupStage;
    if (s.maxPlayers % groupSize !== 0) return { warn: t.errors.tournamentGroupSizeMismatch };
    if (advancePerGroup >= groupSize) return { warn: t.errors.tournamentAdvanceTooHigh };
    const groups = s.maxPlayers / groupSize;
    if (groups * advancePerGroup < 2) return { warn: t.errors.tournamentAdvanceTooLow };
    return { note: `${t.groupCount(groups)} · ${groups * advancePerGroup} → Bracket` };
  }, [s, t]);

  const toggleMode = (modeId) => {
    set({ modes: s.modes.includes(modeId) ? s.modes.filter(x => x !== modeId) : [...s.modes, modeId] });
  };

  const submit = async () => {
    setError('');
    setSaving(true);
    try {
      if (editing) {
        await tournamentApi.update(id, s);
        navigate(withLang(`/clash-royale/turnier/${id}`, lang));
      } else {
        const { id: newId } = await tournamentApi.create(s);
        navigate(withLang(`/clash-royale/turnier/${newId}`, lang));
      }
    } catch (e) {
      setError(tError(t, e));
    } finally {
      setSaving(false);
    }
  };

  const backTo = editing ? `/clash-royale/turnier/${id}` : '/clash-royale';
  const frame = (content) => (
    <TournamentFrame lang={lang} changeLang={changeLang} backTo={backTo} backLabel={t.back}>
      {content}
    </TournamentFrame>
  );

  if (!user) {
    return frame(
      <div className="cr-arcade-panel cr-anim-rise p-6 max-w-md mx-auto text-center space-y-4">
        <CrTourneyTrophy size={64} className="mx-auto" />
        <p className="text-white/80">{t.loginToCreate}</p>
        <ChunkyButton variant="blue" size="lg" block onClick={login}>{t.login}</ChunkyButton>
      </div>
    );
  }
  if (loadError) {
    return frame(<div className="cr-arcade-panel p-6 max-w-md mx-auto text-center text-white/80">{loadError}</div>);
  }
  if (!s || !meta) {
    return frame(<p className="text-center text-white/60 py-16">{t.loading}</p>);
  }
  if (!editing && !meta.canCreate) {
    return frame(
      <div className="cr-arcade-panel cr-anim-rise p-6 max-w-md mx-auto text-center space-y-4">
        <CrTourneyTrophy size={64} className="mx-auto opacity-60" />
        <p className="text-white/80">{t.createLocked}</p>
      </div>
    );
  }

  const { limits } = meta;

  return frame(
    <div className="cr-anim-rise space-y-4">
      <ArcadeTitle as="h1" className="text-3xl md:text-4xl flex items-center gap-3">
        <CrTourneyTrophy size={44} />
        {editing ? t.editTitle : t.createTitle}
      </ArcadeTitle>

      <div className="cr-arcade-panel overflow-hidden">
        {/* ── Allgemein ─────────────────────────────────────────────── */}
        <div className="cr-section space-y-4">
          <h2 className="cr-section-title">{t.sectionBasics}</h2>
          <label className="block">
            <span className="cr-eyebrow">{t.name}</span>
            <input value={s.name} onChange={e => set({ name: e.target.value })} maxLength={limits.nameMax}
              placeholder={t.namePh} className="cr-input mt-1.5 px-4 py-3 text-base font-semibold" />
          </label>
          <label className="block">
            <span className="cr-eyebrow">{t.description}</span>
            <textarea value={s.description} onChange={e => set({ description: e.target.value })}
              maxLength={limits.descriptionMax} rows={3} placeholder={t.descriptionPh}
              className="cr-input mt-1.5 px-4 py-3 text-sm resize-y min-h-[84px]" />
          </label>
        </div>

        {/* ── Format ────────────────────────────────────────────────── */}
        <div className="cr-section">
          <h2 className="cr-section-title">{t.sectionFormat}</h2>
        </div>
        <SettingRow icon={CrUser} label={t.maxPlayers} inline>
          <Stepper value={s.maxPlayers} min={limits.minPlayers} max={limits.maxPlayers} label={t.maxPlayers}
            onChange={v => set({ maxPlayers: v })} />
        </SettingRow>
        <SettingRow label={t.groupStage} note={t.groupStageNote} inline>
          <Toggle checked={s.groupStage.enabled} onChange={v => setGroup({ enabled: v })} accent="bg-[#2f6fe0]" aria-label={t.groupStage} />
        </SettingRow>
        {s.groupStage.enabled && (
          <div className="cr-section">
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <p className="cr-eyebrow mb-1.5">{t.groupSize}</p>
                <Stepper value={s.groupStage.groupSize} min={limits.groupSizeMin} max={limits.groupSizeMax} label={t.groupSize}
                  onChange={v => setGroup({ groupSize: v, advancePerGroup: Math.min(s.groupStage.advancePerGroup, v - 1) })} />
              </div>
              <div>
                <p className="cr-eyebrow mb-1.5">{t.advancePerGroup}</p>
                <Stepper value={s.groupStage.advancePerGroup} min={1} max={s.groupStage.groupSize - 1} label={t.advancePerGroup}
                  onChange={v => setGroup({ advancePerGroup: v })} />
              </div>
            </div>
            {groupHint?.note && <p className="text-white/55 text-xs mt-3">{groupHint.note}</p>}
            {groupHint?.warn && <p className="text-red-400 text-xs mt-3">{groupHint.warn}</p>}
          </div>
        )}
        <SettingRow label={t.doubleElim} note={t.doubleElimNote} inline>
          <Toggle checked={s.doubleElimination} onChange={v => set({ doubleElimination: v })} accent="bg-[#2f6fe0]" aria-label={t.doubleElim} />
        </SettingRow>
        <div className="cr-section">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="cr-eyebrow mb-1.5">{t.bestOfNormal}</p>
              <SegmentedControl value={s.bestOf.normal} onChange={v => set({ bestOf: { ...s.bestOf, normal: v } })}
                options={[1, 3].map(n => ({ id: n, label: t.bo(n) }))} />
            </div>
            <div>
              <p className="cr-eyebrow mb-1.5">{t.bestOfFinals}</p>
              <SegmentedControl value={s.bestOf.finals} onChange={v => set({ bestOf: { ...s.bestOf, finals: v } })}
                options={[3, 5].map(n => ({ id: n, label: t.bo(n) }))} />
            </div>
          </div>
        </div>
        <SettingRow label={t.modeSelection}
          note={s.modeSelection === 'pickban' ? t.pickbanNote : t.randomNote}>
          <SegmentedControl value={s.modeSelection} onChange={v => set({ modeSelection: v })}
            options={[{ id: 'pickban', label: t.pickban, icon: CrSwap }, { id: 'random', label: t.random, icon: CrRandom }]} />
        </SettingRow>

        {/* ── Minigames ─────────────────────────────────────────────── */}
        <div className="cr-section">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="cr-section-title"><CrCards size={24} />{t.sectionModes}</h2>
            <span className="text-white/45 text-xs tabular-nums">{s.modes.length}/{soloModes.length}</span>
          </div>
          <p className="text-white/50 text-xs mb-3">{t.modesNote}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {soloModes.map(m => {
              const Icon = modeInfo(m.id).icon;
              const on = s.modes.includes(m.id);
              return (
                <button key={m.id} type="button" aria-pressed={on} onClick={() => toggleMode(m.id)}
                  className="cr-tile-btn px-3 py-2">
                  <span className="cr-tile-icon w-10 h-10"><Icon size={26} /></span>
                  <span className="font-cr text-white text-[15px] flex-1 min-w-0 truncate">{modeNameFor(m.id, lang)}</span>
                  {on && <CrCheck size={20} />}
                </button>
              );
            })}
          </div>
          {s.modeSelection === 'pickban' && s.modes.length < 3 && (
            <p className="text-red-400 text-xs mt-3">{t.errors.tournamentPickBanNeedsThree}</p>
          )}
        </div>

        {/* ── Regeln & Fristen ──────────────────────────────────────── */}
        <div className="cr-section">
          <h2 className="cr-section-title">{t.sectionRules}</h2>
        </div>
        <SettingRow label={t.signupMode} note={t.signupNote}>
          <SegmentedControl value={s.signupMode} onChange={v => set({ signupMode: v })}
            options={[{ id: 'twitch', label: t.signupTwitch }, { id: 'open', label: t.signupOpen }]} />
        </SettingRow>
        <SettingRow label={t.deckCheck} note={t.deckCheckNote} inline>
          <Toggle checked={s.deckCheck} onChange={v => set({ deckCheck: v })} accent="bg-[#2f6fe0]" aria-label={t.deckCheck} />
        </SettingRow>
        <SettingRow icon={CrClock} label={t.showUp} note={t.showUpNote}>
          <SegmentedControl value={s.showUpMinutes} onChange={v => set({ showUpMinutes: v })}
            options={SHOW_UP_OPTIONS.map(n => ({ id: n, label: t.minutes(n) }))} />
        </SettingRow>
        <SettingRow icon={CrClock} label={t.battle} note={t.battleNote}>
          <SegmentedControl value={s.battleMinutes} onChange={v => set({ battleMinutes: v })}
            options={BATTLE_OPTIONS.map(n => ({ id: n, label: t.minutes(n) }))} />
        </SettingRow>

        {/* ── Start & Sichtbarkeit ──────────────────────────────────── */}
        <div className="cr-section">
          <h2 className="cr-section-title">{t.sectionStart}</h2>
        </div>
        <SettingRow label={t.startsAt}>
          <div className="flex flex-wrap items-center gap-3">
            <input type="datetime-local" value={toLocalInput(s.startsAt)}
              onChange={e => { const v = fromLocalInput(e.target.value); set({ startsAt: v, autoStart: v ? s.autoStart : false }); }}
              className="cr-input px-3 py-2.5 text-sm w-auto [color-scheme:dark]" />
            {s.startsAt && (
              <button type="button" onClick={() => set({ startsAt: null, autoStart: false })}
                className="text-white/55 hover:text-white text-xs underline underline-offset-2">
                {t.startsAtNone}
              </button>
            )}
          </div>
        </SettingRow>
        <SettingRow label={t.autoStart} note={t.autoStartNote} inline>
          <Toggle checked={s.autoStart} disabled={!s.startsAt} onChange={v => set({ autoStart: v })} accent="bg-[#2f6fe0]" aria-label={t.autoStart} />
        </SettingRow>
        <SettingRow label={t.listed} note={t.listedNote} inline>
          <Toggle checked={s.listed} onChange={v => set({ listed: v })} accent="bg-[#2f6fe0]" aria-label={t.listed} />
        </SettingRow>

        <div className="cr-section space-y-3">
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <ChunkyButton variant="green" size="lg" block icon={editing ? CrCheck : CrTourneyTrophy} iconSize={28}
            disabled={saving} onClick={submit}>
            {editing ? t.save : t.create}
          </ChunkyButton>
        </div>
      </div>
    </div>
  );
}
