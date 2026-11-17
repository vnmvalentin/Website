// GiveawaysPage.jsx — Verlosungen des Kanals (/Giveaways), Deutsch und Englisch.
//
// Mitmachen geht hier (Twitch-Anmeldung), im Twitch-Chat mit einem Stichwort und im Discord per Knopf. Die Bedingungen
// prüft der Server (Backend/giveaways): Die Seite zeigt angemeldet je Bedingung, ob sie erfüllt ist und was fehlt.
// Der Betreiber legt Giveaways an, zieht im Stream (OBS-Overlay /overlay/giveaway), zieht einzelne Gewinner neu und
// wählt unter „Einstellungen“ den Discord-Kanal für die Beiträge.
import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  Gift, Users, Plus, Trash2, Trophy, Check, X, Clock, Settings, Link2, RefreshCw, Shuffle, MessageSquare, Globe, Radio,
} from "lucide-react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { socket, useFeedRoom } from "../../utils/socket";
import SEO from "../../components/SEO";
import { TwitchGlyph, DiscordGlyph } from "../../components/BrandGlyphs";
import { Page, PageHeader, Card, EmptyState, Button, Dialog, Tabs, Field, Input, Select, Segmented } from "../../components/ui";
import { isOwner } from "../../config/owner";
import { useLanguage } from "../../i18n/language";
import { GIVEAWAY_TEXTS, errorText, grundText } from "./giveawayTexts";
import * as api from "./giveawayApi";

const STREAMER_LOGIN = "vnmvalentin";

function formatDate(t, ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(t.locale, { dateStyle: "medium", timeStyle: "short" });
}

/** datetime-local-Wert (Ortszeit) für „jetzt + Minuten“. */
function localInput(msFromNow) {
  const d = new Date(Date.now() + msFromNow);
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function Chip({ icon: Icon, children, tone = "plain" }) {
  const tones = {
    plain: "bg-white/5 text-white/60",
    accent: "bg-accent/10 text-accent-soft",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs ${tones[tone]}`}>
      {Icon && <Icon size={13} />}
      {children}
    </span>
  );
}

/* ── Bedingungen eines Giveaways, angemeldet mit Stand ─────────────────── */

function Conditions({ g, t, check, onDiscordConnect }) {
  const list = [];
  if (g.bedingungen.follow) list.push({ id: "follow", label: t.cond.follow });
  if (g.bedingungen.discord) list.push({ id: "discord", label: t.cond.discord });
  if (g.bedingungen.streams > 0) list.push({ id: "streams", label: t.cond.streams(g.bedingungen.streams) });
  if (!list.length) return <p className="text-sm text-white/50">{t.condNone}</p>;
  const byId = new Map((check?.ergebnisse || []).map((e) => [e.id, e]));
  return (
    <ul className="space-y-1.5">
      {list.map((c) => {
        const e = byId.get(c.id);
        const ok = e ? e.ok : null;
        return (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 shrink-0 ${ok === true ? "text-emerald-400" : ok === false ? "text-red-400" : "text-white/30"}`}>
              {ok === true ? <Check size={15} /> : ok === false ? <X size={15} /> : <span className="block w-[15px] text-center">•</span>}
            </span>
            <span className="min-w-0">
              <span className="text-white/85">{c.label}</span>
              {e && c.id === "streams" && e.ok && <span className="text-white/45"> · {t.streamsCount(e.wert, e.noetig)}</span>}
              {e && !e.ok && (
                <span className="block text-xs text-white/55">
                  {grundText(t, e)}{" "}
                  {e.grund === "not_following" && (
                    <a href={`https://twitch.tv/${STREAMER_LOGIN}`} target="_blank" rel="noreferrer" className="text-accent-soft hover:text-white">{t.followLink}</a>
                  )}
                  {e.grund === "no_discord_link" && (
                    <button type="button" onClick={onDiscordConnect} className="text-accent-soft hover:text-white">{t.discordConnect}</button>
                  )}
                </span>
              )}
              {c.id === "streams" && <span className="block text-[11px] text-white/35">{t.streamsHint}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Laufendes Giveaway ─────────────────────────────────────────────────── */

function ActiveCard({ g, t, user, login, dabei, isAdmin, flash, onMine }) {
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const hasConds = g.bedingungen.follow || g.bedingungen.discord || g.bedingungen.streams > 0;
  const offen = g.zustand === "offen";

  const recheck = useCallback(() => {
    if (!user || !offen) return;
    api.checkGiveaway(g.id).then(setCheck).catch(() => setCheck(null));
  }, [user, offen, g.id]);
  useEffect(() => { if (hasConds) recheck(); }, [hasConds, recheck]);

  const toggle = async () => {
    if (!user) return login();
    setBusy(true);
    try {
      if (dabei) await api.leaveGiveaway(g.id);
      else await api.joinGiveaway(g.id, user);
      onMine();
    } catch (e) {
      if (e.code === "conditions" && e.ergebnisse) setCheck({ ok: false, ergebnisse: e.ergebnisse });
      flash(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const connectDiscord = () => {
    api.discordLinkUrl().then((url) => { window.location.href = url; }).catch((e) => flash(errorText(t, e)));
  };

  const adminDraw = async () => {
    if (!window.confirm(t.drawConfirm(g.title))) return;
    try { await api.drawGiveaway(g.id); onMine(); } catch (e) { flash(errorText(t, e)); }
  };
  const adminDelete = async () => {
    if (!window.confirm(t.deleteConfirm(g.title))) return;
    try { await api.deleteGiveaway(g.id); onMine(); } catch (e) { flash(errorText(t, e)); }
  };

  const blocked = !!user && !dabei && hasConds && check && !check.ok;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="hidden sm:flex shrink-0 w-12 h-12 rounded-lg bg-accent/10 border border-accent/25 items-center justify-center">
          <Gift className="text-accent-soft" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-white leading-tight">{g.title}</h3>
          {g.prize && (
            <p className="mt-1 text-sm text-white/70 flex items-center gap-1.5">
              <Trophy size={14} className="text-amber-400 shrink-0" />
              <span>{t.prize}: <span className="font-semibold text-white">{g.prize}</span></span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Chip icon={Users}>{t.entries(g.count)}</Chip>
            <Chip icon={Clock}>{offen ? t.endsAt(formatDate(t, g.endDate)) : t.endedAt(formatDate(t, g.endDate))}</Chip>
            {g.quantity > 1 && <Chip icon={Gift}>{t.winnersCount(g.quantity)}</Chip>}
            <Chip icon={Radio}>{g.ziehung === "stream" ? t.drawModeStream : t.drawModeAuto}</Chip>
          </div>
        </div>
        {isAdmin && (
          <Button variant="ghost" size="sm" icon={Trash2} onClick={adminDelete} title={t.deleteLabel} aria-label={t.deleteLabel} className="hover:!text-red-400 shrink-0" />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/45 mb-2">{t.waysTitle}</p>
          <ul className="space-y-1.5 text-sm text-white/80">
            <li className="flex items-center gap-2"><Globe size={14} className="text-white/45 shrink-0" />{t.wayWebsite}</li>
            {g.wege.chat && g.stichwort && (
              <li className="flex items-center gap-2"><MessageSquare size={14} className="text-white/45 shrink-0" />
                <span>{t.wayChat("")}<code className="px-1.5 py-0.5 rounded bg-white/10 text-white font-semibold">{g.stichwort}</code></span>
              </li>
            )}
            {g.wege.discord && <li className="flex items-center gap-2"><DiscordGlyph size={14} className="text-white/45 shrink-0" />{t.wayDiscord}</li>}
          </ul>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">{t.condTitle}</p>
            {user && offen && hasConds && (
              <button type="button" onClick={recheck} className="inline-flex items-center gap-1 text-[11px] text-white/45 hover:text-white">
                <RefreshCw size={11} /> {t.recheck}
              </button>
            )}
          </div>
          <Conditions g={g} t={t} check={user ? check : null} onDiscordConnect={connectDiscord} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-line">
        {offen ? (
          <>
            <Button onClick={toggle} disabled={busy || blocked}
              variant={!user ? "twitch" : dabei ? "secondary" : "primary"} icon={!user ? TwitchGlyph : dabei ? X : Gift}>
              {!user ? t.login : dabei ? t.leave : t.join}
            </Button>
            {dabei && <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400"><Check size={15} /> {t.joined}</span>}
            {blocked && <span className="text-sm text-red-300">{t.missing}</span>}
          </>
        ) : (
          <p className="text-sm text-amber-300 flex items-center gap-2"><Radio size={15} /> {t.waiting}</p>
        )}
        {isAdmin && (
          <Button variant="secondary" icon={Shuffle} onClick={adminDraw} className="ml-auto">{t.drawNow}</Button>
        )}
      </div>
    </Card>
  );
}

/* ── Vergangenes Giveaway ───────────────────────────────────────────────── */

function PastCard({ g, t, isAdmin, flash, onChanged }) {
  const redraw = async (i, name) => {
    if (!window.confirm(t.redrawConfirm(name))) return;
    try { await api.redrawWinner(g.id, i); onChanged(); } catch (e) { flash(errorText(t, e)); }
  };
  const adminDelete = async () => {
    if (!window.confirm(t.deleteConfirm(g.title))) return;
    try { await api.deleteGiveaway(g.id); onChanged(); } catch (e) { flash(errorText(t, e)); }
  };
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white/85">{g.title}</h3>
          <p className="text-xs text-white/45 mt-1">
            {t.endedAt(formatDate(t, g.drawnAt || g.endDate))} · {t.entries(g.count)}{g.prize ? ` · ${g.prize}` : ""}
          </p>
        </div>
        {isAdmin && (
          <Button variant="ghost" size="sm" icon={Trash2} onClick={adminDelete} title={t.deleteLabel} aria-label={t.deleteLabel} className="hover:!text-red-400 shrink-0" />
        )}
      </div>
      <div className="bg-black/20 rounded-lg p-3 border border-line">
        <p className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-2"><Trophy size={12} /> {t.winners}</p>
        {g.winners.length ? (
          <ul className="flex flex-wrap gap-2">
            {g.winners.map((w, i) => (
              <li key={`${w.name}-${i}`} className="inline-flex items-center gap-2 pl-1 pr-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-100 text-sm font-medium">
                {w.avatar ? <img src={w.avatar} alt="" className="w-6 h-6 rounded" /> : <span className="w-6 h-6 rounded bg-white/10 inline-flex items-center justify-center"><Trophy size={12} /></span>}
                {w.name}
                {isAdmin && (
                  <button type="button" onClick={() => redraw(i, w.name)} title={t.redraw} aria-label={`${t.redraw}: ${w.name}`}
                    className="ml-1 text-amber-200/60 hover:text-white"><Shuffle size={13} /></button>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-white/35">{t.noWinners}</p>}
      </div>
    </Card>
  );
}

/* ── Betreiber: anlegen ─────────────────────────────────────────────────── */

function CreateDialog({ t, onClose, flash, settings, onChanged }) {
  const [form, setForm] = useState({
    title: "", prize: "", quantity: 1, endDate: localInput(60 * 60 * 1000), ziehung: "stream",
    chat: true, stichwort: "!giveaway", discord: false, follow: false, discordCond: false, streams: 0,
  });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const hasChannel = !!settings?.discord?.channelId;
  const hasGuild = !!settings?.discord?.guildId;
  const followReady = settings ? !!settings.twitch?.follow : true;

  const save = async () => {
    setTried(true);
    if (!form.title.trim() || !form.endDate) return;
    setBusy(true);
    try {
      await api.createGiveaway({
        title: form.title,
        prize: form.prize,
        quantity: Number(form.quantity) || 1,
        endDate: new Date(form.endDate).getTime(),
        ziehung: form.ziehung,
        stichwort: form.stichwort,
        wege: { chat: form.chat, discord: form.discord && hasChannel },
        bedingungen: { follow: form.follow, discord: form.discordCond && hasGuild, streams: Number(form.streams) || 0 },
      });
      onChanged();
      onClose();
    } catch (e) {
      flash(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const check = (key, label, disabled = false, note = null) => (
    <label className={`flex items-start gap-3 p-2.5 rounded-lg border border-line ${disabled ? "opacity-50" : "cursor-pointer hover:bg-white/5"}`}>
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-violet-500 shrink-0" disabled={disabled}
        checked={!!form[key] && !disabled} onChange={(e) => set({ [key]: e.target.checked })} />
      <span className="text-sm min-w-0">
        <span className="block text-white">{label}</span>
        {note && <span className="block text-xs text-white/45">{note}</span>}
      </span>
    </label>
  );

  return (
    <Dialog open onClose={onClose} width="lg" kicker={t.createKicker} title={t.createTitle} dismissible={!busy}
      footer={<><Button variant="ghost" onClick={onClose}>{t.cancel}</Button><Button icon={Gift} onClick={save} disabled={busy}>{t.create}</Button></>}>
      <div className="space-y-4">
        <Field label={t.fTitle} error={tried && !form.title.trim() ? t.errTitle : undefined}>
          <Input placeholder={t.fTitlePh} maxLength={80} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label={t.fPrize}>
          <Input placeholder={t.fPrizePh} maxLength={120} value={form.prize} onChange={(e) => set({ prize: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.fQuantity}>
            <Input type="number" min="1" max="50" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} />
          </Field>
          <Field label={t.fEnd} error={tried && !form.endDate ? t.errEnd : undefined}>
            <Input type="datetime-local" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
        </div>
        <Field label={t.fDraw} hint={t.fDrawHint}>
          <Segmented label={t.fDraw} value={form.ziehung} onChange={(v) => set({ ziehung: v })}
            options={[{ value: "stream", label: t.fDrawStream }, { value: "auto", label: t.fDrawAuto }]} />
        </Field>

        <div>
          <p className="text-sm font-medium text-white/80 mb-2">{t.fWays}</p>
          <div className="grid gap-2">
            <div className="flex items-center gap-3 p-2.5 rounded-lg border border-line text-sm text-white/60"><Check size={15} className="text-emerald-400" /> {t.fWayWebsite}</div>
            {check("chat", t.fWayChat)}
            {form.chat && (
              <Field label={t.fKeyword}>
                <Input maxLength={25} value={form.stichwort} onChange={(e) => set({ stichwort: e.target.value })} />
              </Field>
            )}
            {check("discord", t.fWayDiscord, !hasChannel, !hasChannel ? t.fWayDiscordOff : null)}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-white/80 mb-2">{t.fConds}</p>
          <div className="grid gap-2">
            {check("follow", t.fCondFollow, false, !followReady ? t.fNeedsFollow : null)}
            {check("discordCond", t.fCondDiscord, !hasGuild, !hasGuild ? t.fNeedsGuild : null)}
            <Field label={t.fCondStreams} hint={t.fCondStreamsHint}>
              <Input type="number" min="0" max="20" value={form.streams} onChange={(e) => set({ streams: e.target.value })} />
            </Field>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ── Betreiber: Einstellungen ───────────────────────────────────────────── */

function SettingsDialog({ t, onClose, flash, onLoaded }) {
  const [data, setData] = useState(null);
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.giveawaySettings()
      .then((d) => { setData(d); setGuildId(d.discord.guildId || ""); setChannelId(d.discord.channelId || ""); })
      .catch((e) => flash(errorText(t, e)));
  }, [t, flash]);

  const save = async () => {
    setBusy(true);
    try {
      const d = await api.saveGiveawaySettings(guildId, channelId);
      setData(d);
      onLoaded(d);
      onClose();
    } catch (e) {
      flash(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const guild = data?.server?.find((s) => s.id === guildId) || null;
  const row = (label, ok) => (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-white/75">{label}</span>
      <span className={`inline-flex items-center gap-1 font-semibold ${ok ? "text-emerald-400" : "text-amber-300"}`}>
        {ok ? <Check size={14} /> : <X size={14} />} {ok ? t.stOk : t.stMissing}
      </span>
    </li>
  );

  return (
    <Dialog open onClose={onClose} width="md" kicker={t.setKicker} title={t.setTitle} dismissible={!busy}
      footer={<><Button variant="ghost" onClick={onClose}>{t.setClose}</Button><Button onClick={save} disabled={busy || !data}>{t.setSave}</Button></>}>
      {!data ? <p className="text-sm text-white/50">{t.loading}</p> : (
        <div className="space-y-5">
          <div className="space-y-3">
            <Field label={t.setDiscordServer}>
              <Select value={guildId} onChange={(e) => { setGuildId(e.target.value); setChannelId(""); }}>
                <option value="">{t.setNone}</option>
                {data.server.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t.setDiscordChannel} hint={t.setDiscordHint}>
              <Select value={channelId} disabled={!guild} onChange={(e) => setChannelId(e.target.value)}>
                <option value="">{t.setNone}</option>
                {(guild?.channels || []).map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <div>
            <p className="text-sm font-medium text-white/80 mb-1">{t.setStatus}</p>
            <ul className="divide-y divide-white/5">
              {row(t.stTwitch, data.twitch.verbunden)}
              {row(t.stFollow, data.twitch.follow)}
              {row(t.stChatters, data.twitch.chatters)}
              {row(t.stBot, data.twitch.botImKanal)}
              {row(t.stDiscord, data.discord.bereit)}
            </ul>
            <p className="text-xs text-white/45 mt-2">{t.stStreams(data.streams.gezaehlt)}</p>
            {(!data.twitch.follow || !data.twitch.chatters) && <p className="text-xs text-amber-200/80 mt-1">{t.stFix}</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ── Seite ──────────────────────────────────────────────────────────────── */

export default function GiveawaysPage() {
  // Vollpayload nur für diese Seite (siehe Backend/lib/liveBadges.js)
  useFeedRoom("giveaways");
  const { user, login } = useContext(TwitchAuthContext);
  const { lang } = useLanguage({ supported: GIVEAWAY_TEXTS.langs });
  const t = GIVEAWAY_TEXTS.dict(lang);
  const isAdmin = isOwner(user);

  const [data, setData] = useState({ active: [], expired: [] });
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("active");
  const [dialog, setDialog] = useState(null); // 'create' | 'settings'
  const [settings, setSettings] = useState(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const flash = useCallback((msg) => {
    setNote(msg);
    setTimeout(() => setNote(""), 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const d = await api.listGiveaways();
      setData({ active: d.active || [], expired: d.expired || [] });
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMine = useCallback(() => {
    if (!user) { setMine([]); return; }
    api.myGiveaways().then((d) => setMine(d.dabei || [])).catch(() => {});
  }, [user]);

  // Nach eigenen Aktionen selbst neu laden — ohne Live-Verbindung (Socket) bliebe die Seite sonst stehen
  const changed = useCallback(() => { refresh(); refreshMine(); }, [refresh, refreshMine]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshMine(); }, [refreshMine]);
  useEffect(() => {
    const onUpdate = (d) => {
      if (!d) return;
      setData({ active: d.active || [], expired: d.expired || [] });
      setLoadError(false);
      refreshMine();
    };
    socket.on("giveaways_update", onUpdate);
    return () => socket.off("giveaways_update", onUpdate);
  }, [refreshMine]);

  // Betreiber: Stand von Twitch/Discord für den Anlege-Dialog
  useEffect(() => {
    if (!isAdmin) return;
    api.giveawaySettings().then(setSettings).catch(() => {});
  }, [isAdmin]);

  const copyOverlay = () => {
    const url = `${window.location.origin}/overlay/giveaway`;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => flash(url));
  };

  const active = [...data.active].sort((a, b) => a.endDate - b.endDate);
  const past = [...data.expired].sort((a, b) => (b.drawnAt || b.endDate) - (a.drawnAt || a.endDate));

  return (
    <Page width="default" className="py-4 md:py-8 min-h-[70vh]">
      <SEO title={t.title} description={t.seoDescription} />
      <PageHeader
        icon={Gift}
        kicker={t.kicker}
        title={t.title}
        description={t.description}
        actions={isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" icon={copied ? Check : Link2} onClick={copyOverlay}>{copied ? t.copied : t.overlayLink}</Button>
            <Button variant="secondary" icon={Settings} onClick={() => setDialog("settings")}>{t.settings}</Button>
            <Button icon={Plus} onClick={() => setDialog("create")}>{t.newGiveaway}</Button>
          </div>
        )}
      />

      <Tabs className="mb-6" label={t.title} value={tab} onChange={setTab}
        items={[
          { value: "active", label: t.tabActive, badge: active.length },
          { value: "past", label: t.tabPast, badge: past.length },
        ]} />

      {note && <p role="status" className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{note}</p>}

      <div className="space-y-4">
        {loading ? (
          <p className="py-16 text-center text-white/40">{t.loading}</p>
        ) : loadError ? (
          <EmptyState action={<Button variant="secondary" onClick={refresh}>{t.retry}</Button>}>{t.loadError}</EmptyState>
        ) : tab === "active" ? (
          active.length === 0 ? <EmptyState>{t.emptyActive}</EmptyState> : active.map((g) => (
            <ActiveCard key={g.id} g={g} t={t} user={user} login={login} dabei={mine.includes(g.id)}
              isAdmin={isAdmin} flash={flash} onMine={changed} />
          ))
        ) : (
          past.length === 0 ? <EmptyState>{t.emptyPast}</EmptyState> : past.map((g) => (
            <PastCard key={g.id} g={g} t={t} isAdmin={isAdmin} flash={flash} onChanged={changed} />
          ))
        )}
      </div>

      {dialog === "create" && <CreateDialog t={t} onClose={() => setDialog(null)} flash={flash} settings={settings} onChanged={changed} />}
      {dialog === "settings" && <SettingsDialog t={t} onClose={() => setDialog(null)} flash={flash} onLoaded={setSettings} />}
    </Page>
  );
}
