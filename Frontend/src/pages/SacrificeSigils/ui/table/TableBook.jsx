// ui/table/TableBook.jsx — das Buch des Zeichners (Rebuild „Am Tisch“, Phase 5).
//
// Kartenbuch und Anleitung waren zwei Website-Seiten mit Kästen und Reitern. Am Tisch sind sie ein Buch, das über
// dem Tisch aufgeschlagen liegt (der Tisch bleibt dahinter stehen — vom Hauptmenü aus ohne Neuaufbau). Vier
// Lesebändchen sind die Kapitel: Regeln · Karten · Sigils · Allerlei. Der Inhalt läuft von selbst über die Seiten
// (CSS-Spalten, eine Spalte = eine Seite) und wird umgeblättert: Pfeile an den Ecken, ←/→, Mausrad. Die Karten stehen
// wie in einem Sammelalbum, nach Stämmen geordnet; Filter und Zirkel stehen in der Kopfzeile, nicht auf den Seiten.
// Inhalt und Filter teilen sich Buch und Ausweich-Seiten (pages/GuidePage.jsx, pages/codexParts.jsx, codexData.js).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import TableHost from "./TableHost.jsx";
import Card from "../card/Card.jsx";
import CardDetail from "../card/CardDetail.jsx";
import { GuideContent } from "../pages/GuidePage.jsx";
import { SigilLexicon, CodexMore } from "../pages/codexParts.jsx";
import { useCodexCards } from "../pages/codexData.js";
import { resolveCard } from "../../engine/cards.js";
import { ZIRKEL } from "../../engine/zirkel/index.js";
import { useShell } from "../shellContext.js";
import { sound } from "../../audio/sound.js";
import { de } from "../../i18n/de.js";
import { stageModel } from "./stageModel.js";
import "./book.css";

const CHAPTERS = [["regeln", "Regeln"], ["karten", "Karten"], ["sigils", "Sigils"], ["allerlei", "Allerlei"]];
/** Abstand Seitenrand ↔ Text (px); zwischen den Seiten eines Aufschlags liegt der doppelte (der Bund). */
const MARGIN = 44;

/** Abschnitt im Buch: Überschrift und Text, fließt über die Seiten. */
const Section = ({ title, children }) => (
  <section className="sb-sec">
    <h2 className="sb-h2">{title}</h2>
    {children}
  </section>
);

/** Der Tisch hinter dem Buch: leer, Blick aufs Brett, niemand gegenüber. */
function BookTable({ room }) {
  const { showTip } = useShell();
  useEffect(() => {
    room.setHandlers(null);
    room.setPose("brett");
    room.sync(stageModel({ stage: "book", zirkel: "moor", seat: 0, myTurn: true, oppTurn: false }));
    room.setUi({});
    room.setTimer(null);
    return () => showTip(null);
  }, [room, showTip]);
  return null;
}

/**
 * @param {{ start: "regeln" | "karten" | "sigils" | "allerlei", onFallback: () => void }} props
 */
export default function TableBook({ start, onFallback }) {
  const navigate = useNavigate();
  const cx = useCodexCards();
  const [chapter, setChapter] = useState(start);
  const [spread, setSpread] = useState(0);
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pages, setPages] = useState(1);
  const viewRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const flowRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const wheelAt = useRef(0);

  // Maße der Seiten: eine Spalte = eine Seite, zwischen den beiden Seiten eines Aufschlags liegt der Bund
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const gap = MARGIN * 2;
  const pageW = Math.max(120, (size.w - gap) / 2);
  const spreads = Math.max(1, Math.ceil(pages / 2));

  // Wie viele Seiten ergibt der Inhalt? (nach jedem Kapitel-/Filterwechsel, nach dem Laden der Schriften)
  const measure = useCallback(() => {
    const el = flowRef.current;
    if (!el || !size.w) return;
    const n = Math.max(1, Math.round((el.scrollWidth + gap) / (pageW + gap)));
    setPages(n);
  }, [size.w, pageW, gap]);
  useLayoutEffect(() => { measure(); });
  useEffect(() => { document.fonts?.ready.then(measure); }, [measure]);
  useEffect(() => { setSpread((s) => Math.min(s, spreads - 1)); }, [spreads]);

  const open = (id) => {
    if (id === chapter) return;
    sound.play("draw");
    setChapter(id);
    setSpread(0);
  };
  const turn = useCallback((d) => {
    setSpread((s) => {
      const next = Math.max(0, Math.min(spreads - 1, s + d));
      if (next !== s) sound.play("draw");
      return next;
    });
  }, [spreads]);
  const close = () => navigate("/sacrifice-and-sigils");

  // Tasten: ←/→ blättern, Esc schließt das Buch (das Kartenblatt schließt sich selbst)
  useEffect(() => {
    const on = (e) => {
      if (detail) return;
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.key === "Escape") { if (typing) e.target.blur(); else close(); }
      else if (typing) return;
      else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); turn(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); turn(-1); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });
  const onWheel = (e) => {
    if (detail || Math.abs(e.deltaY) < 4) return;
    const now = performance.now();
    if (now - wheelAt.current < 380) return;
    wheelAt.current = now;
    turn(e.deltaY > 0 ? 1 : -1);
  };

  // Karten im Album: vier nebeneinander je Seite, nach Stämmen
  // Platz je Karte = Breite + 12 px Abstand rechts; vier davon müssen auf die Seite passen
  const cardW = Math.floor(Math.max(92, Math.min(150, pageW / 4 - 13)));
  const cardsByTribe = [];
  for (const c of cx.cards) {
    const last = cardsByTribe[cardsByTribe.length - 1];
    if (last && last.tribe === c.tribe) last.cards.push(c);
    else cardsByTribe.push({ tribe: c.tribe, cards: [c] });
  }
  const Ref = ({ to, children }) => (
    <button type="button" className="sb-ref" onClick={() => (to === "kartenbuch" ? open("karten") : navigate(`/sacrifice-and-sigils/${to}`))}>{children}</button>
  );
  const zirkelPick = (
    <span className="sb-zirkel" role="radiogroup" aria-label="Zirkel">
      {Object.values(ZIRKEL).map((x) => (
        <button key={x.id} type="button" role="radio" aria-checked={cx.zirkelId === x.id} className="sb-word" onClick={() => { cx.switchZirkel(x.id); setSpread(0); }}>{x.name.replace(/-Zirkel$/, "")}</button>
      ))}
    </span>
  );
  const filter = (fn) => (e) => { fn(e.target.value); setSpread(0); };

  const title = { regeln: "Regeln", karten: "Karten", sigils: "Sigils", allerlei: "Allerlei" }[chapter];
  const left = spread * 2 + 1;

  return (
    <>
      <TableHost zirkel="moor" seated={false} quiet onFallback={onFallback}>
        {(room) => <BookTable room={room} />}
      </TableHost>
      <div className="sb-root" onWheel={onWheel}>
        <div className="sb-book" role="document" aria-label="Das Buch des Zeichners">
          <nav className="sb-ribbons" aria-label="Kapitel">
            {CHAPTERS.map(([id, label], i) => (
              <button key={id} type="button" className="sb-ribbon" data-ribbon={i} aria-current={chapter === id ? "page" : undefined} onClick={() => open(id)}>{label}</button>
            ))}
          </nav>
          <button type="button" className="sb-close" onClick={close} aria-label="Buch zuklappen (Esc)" title="Zuklappen (Esc)"><X size={18} aria-hidden /></button>
          <div className="sb-spread">
            <div className="sb-head">
              <h1 className="sb-title">{title}{chapter === "karten" && <span className="sb-count">{cx.cards.length} Karten</span>}</h1>
              <div className="sb-tools">
                {chapter === "regeln" && <span className="sb-hint">Lieber ausprobieren? Das <Ref to="tutorial">Tutorial</Ref> führt durch einen Übungskampf.</span>}
                {chapter !== "regeln" && zirkelPick}
                {chapter === "karten" && (
                  <>
                    <input className="sb-input" value={cx.q} onChange={filter(cx.setQ)} placeholder="Name …" aria-label="Name" />
                    <select className="sb-select" value={cx.tribe} onChange={filter(cx.setTribe)} aria-label="Stamm">
                      <option value="">jeder Stamm</option>{cx.tribeIds.map((t) => <option key={t} value={t}>{de.tribes[t].name}</option>)}
                    </select>
                    <select className="sb-select" value={cx.cost} onChange={filter(cx.setCost)} aria-label="Kosten">
                      <option value="">alle Kosten</option>{cx.z.resources.map((r) => <option key={r.id} value={r.id}>{de.costs[r.id].name}</option>)}
                    </select>
                    <select className="sb-select" value={cx.rarity} onChange={filter(cx.setRarity)} aria-label="Seltenheit">
                      <option value="">jede Seltenheit</option>{Object.entries(de.rarities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select className="sb-select" value={cx.sigil} onChange={filter(cx.setSigil)} aria-label="Sigil">
                      <option value="">jedes Sigil</option>{cx.publicSigils.map((s) => <option key={s.id} value={s.id}>{de.sigils[s.id].name}</option>)}
                    </select>
                    <label className="sb-check"><input type="checkbox" checked={cx.showTokens} onChange={(e) => { cx.setShowTokens(e.target.checked); setSpread(0); }} /> Tokens</label>
                  </>
                )}
              </div>
            </div>
            <div className="sb-view" ref={viewRef}>
              <div
                ref={flowRef}
                className="sb-flow"
                data-chapter={chapter}
                style={{ columnWidth: `${pageW}px`, columnGap: `${gap}px`, height: size.h || undefined, transform: `translateX(${-spread * 2 * (pageW + gap)}px)` }}
              >
                {chapter === "regeln" && <GuideContent Section={Section} Ref={Ref} />}
                {chapter === "karten" && (cx.cards.length === 0
                  ? <p className="sb-empty">Keine Karte passt zu dieser Auswahl.</p>
                  : cardsByTribe.map((g) => (
                    <div key={g.tribe} className="sb-album">
                      <h2 className="sb-h2">{de.tribes[g.tribe]?.name || g.tribe}</h2>
                      {g.cards.map((c) => (
                        <span key={c.id} className="sb-slot">
                          <Card card={resolveCard(c.id, [], c.id)} width={cardW} onClick={() => setDetail(resolveCard(c.id, [], c.id))} tabIndex={0} />
                        </span>
                      ))}
                    </div>
                  )))}
                {chapter === "sigils" && <SigilLexicon zirkelId={cx.zirkelId} Box={Section} onShowCards={(id) => { cx.setSigil(id); setChapter("karten"); setSpread(0); }} />}
                {chapter === "allerlei" && <CodexMore zirkelId={cx.zirkelId} Box={Section} />}
              </div>
            </div>
            <div className="sb-foot">
              <button type="button" className="sb-turn" onClick={() => turn(-1)} disabled={spread === 0} aria-label="Zurückblättern (Pfeiltaste links)"><ChevronLeft size={20} aria-hidden /></button>
              <span className="sb-num">{left}</span>
              <span className="sb-num">{left + 1 <= pages ? left + 1 : ""}</span>
              <button type="button" className="sb-turn" onClick={() => turn(1)} disabled={spread >= spreads - 1} aria-label="Weiterblättern (Pfeiltaste rechts)"><ChevronRight size={20} aria-hidden /></button>
            </div>
          </div>
        </div>
      </div>
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
