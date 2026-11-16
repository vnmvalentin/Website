// ui/pages/CodexPage.jsx — Kartenbuch: alle Karten filterbar (Stamm, Kosten, Seltenheit, Sigil) und ein Sigil-Lexikon.
// Am Tisch im Kerzenlicht (Standard) steht es im Buch des Zeichners (table/TableBook.jsx, Kapitel Karten/Sigils/
// Allerlei); diese Seite ist der Ausweichweg. Inhalt und Filter teilen sich beide (codexParts.jsx, codexData.js).
import React, { Suspense, lazy, useState } from "react";
import SEO from "../../../../components/SEO";
import Card from "../card/Card.jsx";
import CardDetail from "../card/CardDetail.jsx";
import { resolveCard } from "../../engine/cards.js";
import { ZIRKEL } from "../../engine/zirkel/index.js";
import { de } from "../../i18n/de.js";
import { useCodexCards } from "./codexData.js";
import { SigilLexicon, CodexMore } from "./codexParts.jsx";
import { useAtTable } from "../table/useAtTable.js";

const TableBook = lazy(() => import("../table/TableBook.jsx"));
const SEO_PROPS = { title: "Sacrifice & Sigils – Kartenbuch", description: "Alle Karten, Sigils, Items und Ereignisse von Sacrifice & Sigils: filterbar nach Stamm, Kosten, Seltenheit und Sigil.", path: "/sacrifice-and-sigils/kartenbuch" };

/** Abschnitt der Seite: Pergament mit Überschrift. */
const Box = ({ title, wide, children }) => (
  <section className={`ss-paper p-4 md:p-5 ${wide ? "md:col-span-2" : ""}`}>
    <h2 className="ss-title !text-[var(--ink)] text-xl mb-3">{title}</h2>
    {children}
  </section>
);

export default function CodexPage() {
  const [atTable, fallback] = useAtTable();
  if (atTable) {
    return (
      <>
        <SEO {...SEO_PROPS} />
        <Suspense fallback={null}><TableBook start="karten" onFallback={fallback} /></Suspense>
      </>
    );
  }
  return <FlatCodex />;
}

/** Das bisherige Kartenbuch als Seite. */
function FlatCodex() {
  const cx = useCodexCards();
  const { zirkelId, z } = cx;
  const [tab, setTab] = useState("cards");
  const [detail, setDetail] = useState(null);

  return (
    <div className="max-w-[1350px] mx-auto px-4 py-6 space-y-5">
      <SEO {...SEO_PROPS} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="ss-title text-3xl">{de.ui.codex}</h1>
          <div className="flex gap-2" role="tablist" aria-label="Zirkel">
            {Object.values(ZIRKEL).map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={zirkelId === x.id} className={`ss-btn ss-btn-sm ${zirkelId === x.id ? "!text-[var(--candle)] !border-[var(--candle)]" : ""}`} onClick={() => cx.switchZirkel(x.id)}>{x.name}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-2" role="tablist">
          {[["cards", "Karten"], ["sigils", "Sigil-Lexikon"], ["more", "Items, Totems & Ereignisse"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`ss-btn ss-btn-sm ${tab === id ? "!text-[var(--candle)] !border-[var(--candle)]" : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "cards" && (
        <>
          <div className="ss-paper p-3 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <label className="col-span-2"><span className="text-xs opacity-70">Name</span><input className="ss-input mt-0.5" value={cx.q} onChange={(e) => cx.setQ(e.target.value)} placeholder="Suchen …" /></label>
            <label><span className="text-xs opacity-70">Stamm</span>
              <select className="ss-select w-full mt-0.5" value={cx.tribe} onChange={(e) => cx.setTribe(e.target.value)}>
                <option value="">alle</option>{cx.tribeIds.map((t) => <option key={t} value={t}>{de.tribes[t].name}</option>)}
              </select>
            </label>
            <label><span className="text-xs opacity-70">Kosten</span>
              <select className="ss-select w-full mt-0.5" value={cx.cost} onChange={(e) => cx.setCost(e.target.value)}>
                <option value="">alle</option>{z.resources.map((r) => r.id).map((t) => <option key={t} value={t}>{de.costs[t].name}</option>)}
              </select>
            </label>
            <label><span className="text-xs opacity-70">Seltenheit</span>
              <select className="ss-select w-full mt-0.5" value={cx.rarity} onChange={(e) => cx.setRarity(e.target.value)}>
                <option value="">alle</option>{Object.entries(de.rarities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label><span className="text-xs opacity-70">Sigil</span>
              <select className="ss-select w-full mt-0.5" value={cx.sigil} onChange={(e) => cx.setSigil(e.target.value)}>
                <option value="">alle</option>{cx.publicSigils.map((s) => <option key={s.id} value={s.id}>{de.sigils[s.id].name}</option>)}
              </select>
            </label>
            <label className="col-span-2 md:col-span-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={cx.showTokens} onChange={(e) => cx.setShowTokens(e.target.checked)} /> auch Tokens, Folgeformen und verfluchte Karten zeigen</label>
          </div>
          <p className="ss-dim text-sm">{cx.cards.length} Karten</p>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {cx.cards.map((c) => (
              <div key={c.id} className="flex justify-center">
                <Card card={resolveCard(c.id, [], c.id)} width={150} onClick={() => setDetail(resolveCard(c.id, [], c.id))} tabIndex={0} />
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "sigils" && (
        <div className="space-y-5">
          <SigilLexicon zirkelId={zirkelId} Box={Box} onShowCards={(id) => { cx.setSigil(id); setTab("cards"); }} />
        </div>
      )}

      {tab === "more" && (
        <div className="grid md:grid-cols-2 gap-5">
          <CodexMore zirkelId={zirkelId} Box={Box} />
        </div>
      )}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
