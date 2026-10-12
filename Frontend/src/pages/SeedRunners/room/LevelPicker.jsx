// LevelPicker.jsx — die Level-Auswahl in der Lobby: Favoriten (Community- und Zufallslevel), alle Community-Level (sortierbar,
// durchsuchbar, auch nach Share-Code), die bestbewerteten Zufallslevel, die eigenen letzten Runden (rundenVerlauf.js) und das
// Tagesarchiv (ui/tagesArchiv.js), dazu ein eigener Seed (30.09.2026, ersetzt den früheren Seed-Reiter im Rundenplan). Ein Klick auf „In Runde“ legt das Level in die
// nächste freie Runde des Plans (Lobby.jsx entscheidet, welche).
//
// Aus einem Level wird ein Playlist-Eintrag für den Server (Backend/seedRunners/roomManager.js):
//   Community-Level  → { kind: 'custom', code }
//   Zufallslevel     → { kind: 'seed', seed, biome }   (Pfad-Generator, lang, „super“ — wie jede Zufallsrunde)
import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Plus, Search, Shuffle } from "lucide-react";
import { getFavorites, getTopRandom, listLevels } from "../levels/levelsApi.js";
import LevelPreview from "../levels/LevelPreview.jsx";
import { BIOMES } from "../gen/biomes.js";
import { formatTicks } from "./format.js";
import { Tabs, RatingBadge, Spinner, Empty } from "../ui/kit.jsx";
import { pickOf, refKey } from "../ui/levelRef.js";
import { useFavoriten } from "../ui/useFavoriten.js";
import { getVerlauf, subscribeVerlauf } from "./rundenVerlauf.js";
import { archivTage, tagesRef, germanDate } from "../ui/tagesArchiv.js";
import { GEN_VERSION } from "../gen/generator.js";

const ARCHIV_IN_LOBBY = 30;
const PAGE = 12;
const COMMUNITY_SORTS = [
  { id: "rated", label: "Bestbewertet" },
  { id: "popular", label: "Beliebt" },
  { id: "new", label: "Neu" },
  { id: "hardest", label: "Am schwersten" },
  { id: "random", label: "Zufällig" },
];
const FAV_SORTS = [
  { id: "recent", label: "Zuletzt gemerkt" },
  { id: "rating", label: "Beste Bewertung" },
  { id: "mine", label: "Meine Sterne" },
];

/** Kleine Vorschau: das Raster eines Community-Levels oder für ein Zufallslevel ein Block in den Biom-Farben */
function Thumb({ item }) {
  const l = item.level || (item.code ? item : null);
  if (l?.preview) return <LevelPreview preview={l.preview} biome={l.biome} className="w-24 aspect-[3/1] shrink-0 rounded-[2px]" />;
  const pal = (BIOMES[item.ref?.biome] || BIOMES.meadow).palette;
  return (
    <span className="w-24 aspect-[3/1] shrink-0 rounded-[2px] flex items-end overflow-hidden" style={{ background: pal.bg }} aria-hidden="true">
      <span className="w-full h-1/3 flex items-center justify-center" style={{ background: pal.tile, borderTop: `3px solid ${pal.tileTop}` }}>
        <Shuffle size={12} style={{ color: pal.accent }} />
      </span>
    </span>
  );
}

function Row({ item, onPick, disabled, pickText }) {
  const { label } = pickOf(item);
  const l = item.level || (item.code ? item : null);
  const rating = item.rating || l?.rating;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold sr-ink truncate leading-tight" title={label.title}>{label.title}</p>
        <p className="text-xs sr-faint truncate">{label.sub}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <RatingBadge rating={rating} />
          {l?.creatorTicks ? <span className="sr-num text-xs sr-faint" title="Zeit des Erstellers">{formatTicks(l.creatorTicks)}</span> : null}
          {item.mine ? <span className="text-xs sr-faint" title="Deine Bewertung">du: {item.mine}★</span> : null}
        </div>
      </div>
      <button type="button" onClick={() => onPick(item)} disabled={disabled} className="sr-btn sr-btn-sm sr-btn-ghost shrink-0" title="In die nächste freie Runde legen">
        <Plus size={14} />{pickText}
      </button>
    </li>
  );
}

/**
 * @param onPick    (entry, label) => void
 * @param disabled  nur der Host wählt
 * @param pickText  Beschriftung des Knopfs, z. B. „Runde 2“
 */
export default function LevelPicker({ onPick, disabled = false, pickText = "In Runde" }) {
  const [tab, setTab] = useState(null);
  const [favs, setFavs] = useState({ status: "loading", items: [] });
  const [favSort, setFavSort] = useState("recent");
  const [favKind, setFavKind] = useState("all");
  const [community, setCommunity] = useState({ status: "idle", items: [], page: 0, pages: 1 });
  const [sort, setSort] = useState("rated");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [seedQ, setSeedQ] = useState("");
  const [top, setTop] = useState({ status: "idle", items: [] });
  const verlauf = useSyncExternalStore(subscribeVerlauf, getVerlauf, getVerlauf);

  // Verlauf und Tagesarchiv: Einträge im Format der Favoritenliste ({ key, ref, info, title }); dasselbe Level zweimal gespielt
  // steht nur einmal da. Die Sterne dazu erst, wenn der Reiter offen ist.
  const verlaufItems = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const e of verlauf) {
      const key = refKey(e.ref);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e.ref.kind === "custom"
        ? { key, ref: e.ref, code: e.ref.code, name: e.custom?.name || e.ref.code, creator: { name: e.custom?.creatorName || "?" } }
        : { key, ref: e.ref, info: e.info, ...(e.daily ? { title: "Tages-Level" } : {}) });
    }
    return out;
  }, [verlauf]);
  const archivItems = useMemo(
    () => archivTage().slice(0, ARCHIV_IN_LOBBY).map((tag) => ({ key: `d:${tag}`, ref: tagesRef(tag), title: `Tagesrennen vom ${germanDate(tag)}` })),
    [],
  );
  // Eigener Seed: dasselbe Zufallslevel, das eine Zufallsrunde mit diesem Seed bekäme (Biom würfelt der Seed, aktuelle Version)
  const seed = seedQ.trim().slice(0, 40);
  const seedItems = useMemo(
    () => (seed ? [{ key: `s:${seed}`, ref: { kind: "pfad", seed, biome: "random", gv: GEN_VERSION }, title: "Eigener Seed" }] : []),
    [seed],
  );
  const bewertet = useMemo(
    () => (tab === "verlauf" ? verlaufItems : tab === "archiv" ? archivItems : tab === "seed" ? seedItems : []),
    [tab, verlaufItems, archivItems, seedItems],
  );
  const { status: sterne } = useFavoriten(useMemo(() => bewertet.map((it) => it.ref), [bewertet]));
  const mitSternen = (items) => items.map((it) => ({ ...it, rating: sterne.get(refKey(it.ref))?.rating }));

  // Favoriten zuerst laden: Wer welche hat, sieht sie sofort (sonst die Community-Level)
  useEffect(() => {
    let alive = true;
    getFavorites()
      .then((items) => { if (alive) { setFavs({ status: "ok", items }); setTab((t) => t || (items.length ? "fav" : "community")); } })
      .catch(() => { if (alive) { setFavs({ status: "error", items: [] }); setTab((t) => t || "community"); } });
    return () => { alive = false; };
  }, []);

  // Community-Level: neu laden bei anderer Sortierung/Suche
  useEffect(() => {
    if (tab !== "community") return undefined;
    let alive = true;
    setCommunity({ status: "loading", items: [], page: 0, pages: 1 });
    listLevels({ sort, q: query, page: 1, limit: PAGE })
      .then((r) => { if (alive) setCommunity({ status: "ok", items: r.items, page: r.page, pages: r.pages }); })
      .catch(() => { if (alive) setCommunity({ status: "error", items: [], page: 0, pages: 1 }); });
    return () => { alive = false; };
  }, [tab, sort, query]);

  useEffect(() => {
    if (tab !== "top" || top.status !== "idle") return;
    setTop({ status: "loading", items: [] });
    getTopRandom(30).then((items) => setTop({ status: "ok", items })).catch(() => setTop({ status: "error", items: [] }));
  }, [tab, top.status]);

  // Suche erst nach einer kurzen Pause im Tippen
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const more = async () => {
    const next = community.page + 1;
    setCommunity((c) => ({ ...c, status: "more" }));
    try {
      const r = await listLevels({ sort, q: query, page: next, limit: PAGE });
      setCommunity((c) => ({ status: "ok", items: [...c.items, ...r.items], page: r.page, pages: r.pages }));
    } catch {
      setCommunity((c) => ({ ...c, status: "ok" }));
    }
  };

  const favItems = useMemo(() => {
    let list = favs.items;
    if (favKind !== "all") list = list.filter((f) => f.ref.kind === favKind);
    const avg = (f) => f.rating?.avg ?? 0;
    if (favSort === "rating") list = [...list].sort((a, b) => avg(b) - avg(a) || (b.rating?.count || 0) - (a.rating?.count || 0));
    if (favSort === "mine") list = [...list].sort((a, b) => (b.mine || 0) - (a.mine || 0));
    return list;
  }, [favs.items, favSort, favKind]);

  const pick = (item) => {
    const { entry, label } = pickOf(item);
    onPick(entry, label);
  };

  const rows = (items) => (
    <ul className="sr-rows">
      {items.map((it) => <Row key={it.key || it.code} item={it} onPick={pick} disabled={disabled} pickText={pickText} />)}
    </ul>
  );

  return (
    <div>
      <Tabs
        label="Level-Auswahl"
        value={tab || "fav"}
        onChange={setTab}
        tabs={[
          { id: "fav", label: `Favoriten${favs.items.length ? ` (${favs.items.length})` : ""}` },
          { id: "community", label: "Community" },
          { id: "top", label: "Beste Zufallslevel" },
          { id: "verlauf", label: "Verlauf" },
          { id: "archiv", label: "Tagesarchiv" },
          { id: "seed", label: "Seed" },
        ]}
      />

      {(tab || "fav") === "fav" && (
        <div className="pt-3">
          <div className="flex flex-wrap gap-2 mb-1">
            <select value={favKind} onChange={(e) => setFavKind(e.target.value)} className="sr-input !w-auto !py-1.5 text-sm" aria-label="Art">
              <option value="all">Alle</option>
              <option value="custom">Community-Level</option>
              <option value="pfad">Zufallslevel</option>
            </select>
            <select value={favSort} onChange={(e) => setFavSort(e.target.value)} className="sr-input !w-auto !py-1.5 text-sm" aria-label="Sortierung">
              {FAV_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {favs.status === "loading" && <div className="py-6 flex justify-center"><Spinner /></div>}
          {favs.status === "error" && <Empty>Favoriten konnten nicht geladen werden.</Empty>}
          {favs.status === "ok" && !favItems.length && (
            <Empty>{favs.items.length ? "Keine Favoriten dieser Art." : "Noch keine Favoriten. Nach jeder Runde kannst du ein Level mit „Merken“ hierher holen."}</Empty>
          )}
          {favItems.length > 0 && rows(favItems)}
        </div>
      )}

      {tab === "community" && (
        <div className="pt-3">
          <div className="flex flex-wrap gap-2 mb-1">
            <label className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 sr-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Ersteller, Tag oder Code" className="sr-input !py-1.5 !pl-8 text-sm" aria-label="Suchen" />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="sr-input !w-auto !py-1.5 text-sm" aria-label="Sortierung">
              {COMMUNITY_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {community.status === "loading" && <div className="py-6 flex justify-center"><Spinner /></div>}
          {community.status === "error" && <Empty>Level konnten nicht geladen werden.</Empty>}
          {community.status !== "loading" && community.status !== "error" && !community.items.length && <Empty>Keine Level gefunden.</Empty>}
          {community.items.length > 0 && rows(community.items)}
          {community.items.length > 0 && community.page < community.pages && (
            <div className="pt-2 flex justify-center">
              <button type="button" onClick={more} disabled={community.status === "more"} className="sr-btn sr-btn-sm sr-btn-quiet">
                {community.status === "more" ? <Spinner size={14} /> : null}Mehr laden
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "top" && (
        <div className="pt-3">
          {top.status === "loading" && <div className="py-6 flex justify-center"><Spinner /></div>}
          {top.status === "error" && <Empty>Konnte nicht geladen werden.</Empty>}
          {top.status === "ok" && !top.items.length && <Empty>Noch keine bewerteten Zufallslevel. Nach jeder Runde kann jeder Sterne vergeben.</Empty>}
          {top.items.length > 0 && rows(top.items)}
        </div>
      )}

      {tab === "verlauf" && (
        <div className="pt-3">
          {!verlaufItems.length && <Empty>Noch keine Runden in diesem Browser. Jedes gespielte Level landet hier.</Empty>}
          {verlaufItems.length > 0 && rows(mitSternen(verlaufItems))}
        </div>
      )}

      {tab === "seed" && (
        <div className="pt-3">
          <label className="relative block mb-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 sr-faint" />
            <input
              value={seedQ}
              onChange={(e) => setSeedQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && seedItems.length && !disabled) pick(seedItems[0]); }}
              maxLength={40}
              placeholder="Seed eingeben"
              className="sr-input !py-1.5 !pl-8 text-sm"
              aria-label="Seed"
            />
          </label>
          {seedItems.length > 0 ? rows(mitSternen(seedItems)) : <Empty>Derselbe Seed ergibt bei allen exakt dasselbe Level — auch an einem anderen Tag.</Empty>}
        </div>
      )}

      {tab === "archiv" && (
        <div className="pt-3">
          {!archivItems.length && <Empty>Noch keine vergangenen Tagesrennen.</Empty>}
          {archivItems.length > 0 && rows(mitSternen(archivItems))}
          {archivItems.length > 0 && <p className="text-xs sr-faint pt-2">In der Lobby zählen die Zeiten nicht für die Rangliste des Tages.</p>}
        </div>
      )}
    </div>
  );
}
