// Hub-Ansicht "Turniere": Knopf zum Erstellen, offene (gelistete) Turniere und — mit
// Twitch-Login — die eigenen. Lädt erst, wenn die Ansicht geöffnet wird (active).
import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TwitchAuthContext } from '../../../components/TwitchAuthContext';
import ChunkyButton from '../ui/ChunkyButton';
import { CrTourneyTrophy, CrPlus, CrRegion, CrCrown, CrUser, CrClock } from '../ui/CrIcons';
import { tDict } from './tI18n';
import { tournamentApi, withLang } from './tournamentApi';

const STATUS_LABEL = { registration: 'statusRegistration', drawn: 'statusDrawn', running: 'statusRunning', finished: 'statusFinished', cancelled: 'statusCancelled' };

function TournamentRow({ tr, t, lang, onOpen }) {
  return (
    <button type="button" onClick={onOpen} className="cr-tile-btn px-3 py-2.5">
      <span className="cr-tile-icon w-11 h-11"><CrTourneyTrophy size={30} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-cr text-white text-[15px] truncate">{tr.name}</span>
        <span className="flex flex-wrap items-center gap-x-3 text-white/50 text-xs">
          <span className="flex items-center gap-1"><CrUser size={13} />{t.players(tr.participantCount, tr.maxPlayers)}</span>
          {tr.startsAt && (
            <span className="flex items-center gap-1"><CrClock size={13} />
              {new Date(tr.startsAt).toLocaleString(lang === 'de' ? 'de-DE' : lang === 'es' ? 'es-ES' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <span>{t[STATUS_LABEL[tr.status]] || tr.status}</span>
        </span>
      </span>
    </button>
  );
}

export default function TournamentHubView({ active, lang }) {
  const t = tDict(lang);
  const navigate = useNavigate();
  const { user } = useContext(TwitchAuthContext);
  const [open, setOpen] = useState(null);
  const [canCreate, setCanCreate] = useState(false);
  const [mine, setMine] = useState([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    tournamentApi.list().then(d => { if (!cancelled) setOpen(d.tournaments); }).catch(() => { if (!cancelled) setOpen([]); });
    // Erstellen ist ein Content-Creator-Feature (Freigabe im Admin-Dashboard)
    tournamentApi.meta().then(m => { if (!cancelled) setCanCreate(!!m.canCreate); }).catch(() => {});
    if (user) tournamentApi.mine().then(d => { if (!cancelled) setMine(d.tournaments); }).catch(() => {});
    else setMine([]);
    return () => { cancelled = true; };
  }, [active, user]);

  const go = (path) => navigate(withLang(path, lang));
  const mineIds = new Set(mine.map(m => m.id));
  const others = (open || []).filter(o => !mineIds.has(o.id));

  return (
    <div className="cr-arcade-panel overflow-hidden">
      <div className="cr-section space-y-4">
        <h2 className="cr-section-title text-xl"><CrTourneyTrophy size={30} />{t.menuTournaments}</h2>
        {canCreate ? (
          <ChunkyButton variant="gold" size="lg" block icon={CrPlus} iconSize={26} onClick={() => go('/clash-royale/turnier/neu')}>
            {t.createTitle}
          </ChunkyButton>
        ) : (
          <p className="text-white/55 text-sm">{t.createLocked}</p>
        )}
      </div>
      {mine.length > 0 && (
        <div className="cr-section space-y-3">
          <h3 className="cr-section-title"><CrCrown size={22} />{t.myTournaments}</h3>
          <div className="flex flex-col gap-2">
            {mine.map(tr => <TournamentRow key={tr.id} tr={tr} t={t} lang={lang} onOpen={() => go(`/clash-royale/turnier/${tr.id}`)} />)}
          </div>
        </div>
      )}
      <div className="cr-section space-y-3">
        <h3 className="cr-section-title"><CrRegion size={22} />{t.openTournaments}</h3>
        {open === null ? (
          <p className="text-white/45 text-sm">{t.loading}</p>
        ) : others.length === 0 ? (
          <p className="text-white/45 text-sm">{t.noTournaments}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {others.map(tr => <TournamentRow key={tr.id} tr={tr} t={t} lang={lang} onOpen={() => go(`/clash-royale/turnier/${tr.id}`)} />)}
          </div>
        )}
      </div>
    </div>
  );
}
