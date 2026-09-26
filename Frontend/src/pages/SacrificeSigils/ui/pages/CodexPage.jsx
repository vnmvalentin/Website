// ui/pages/CodexPage.jsx — Kartenbuch: alle Karten filterbar (Stamm, Kosten, Seltenheit, Sigil) und ein Sigil-Lexikon.
import React, { useMemo, useState } from "react";
import SEO from "../../../../components/SEO";
import Card from "../card/Card.jsx";
import CardDetail from "../card/CardDetail.jsx";
import SigilIcon from "../icons/SigilIcon.jsx";
import { ALL_CARDS } from "../../data/cards/index.js";
import { resolveCard } from "../../engine/cards.js";
import { SIGILS, parseSigil } from "../../engine/sigils/index.js";
import { TRIBE_IDS } from "../../data/tribes.js";
import { ITEMS } from "../../data/items.js";
import { EVENTS } from "../../data/events.js";
import { LANE_PROPS, TOTEM_BASE_SIGILS } from "../../data/totems.js";
import { de } from "../../i18n/de.js";

const CATEGORIES = ["bewegung", "angriff", "verteidigung", "ressourcen", "feld"];

export default function CodexPage() {
  const [tab, setTab] = useState("cards");
  const [tribe, setTribe] = useState("");
  const [cost, setCost] = useState("");
  const [rarity, setRarity] = useState("");
  const [sigil, setSigil] = useState("");
  const [q, setQ] = useState("");
  const [showTokens, setShowTokens] = useState(false);
  const [detail, setDetail] = useState(null);

  const cards = useMemo(() => ALL_CARDS.filter((c) => {
    if (!showTokens && (c.token || c.cursed)) return false;
    if (tribe && c.tribe !== tribe) return false;
    if (cost && c.cost.type !== cost) return false;
    if (rarity && c.rarity !== rarity) return false;
    if (sigil && !c.sigils.some((s) => parseSigil(s).id === sigil)) return false;
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => a.tribe.localeCompare(b.tribe) || a.cost.type.localeCompare(b.cost.type) || a.cost.amount - b.cost.amount), [tribe, cost, rarity, sigil, q, showTokens]);

  const publicSigils = Object.values(SIGILS).filter((s) => !s.hidden);

  return (
    <div className="max-w-[1350px] mx-auto px-4 py-6 space-y-5">
      <SEO title="Sacrifice & Sigils – Kartenbuch" description="Alle Karten, Sigils, Items und Ereignisse von Sacrifice & Sigils: filterbar nach Stamm, Kosten, Seltenheit und Sigil." path="/sacrifice-and-sigils/kartenbuch" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="ss-title text-3xl">{de.ui.codex}</h1>
        <div className="flex gap-2" role="tablist">
          {[["cards", "Karten"], ["sigils", "Sigil-Lexikon"], ["more", "Items, Totems & Ereignisse"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`ss-btn ss-btn-sm ${tab === id ? "!text-[var(--candle)] !border-[var(--candle)]" : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "cards" && (
        <>
          <div className="ss-paper p-3 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <label className="col-span-2"><span className="text-xs opacity-70">Name</span><input className="ss-input mt-0.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen …" /></label>
            <label><span className="text-xs opacity-70">Stamm</span>
              <select className="ss-select w-full mt-0.5" value={tribe} onChange={(e) => setTribe(e.target.value)}>
                <option value="">alle</option>{TRIBE_IDS.map((t) => <option key={t} value={t}>{de.tribes[t].name}</option>)}
              </select>
            </label>
            <label><span className="text-xs opacity-70">Kosten</span>
              <select className="ss-select w-full mt-0.5" value={cost} onChange={(e) => setCost(e.target.value)}>
                <option value="">alle</option>{["blood", "bones", "wax"].map((t) => <option key={t} value={t}>{de.costs[t].name}</option>)}
              </select>
            </label>
            <label><span className="text-xs opacity-70">Seltenheit</span>
              <select className="ss-select w-full mt-0.5" value={rarity} onChange={(e) => setRarity(e.target.value)}>
                <option value="">alle</option>{Object.entries(de.rarities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label><span className="text-xs opacity-70">Sigil</span>
              <select className="ss-select w-full mt-0.5" value={sigil} onChange={(e) => setSigil(e.target.value)}>
                <option value="">alle</option>{publicSigils.map((s) => <option key={s.id} value={s.id}>{de.sigils[s.id].name}</option>)}
              </select>
            </label>
            <label className="col-span-2 md:col-span-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={showTokens} onChange={(e) => setShowTokens(e.target.checked)} /> auch Tokens, Folgeformen und verfluchte Karten zeigen</label>
          </div>
          <p className="ss-dim text-sm">{cards.length} Karten</p>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {cards.map((c) => (
              <div key={c.id} className="flex justify-center">
                <Card card={resolveCard(c.id, [], c.id)} width={150} onClick={() => setDetail(resolveCard(c.id, [], c.id))} tabIndex={0} />
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "sigils" && (
        <div className="space-y-5">
          {CATEGORIES.map((cat) => (
            <section key={cat} className="ss-paper p-4 md:p-5">
              <h2 className="ss-title !text-[var(--ink)] text-xl mb-3">{de.sigilCategories[cat]}</h2>
              <div className="grid md:grid-cols-2 gap-x-6 gap-y-3">
                {publicSigils.filter((s) => s.category === cat).map((s) => (
                  <div key={s.id} className="flex gap-3 items-start">
                    <SigilIcon sigil={s.id === "kerzendocht" ? "kerzendocht:3" : s.id} size={40} />
                    <div>
                      <p className="ss-title !text-[var(--ink)]">{de.sigils[s.id].name}{TOTEM_BASE_SIGILS.includes(s.id) ? <span className="text-xs opacity-60"> · Totem-Basis</span> : null}</p>
                      <p className="text-[0.95rem]">{de.sigils[s.id].desc}</p>
                      {de.sigils[s.id].example && <p className="text-sm italic opacity-70">{de.sigils[s.id].example}</p>}
                      <button type="button" className="text-xs underline opacity-70" onClick={() => { setSigil(s.id); setTab("cards"); }}>Karten mit diesem Sigil</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <section className="ss-paper p-4 md:p-5">
            <h2 className="ss-title !text-[var(--ink)] text-xl mb-3">Besondere Angriffswerte</h2>
            <ul className="space-y-1">{Object.values(de.specials).map((s) => <li key={s.name}><b>{s.name}:</b> {s.desc}</li>)}</ul>
          </section>
        </div>
      )}

      {tab === "more" && (
        <div className="grid md:grid-cols-2 gap-5">
          <section className="ss-paper p-4">
            <h2 className="ss-title !text-[var(--ink)] text-xl mb-2">Items ({ITEMS.length})</h2>
            <ul className="space-y-1.5">{ITEMS.map((i) => <li key={i.id}><b>{de.items[i.id].name}</b> <span className="opacity-60">({i.price} Splitter)</span>: {de.items[i.id].desc}</li>)}</ul>
          </section>
          <section className="ss-paper p-4">
            <h2 className="ss-title !text-[var(--ink)] text-xl mb-2">Seltene Ereignisse ({EVENTS.length})</h2>
            <ul className="space-y-1.5">{EVENTS.map((e) => <li key={e}><b>{de.events[e].name}:</b> {de.events[e].intro}</li>)}</ul>
          </section>
          <section className="ss-paper p-4">
            <h2 className="ss-title !text-[var(--ink)] text-xl mb-2">Totem-Basen ({TOTEM_BASE_SIGILS.length})</h2>
            <div className="flex flex-wrap gap-2">{TOTEM_BASE_SIGILS.map((s) => <span key={s} className="flex items-center gap-1 text-sm"><SigilIcon sigil={s} size={20} />{de.sigils[s].name}</span>)}</div>
            <p className="text-sm mt-2 opacity-75">Mit einem Stammkopf gilt die Basis für alle Karten des Stamms, mit einem Lanenkopf für jede eigene Karte in der Lane.</p>
          </section>
          <section className="ss-paper p-4">
            <h2 className="ss-title !text-[var(--ink)] text-xl mb-2">Lanen-Eigenschaften ({LANE_PROPS.length})</h2>
            <ul className="space-y-1.5">{LANE_PROPS.map((p) => <li key={p}><b>{de.totems.props[p].name}:</b> {de.totems.props[p].desc}</li>)}</ul>
          </section>
          <section className="ss-paper p-4 md:col-span-2">
            <h2 className="ss-title !text-[var(--ink)] text-xl mb-2">Stämme</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {TRIBE_IDS.map((t) => <p key={t}><b>{de.tribes[t].name}:</b> {de.tribes[t].identity} <span className="opacity-60">({ALL_CARDS.filter((c) => c.tribe === t && !c.token && !c.cursed).length})</span></p>)}
            </div>
          </section>
        </div>
      )}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
