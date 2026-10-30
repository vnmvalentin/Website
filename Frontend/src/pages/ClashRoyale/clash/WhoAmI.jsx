// WhoAmI.jsx — „Wer bin ich?“ zu zweit wie das Klappbrett-Spiel (Server: Backend/clashRoyale/guessWhoRoutes.js).
//   /clash/wer-bin-ich         Raum erstellen (mit Rastergröße) oder per Code beitreten
//   /clash/wer-bin-ich/:code   der Raum. Phase 1: aus dem EIGENEN Pool geheim eine Karte wählen. Phase 2: der Pool des
//                              Gegners liegt vor dir — abwechselnd fragen (Chat hier oder Voice), Ja/Nein, umklappen, raten.
// Ein Socket je Besuch; Wiederkommen nach Abbruch über Code + Name, wie bei Vier Gewinnt. Texte DE/EN (clashI18n.js),
// auch die Systemmeldungen des Servers (Code + Name).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Copy, Check, Send } from 'lucide-react';
import GameFrame from './GameFrame';
import FlipCard from './FlipCard';
import CardFace from '../ui/CardFace';
import ChunkyButton from '../ui/ChunkyButton';
import { CrCrown, CrReplay, CrTarget, CrChat, CrUser } from '../ui/CrIcons';
import { ASK } from './quizData';
import { ALL_CARDS } from '../data/cards';
import { useClashLang, pick } from './clashI18n';
import { playSound } from '../ui/sound';
import kingImg from '../../../assets/clashRoyale/ui/king_blue.webp';

const NAME_KEY = 'crq_gw_name';
const GRID_KEY = 'crq_gw_grid';
const GRID_OPTIONS = ['4x4', '5x4', '6x4', '6x5', '6x6', '7x6', '7x7'];
const colsOf = (grid) => Number(String(grid || '6x4').split('x')[0]) || 6;
// Alle Karten (der Server zieht aus dem vollen Pool, nicht nur aus Karten mit Merkmalen)
const byId = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));

function readKey(k, fallback = '') { try { return localStorage.getItem(k) || fallback; } catch { return fallback; } }
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* privat */ } }
const label = (g) => g.replace('x', ' × ');

function useSocket() {
  const ref = useRef(null);
  if (!ref.current) ref.current = io('/', { path: '/socket.io', transports: ['websocket', 'polling'], reconnection: true, autoConnect: false });
  useEffect(() => {
    const s = ref.current;
    s.connect();
    return () => { s.emit('gw:leave'); s.disconnect(); };
  }, []);
  return ref.current;
}

function GridPicker({ value, onChange, disabled }) {
  return (
    <div className="gw-grid-pick" role="group">
      {GRID_OPTIONS.map((g) => (
        <button key={g} type="button" aria-pressed={value === g} disabled={disabled} onClick={() => onChange(g)}>{label(g)}</button>
      ))}
    </div>
  );
}

/* ── Start: Raum erstellen / beitreten ─────────────────────────────────── */
function Start({ seo }) {
  const { t } = useClashLang();
  const navigate = useNavigate();
  const [name, setName] = useState(() => readKey(NAME_KEY));
  const [grid, setGrid] = useState(() => (GRID_OPTIONS.includes(readKey(GRID_KEY)) ? readKey(GRID_KEY) : '6x4'));
  const [code, setCode] = useState('');
  const go = (target) => {
    const n = name.trim().slice(0, 24);
    if (!n) return;
    store(NAME_KEY, n);
    store(GRID_KEY, grid);
    navigate(target);
  };
  return (
    <GameFrame title={t.whoTitle} icon={kingImg} seo={seo}>
      <div className="cr-arcade-panel p-5 md:p-6 flex flex-col gap-5 max-w-xl mx-auto">
        <p className="text-white/80 leading-relaxed">{t.whoIntro}</p>
        <label className="flex flex-col gap-1.5">
          <span className="font-cr text-base">{t.yourName}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="crq-input !pl-4" placeholder={t.name} />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="font-cr text-base">{t.gridSize}</span>
          <GridPicker value={grid} onChange={setGrid} />
        </div>
        <ChunkyButton variant="green" size="lg" block disabled={!name.trim()} onClick={() => go('/clash/wer-bin-ich/neu')}>{t.createRoom}</ChunkyButton>
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} className="crq-input !pl-4 flex-1 tracking-[0.3em] font-cr" placeholder={t.code} aria-label={t.roomCode} />
          <ChunkyButton variant="blue" disabled={!name.trim() || code.length !== 5} onClick={() => go(`/clash/wer-bin-ich/${code}`)}>{t.join}</ChunkyButton>
        </div>
      </div>
    </GameFrame>
  );
}

/* ── Raum ──────────────────────────────────────────────────────────────── */
function Room({ code: urlCode, seo }) {
  const { lang, t } = useClashLang();
  const navigate = useNavigate();
  const socket = useSocket();
  const [state, setState] = useState(null);
  const [phase, setPhase] = useState('connecting'); // connecting | name | in | not-found | full
  const [name, setName] = useState(() => readKey(NAME_KEY));
  const [copied, setCopied] = useState(false);
  const [picked, setPicked] = useState(null);
  const [guessing, setGuessing] = useState(false);
  const [text, setText] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const chatRef = useRef(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  // Echter Raumcode: bei "neu" erst nach dem Erstellen bekannt. Die Komponente bleibt beim Adresswechsel
  // bestehen (gleicher key) — sonst würde der gerade erstellte Raum beim Neuaufbau wieder verlassen.
  const roomRef = useRef(urlCode === 'neu' ? null : urlCode);

  const enter = useCallback((n) => {
    const nm = String(n || '').trim().slice(0, 24);
    if (!nm) { setPhase('name'); return; }
    store(NAME_KEY, nm);
    if (!roomRef.current) {
      socket.emit('gw:create', { name: nm, grid: readKey(GRID_KEY, '6x4') }, (res) => {
        if (!res?.ok) return;
        roomRef.current = res.code;
        navigate(`/clash/wer-bin-ich/${res.code}${window.location.search}`, { replace: true });
        setPhase('in');
      });
    } else {
      socket.emit('gw:join', { code: roomRef.current, name: nm }, (res) => {
        if (!res?.ok) { setPhase(res?.error === 'full' ? 'full' : 'not-found'); return; }
        setPhase('in');
      });
    }
  }, [socket, navigate]);

  useEffect(() => {
    const onState = (s) => setState(s);
    // Auch beim Wiederverbinden: gleicher Code + Name → derselbe Platz
    const onConnect = () => enter(nameRef.current);
    socket.on('gw:state', onState);
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();
    return () => { socket.off('gw:state', onState); socket.off('connect', onConnect); };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Neue Nachrichten: nach unten scrollen + Ton bei Frage an mich
  const lastMsg = state?.chat?.[state.chat.length - 1];
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (lastMsg?.kind === 'question' && lastMsg.from !== state?.mySlot) playSound('join');
  }, [lastMsg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Runden-/Phasenwechsel: Auswahl zurücksetzen
  useEffect(() => { setPicked(null); setGuessing(false); }, [state?.round, state?.status, state?.grid]);

  const me = state?.me;
  const opp = state?.opponent;
  const status = state?.status;
  const myTurn = status === 'playing' && state.turn === state.mySlot;
  const flipped = useMemo(() => new Set(me?.flipped || []), [me?.flipped]);
  const nameOf = (slot) => (slot === state?.mySlot ? me?.name : opp?.name) || t.player;
  const oppName = opp?.name || t.opponent;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/clash/wer-bin-ich/${state?.code || urlCode}${lang === 'en' ? '?lang=en' : ''}` : '';
  // Phase 1 zeigt den eigenen Pool, Phase 2 (und Ende) das Brett = Pool des Gegners
  const cardsShown = (status === 'picking' || status === 'waiting' ? state?.myPool : state?.board) || [];
  const cols = colsOf(state?.grid);

  const onCard = (id) => {
    if (!state) return;
    if (status === 'picking' && !me?.ready) { setPicked(id); return; }
    if (status !== 'playing') return;
    if (guessing) { setPicked(id === picked ? null : id); return; }
    socket.emit('gw:flip', { cardId: id });
  };

  const say = (kind, payload = {}) => socket.emit('gw:say', { kind, ...payload });
  const sendText = (asQuestion) => {
    const v = text.trim();
    if (!v) return;
    say(asQuestion ? 'question' : 'msg', { text: v });
    setText('');
  };
  const sysText = (m) => {
    const f = t.sys[m.code];
    return typeof f === 'function' ? f(m.name) : f || '';
  };

  const back = { to: '/clash/wer-bin-ich', label: t.whoTitle };
  if (phase === 'not-found' || phase === 'full') {
    return (
      <GameFrame title={t.whoTitle} icon={kingImg} back={back}>
        <div className="cr-arcade-panel p-6 max-w-md mx-auto text-center flex flex-col gap-4">
          <p className="font-cr text-2xl">{phase === 'full' ? t.roomFull : t.roomNotFound}</p>
          <ChunkyButton variant="green" onClick={() => navigate('/clash/wer-bin-ich')}>{t.newRoom}</ChunkyButton>
        </div>
      </GameFrame>
    );
  }
  if (phase === 'name') {
    return (
      <GameFrame title={t.whoTitle} icon={kingImg} back={back}>
        <div className="cr-arcade-panel p-6 max-w-md mx-auto flex flex-col gap-4">
          <span className="font-cr text-lg">{t.whatsYourName}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="crq-input !pl-4" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') enter(name); }} />
          <ChunkyButton variant="green" disabled={!name.trim()} onClick={() => enter(name)}>{t.join}</ChunkyButton>
        </div>
      </GameFrame>
    );
  }
  if (!state) {
    return <GameFrame title={t.whoTitle} icon={kingImg} back={back}><p className="text-center text-white/70">{t.connecting}</p></GameFrame>;
  }

  const winnerMe = status === 'finished' && state.winner === state.mySlot;
  const answerable = state.pending && state.pending.from !== state.mySlot;
  const mySecret = byId[me?.secret];
  const isHost = state.mySlot === 1;
  const gridLocked = !(status === 'waiting' || status === 'picking') || me?.ready || opp?.ready;

  return (
    <GameFrame wide back={back} seo={seo}>
      {/* Spielerleiste */}
      <div className="gw-bar">
        {[state.mySlot, state.mySlot === 1 ? 2 : 1].map((slot) => {
          const p = slot === state.mySlot ? me : opp;
          const active = status === 'playing' && state.turn === slot;
          return (
            <div key={slot} className={`gw-player${active ? ' is-turn' : ''}${slot === state.mySlot ? ' is-me' : ''}`}>
              <CrUser size={22} />
              <span className="min-w-0">
                <b className="block truncate">{p ? p.name : t.waitingSlot}{slot === state.mySlot ? ` (${t.you})` : ''}</b>
                <span className="text-xs text-white/60">
                  {!p ? t.shareLink : !p.connected ? t.disconnected : status === 'picking' ? (p.ready ? t.picked : t.picking) : status === 'waiting' ? '' : t.openCards(p.open)}
                </span>
              </span>
              {active && <span className="gw-turn-tag">{t.onTurn}</span>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 lg:gap-5 items-start mt-4">
        <section className="cr-arcade-panel p-3 md:p-4">
          {status === 'waiting' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="font-cr text-2xl">{t.waitOpponent}</p>
              <p className="text-white/70 text-sm">{t.sendLink(<b key="c" className="font-cr text-white tracking-widest">{state.code}</b>)}</p>
              <ChunkyButton variant="blue" icon={copied ? Check : Copy} onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? t.copied : t.copy}
              </ChunkyButton>
            </div>
          )}

          {(status === 'waiting' || status === 'picking') && (
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="font-cr text-base">{t.gridSize}</span>
              <GridPicker value={state.grid} disabled={!isHost || gridLocked} onChange={(g) => socket.emit('gw:grid', { grid: g })} />
              {!isHost && <span className="text-xs text-white/50">{t.gridHostOnly}</span>}
            </div>
          )}

          {status === 'picking' && (
            <div className="flex flex-wrap items-center gap-3 mb-3">
              {!me?.ready ? (
                <>
                  <span className="font-cr text-lg">{t.phase1}</span>
                  <div className="flex-1" />
                  <ChunkyButton variant="green" size="sm" disabled={!picked} onClick={() => socket.emit('gw:pick', { cardId: picked })}>
                    {picked ? t.take(byId[picked]?.name) : t.tapCard}
                  </ChunkyButton>
                </>
              ) : <span className="font-cr text-lg">{t.waitPick(oppName)}</span>}
            </div>
          )}

          {(status === 'playing' || status === 'finished') && (
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="crq-counter">{t.openCards(cardsShown.length - flipped.size)}</span>
              {status === 'playing' && !guessing && <span className="text-sm text-white/70">{t.phase2(oppName)}</span>}
              {guessing && <span className="text-sm text-[var(--cr-arcade-gold)] font-semibold">{t.whichCard(oppName)}</span>}
              {status === 'finished' && (
                <span className="font-cr text-xl">{winnerMe ? t.won : t.lost} <span className="text-base text-white/70 font-sans">{t.hadCard(oppName, byId[opp?.secret]?.name)}</span></span>
              )}
            </div>
          )}

          {status !== 'waiting' && (
            <div className={`crf-grid${guessing ? ' is-guessing' : ''}${cols >= 7 || cardsShown.length >= 36 ? ' is-dense' : ''}`} style={{ '--crf-cols': cols }}>
              {cardsShown.map((id) => {
                const c = byId[id];
                if (!c) return null;
                let st = '';
                if (status === 'picking' && (picked === id || me?.secret === id)) st = 'picked';
                if (status === 'playing' && guessing && picked === id) st = 'picked';
                if (status === 'finished' && id === opp?.secret) st = 'secret';
                if (status === 'finished' && state.lastGuess?.by === state.mySlot && !state.lastGuess.right && id === state.lastGuess.cardId) st = 'wrong';
                return <FlipCard key={id} card={c} flipped={status !== 'picking' && flipped.has(id) && st !== 'secret'} state={st}
                  onClick={() => onCard(id)} disabled={status === 'finished' || (status === 'picking' && me?.ready)} />;
              })}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-3">
          {mySecret && (
            <div className="cr-arcade-panel p-3 flex items-center gap-3">
              <span className="w-16 shrink-0 aspect-[4/5]"><CardFace id={mySecret.id} rarity={mySecret.rarity} /></span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-white/50">{t.yourCard}</span>
                <span className="block font-cr text-xl truncate">{mySecret.name}</span>
              </span>
            </div>
          )}

          {status === 'playing' && (
            <div className="cr-arcade-panel p-3 flex flex-col gap-2">
              {myTurn ? (
                guessing ? (
                  <>
                    <ChunkyButton variant="green" block disabled={!picked} onClick={() => socket.emit('gw:guess', { cardId: picked })}>
                      {picked ? t.sure(byId[picked]?.name) : t.tapCard}
                    </ChunkyButton>
                    <button type="button" className="text-sm text-white/60 hover:text-white" onClick={() => { setGuessing(false); setPicked(null); }}>{t.cancel}</button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <ChunkyButton variant="blue" size="sm" onClick={() => socket.emit('gw:endTurn')}>{t.endTurn}</ChunkyButton>
                    <ChunkyButton variant="gold" size="sm" icon={CrTarget} onClick={() => setGuessing(true)}>{t.guessBtn}</ChunkyButton>
                  </div>
                )
              ) : <p className="text-sm text-white/70 text-center">{t.theirTurn(oppName)}</p>}
              <p className="text-xs text-white/45 text-center">{t.flipHelp}</p>
            </div>
          )}

          {status === 'finished' && (
            <div className="cr-arcade-panel p-4 flex flex-col items-center gap-2">
              <div className="flex gap-1">{[0, 1, 2].map((i) => <CrCrown key={i} size={28} className={winnerMe ? '' : 'opacity-25 grayscale'} />)}</div>
              <ChunkyButton variant="green" icon={CrReplay} disabled={state.rematch?.[state.mySlot]} onClick={() => socket.emit('gw:rematch')}>
                {state.rematch?.[state.mySlot] ? t.waitRematch : t.rematch}
              </ChunkyButton>
            </div>
          )}

          {/* Chat: Fragen, Ja/Nein, freie Nachrichten */}
          <div className="cr-arcade-panel p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-cr text-base"><CrChat size={20} /> {t.chat}</div>
            <div ref={chatRef} className="gw-chat custom-scrollbar">
              {state.chat.map((m) => (
                <div key={m.id} className={`gw-msg is-${m.kind}${m.from === state.mySlot ? ' is-mine' : ''}`}>
                  {m.kind === 'system' ? sysText(m) : (
                    <>
                      <b>{nameOf(m.from)}</b>
                      <span>{m.kind === 'answer' ? <span className={m.yes ? 'text-[#6adf82]' : 'text-[#ff8384]'}>{m.yes ? t.yes : t.no}</span> : m.text}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {answerable && (
              <div className="grid grid-cols-2 gap-2">
                <ChunkyButton variant="green" size="sm" onClick={() => say('answer', { yes: true })}>{t.yes}</ChunkyButton>
                <ChunkyButton variant="red" size="sm" onClick={() => say('answer', { yes: false })}>{t.no}</ChunkyButton>
              </div>
            )}
            {myTurn && !state.pending && !guessing && (
              <div className="relative">
                <button type="button" className="gw-ask-toggle" onClick={() => setAskOpen((o) => !o)}>{t.suggestions} {askOpen ? '▴' : '▾'}</button>
                {askOpen && (
                  <div className="gw-ask">
                    {ASK.map((q) => {
                      const qt = pick(q, lang);
                      return <button key={qt} type="button" onClick={() => { say('question', { text: qt }); setAskOpen(false); }}>{qt}</button>;
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={160}
                onKeyDown={(e) => { if (e.key === 'Enter') sendText(myTurn && !state.pending && /\?\s*$/.test(text)); }}
                placeholder={myTurn && !state.pending ? t.askPh : t.msgPh} className="crq-input !h-10 !pl-3 !text-sm flex-1" />
              <button type="button" className="cr-chip w-10 h-10 rounded-lg flex items-center justify-center shrink-0" aria-label={t.send}
                onClick={() => sendText(myTurn && !state.pending && /\?\s*$/.test(text))}><Send size={16} /></button>
            </div>
            {myTurn && !state.pending && <p className="text-[11px] text-white/45">{t.qHint(oppName)}</p>}
          </div>
        </aside>
      </div>
    </GameFrame>
  );
}

export default function WhoAmI() {
  const { code } = useParams();
  const { lang, t } = useClashLang();
  const seo = { title: lang === 'en' ? 'Clash Royale Guess Who? for two' : 'Clash Royale: Wer bin ich? zu zweit', description: t.whoSeo, path: '/clash/wer-bin-ich' };
  if (!code) return <Start seo={seo} />;
  return <Room key="room" seo={seo} code={code.toUpperCase() === 'NEU' ? 'neu' : code.toUpperCase()} />;
}
