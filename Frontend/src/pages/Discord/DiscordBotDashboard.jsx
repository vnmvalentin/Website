import React, { useState, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
    Settings, UserPlus, LogOut, Gamepad2, Tag, CheckSquare,
    Volume2, Users, Tv, Image, Globe, BarChart2,
    Radio, Ticket, Bot, ArrowRight, ArrowLeft, ChevronDown,
} from 'lucide-react';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

function DiscordGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
import SEO from '../../components/SEO';
import './discord.css';
import GeneralTab from './tabs/GeneralTab';
import WelcomeTab from './tabs/WelcomeTab';
import LeaveTab from './tabs/LeaveTab';
import FunCommandsTab from './tabs/FunCommandsTab';
import ReactionRolesTab from './tabs/ReactionRolesTab';
import ApprovalTab from './tabs/ApprovalTab';
import VoiceTab from './tabs/VoiceTab';
import AutoRolesTab from './tabs/AutoRolesTab';
import TwitchNotifTab from './tabs/TwitchNotifTab';
import ImageOnlyTab from './tabs/ImageOnlyTab';
import StatsTab from './tabs/StatsTab';
import SyncChatTab from './tabs/SyncChatTab';
import LiveRoleTab from './tabs/LiveRoleTab';
import TicketsTab from './tabs/TicketsTab';

function LegalLinks({ className = '' }) {
    return (
        <div className={`flex items-center gap-2.5 ${className}`}>
            <Link to="/discord-bot/privacy" className="text-white/30 hover:text-white/60 text-xs transition-colors">Datenschutz</Link>
            <span className="text-white/15 text-xs">·</span>
            <Link to="/discord-bot/terms" className="text-white/30 hover:text-white/60 text-xs transition-colors">Nutzungsbedingungen</Link>
        </div>
    );
}

const GROUPS = [
    {
        label: 'Server',
        tabs: [
            { id: 'general',      label: 'Allgemein',      icon: <Settings size={15} /> },
            { id: 'stats',        label: 'Statistiken',    icon: <BarChart2 size={15} /> },
        ],
    },
    {
        label: 'Mitglieder',
        tabs: [
            { id: 'welcome',      label: 'Eintritt',       icon: <UserPlus size={15} /> },
            { id: 'leave',        label: 'Austritt',       icon: <LogOut size={15} /> },
        ],
    },
    {
        label: 'Rollen',
        tabs: [
            { id: 'reactionroles',label: 'Rollen-Buttons', icon: <Tag size={15} /> },
            { id: 'approval',     label: 'Genehmigung',    icon: <CheckSquare size={15} /> },
            { id: 'autoroles',    label: 'Auto Roles',     icon: <Users size={15} /> },
            { id: 'liverole',     label: 'Live Rolle',     icon: <Radio size={15} /> },
        ],
    },
    {
        label: 'Kanäle',
        tabs: [
            { id: 'voice',        label: 'Voice Channels', icon: <Volume2 size={15} /> },
            { id: 'imageonly',    label: 'Image Only',     icon: <Image size={15} /> },
            { id: 'syncchat',     label: 'Taverne',        icon: <Globe size={15} /> },
        ],
    },
    {
        label: 'Features',
        tabs: [
            { id: 'funcommands',  label: 'Fun Commands',   icon: <Gamepad2 size={15} /> },
            { id: 'twitchnotif',  label: 'Twitch Notif.',  icon: <Tv size={15} /> },
            { id: 'tickets',      label: 'Tickets',        icon: <Ticket size={15} /> },
        ],
    },
];

const ALL_TABS = GROUPS.flatMap(g => g.tabs);

export default function DiscordBotDashboard() {
    const { user, login } = useContext(TwitchAuthContext);

    const [isDiscordLoggedIn, setIsDiscordLoggedIn] = useState(false);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedServer, setSelectedServer] = useState(null);
    const [activeTab, setActiveTab] = useState('general');
    const [loginUrl, setLoginUrl] = useState('');
    // Störung beim Laden der Server (Discord gedrosselt/nicht erreichbar) — KEIN „abgemeldet“
    const [discordDown, setDiscordDown] = useState('');
    const [switcherOpen, setSwitcherOpen] = useState(false);

    // Shared data fetched per server
    const [channels, setChannels] = useState([]);
    const [voiceChannels, setVoiceChannels] = useState([]);
    const [serverRoles, setServerRoles] = useState([]);
    const [serverEmojis, setServerEmojis] = useState([]);

    // Shared settings state (saved via handleSaveSettings)
    const [prefix, setPrefix] = useState('!');
    const [botNickname, setBotNickname] = useState('');
    const [welcomeChannel, setWelcomeChannel] = useState('');
    const [welcomeMessage, setWelcomeMessage] = useState('Willkommen [USER] auf [SERVER]! Du bist unser Mitglied #[MEMBER]');
    const [leaveChannel, setLeaveChannel] = useState('');
    const [leaveMessage, setLeaveMessage] = useState('Schade, [USER] hat [SERVER] verlassen. Noch [MEMBER] Mitglieder übrig.');
    const [funChannel, setFunChannel] = useState('');
    const [welcomeStyle, setWelcomeStyle] = useState('text');
    const [leaveStyle, setLeaveStyle] = useState('text');
    // Layout des gezeichneten Bilds (nur bei Darstellung 'image')
    const [welcomeImageLayout, setWelcomeImageLayout] = useState('classic');
    const [leaveImageLayout, setLeaveImageLayout] = useState('classic');
    const [disabledCommands, setDisabledCommands] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    // Zuletzt gespeicherter Stand der gemeinsamen Einstellungen (Allgemein,
    // Eintritt, Austritt, Fun Commands). Der Unterschied dazu ist "ungespeichert".
    const [saved, setSaved] = useState(null);
    // Unterseiten mit eigenem Speichern (Voice) melden ihren Stand hierher
    const [tabDirty, setTabDirty] = useState(false);
    // Welche Bereiche eingerichtet sind — für die Punkte in der Bereichsliste
    const [overview, setOverview] = useState({});

    const current = {
        prefix, botNickname, welcomeChannel, welcomeMessage, welcomeStyle, welcomeImageLayout,
        leaveChannel, leaveMessage, leaveStyle, leaveImageLayout, funChannel, disabledCommands,
    };
    const currentJson = JSON.stringify(current);
    const sharedDirty = !!saved && currentJson !== JSON.stringify(saved);
    const dirty = sharedDirty || tabDirty;

    const applySettings = (d) => {
        setPrefix(d.prefix); setBotNickname(d.botNickname);
        setWelcomeChannel(d.welcomeChannel); setWelcomeMessage(d.welcomeMessage); setWelcomeStyle(d.welcomeStyle); setWelcomeImageLayout(d.welcomeImageLayout);
        setLeaveChannel(d.leaveChannel); setLeaveMessage(d.leaveMessage); setLeaveStyle(d.leaveStyle); setLeaveImageLayout(d.leaveImageLayout);
        setFunChannel(d.funChannel); setDisabledCommands(d.disabledCommands);
    };

    const loadOverview = (serverId) => {
        fetch(`/api/discord/settings/${serverId}/overview`).then(r => r.json()).then(d => setOverview(d || {})).catch(() => {});
    };

    /** Vor dem Verlassen eines Bereichs: offene Änderungen bestätigen lassen und verwerfen. */
    const leaveGuard = (go) => {
        if (dirty && !window.confirm('Du hast ungespeicherte Änderungen. Verwerfen und weitergehen?')) return;
        if (sharedDirty) applySettings(saved);
        setTabDirty(false);
        go();
    };
    const switchTab = (id) => { if (id !== activeTab) leaveGuard(() => setActiveTab(id)); };
    const switchServer = (server) => leaveGuard(() => { setSelectedServer(server); setSwitcherOpen(false); });

    // Auch beim Schließen oder Neuladen des Fensters warnen
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    // Punkte auffrischen, wenn man den Bereich wechselt — dort wurde evtl. etwas eingerichtet
    const serverId = selectedServer?.id;
    useEffect(() => {
        if (serverId) loadOverview(serverId);
    }, [serverId, activeTab]);

    useEffect(() => {
        if (!user) { setLoading(false); return; }
        let alive = true;
        let retry = 0;
        const load = () => {
            fetch('/api/discord/guilds')
                .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }))
                .then(({ status, data }) => {
                    if (!alive) return;
                    if (data.guilds) {
                        setServers(data.guilds);
                        setIsDiscordLoggedIn(true);
                        setDiscordDown('');
                    } else if (status === 401) {
                        // Nur das heißt wirklich „nicht verknüpft“
                        fetch('/api/discord/login-url').then(r => r.json()).then(d => { if (alive) setLoginUrl(d.url); });
                        setIsDiscordLoggedIn(false);
                        setDiscordDown('');
                    } else {
                        // Discord oder das Backend antwortet gerade nicht: nicht zur Anmeldung schicken,
                        // sondern melden und von selbst noch einmal versuchen
                        setDiscordDown(data.error || 'Discord antwortet gerade nicht.');
                        retry = setTimeout(load, 8000);
                    }
                })
                .catch(() => {
                    if (!alive) return;
                    setDiscordDown('Keine Verbindung zum Server.');
                    retry = setTimeout(load, 8000);
                })
                .finally(() => { if (alive) setLoading(false); });
        };
        load();
        return () => { alive = false; clearTimeout(retry); };
    }, [user]);

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/guilds/${selectedServer.id}/channels?type=0`).then(r => r.json()).then(d => setChannels(d.channels || []));
        fetch(`/api/discord/guilds/${selectedServer.id}/channels?type=2`).then(r => r.json()).then(d => setVoiceChannels(d.channels || []));
        fetch(`/api/discord/guilds/${selectedServer.id}/roles`).then(r => r.json()).then(d => setServerRoles(d.roles || []));
        fetch(`/api/discord/guilds/${selectedServer.id}/emojis`).then(r => r.json()).then(d => setServerEmojis(d.emojis || []));
        fetch(`/api/discord/settings/${selectedServer.id}`).then(r => r.json()).then(d => {
            const loaded = {
                prefix: d.prefix || '!',
                botNickname: d.botNickname || '',
                welcomeChannel: d.welcomeChannel || '',
                welcomeMessage: d.welcomeMessage || 'Willkommen [USER] auf [SERVER]! Du bist unser Mitglied #[MEMBER]',
                welcomeStyle: ['card', 'image'].includes(d.welcomeStyle) ? d.welcomeStyle : 'text',
                welcomeImageLayout: d.welcomeImageLayout || 'classic',
                leaveChannel: d.leaveChannel || '',
                leaveMessage: d.leaveMessage || 'Schade, [USER] hat [SERVER] verlassen. Noch [MEMBER] Mitglieder übrig.',
                leaveStyle: ['card', 'image'].includes(d.leaveStyle) ? d.leaveStyle : 'text',
                leaveImageLayout: d.leaveImageLayout || 'classic',
                funChannel: d.funChannel || '',
                disabledCommands: d.disabledCommands || [],
            };
            applySettings(loaded);
            setSaved(loaded);
        });
        setSaved(null);
        setTabDirty(false);
        setOverview({});
        setActiveTab('general');
    }, [selectedServer]);

    const handleSaveSettings = async () => {
        setIsSaving(true);
        setSaveStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: currentJson,
            });
            setSaveStatus(res.ok ? 'Gespeichert!' : 'Fehler.');
            if (res.ok) {
                setSaved(current);
                loadOverview(selectedServer.id);
            }
        } catch {
            setSaveStatus('Netzwerkfehler.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    const seo = (title, description) => <SEO title={title} description={description} path="/discord-bot" />;

    /* ── Vor der Anmeldung: bleibt im normalen Layout der Website ───────────────
       Diese Fassungen sehen Besucher und Suchmaschinen. */
    if (!user) return (
        <div className="page-fade h-full flex items-center justify-center p-6">
            {seo('Discord Bot', 'Verwalte deinen Discord Bot.')}
            <div className="dc-root dc-card p-8 max-w-sm w-full flex flex-col items-center gap-5 text-center">
                <Bot size={26} className="text-white/60" />
                <div>
                    <h1 className="text-xl font-bold text-white mb-1.5">Discord-Bot</h1>
                    <p className="text-sm text-white/50">Melde dich mit Twitch an, um den Bot zu verwalten.</p>
                </div>
                <button onClick={() => login(false)} className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-5 h-10 rounded-md text-sm font-semibold transition-colors">
                    <TwitchGlyph className="w-4 h-4" /> Mit Twitch anmelden
                </button>
                <LegalLinks />
            </div>
        </div>
    );
    if (loading) return (
        <div className="page-fade h-full flex items-center justify-center">
            {seo('Discord Bot', 'Verwalte deinen Discord Bot.')}
            <p className="text-white/40 font-medium text-sm">Lade Dashboard…</p>
        </div>
    );

    if (!isDiscordLoggedIn && discordDown) return (
        <div className="page-fade h-full flex items-center justify-center p-6">
            {seo('Discord Bot', 'Verwalte deinen Discord Bot.')}
            <div className="dc-root dc-card p-8 max-w-sm w-full flex flex-col items-center gap-3 text-center">
                <DiscordGlyph className="w-7 h-7 text-[#7984f5]" />
                <h1 className="text-xl font-bold text-white">Discord antwortet gerade nicht</h1>
                <p className="text-sm text-white/50">{discordDown} Deine Verknüpfung bleibt bestehen — die Seite versucht es von selbst erneut.</p>
            </div>
        </div>
    );

    if (!isDiscordLoggedIn) return (
        <div className="page-fade h-full flex items-center justify-center p-6">
            {seo('Discord Bot', 'Verwalte deinen Discord Bot.')}
            <div className="dc-root dc-card p-8 max-w-sm w-full flex flex-col items-center gap-5 text-center">
                <DiscordGlyph className="w-7 h-7 text-[#7984f5]" />
                <div>
                    <h1 className="text-xl font-bold text-white mb-1.5">Discord verknüpfen</h1>
                    <p className="text-sm text-white/50">Verbinde deinen Discord-Account, um deine Server zu verwalten.</p>
                </div>
                <a href={loginUrl} className="dc-btn !min-h-[40px] !px-5">
                    <DiscordGlyph className="w-4 h-4" /> Mit Discord anmelden
                </a>
                <LegalLinks />
            </div>
        </div>
    );

    const serverIcon = (server, size) => (
        <span className="shrink-0 rounded-md overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center text-white/50 font-bold"
            style={{ width: size, height: size, fontSize: size * 0.42 }}>
            {server.icon
                ? <img src={server.icon} className="w-full h-full object-cover" alt="" />
                : server.name.charAt(0)}
        </span>
    );

    const activeItem = ALL_TABS.find(t => t.id === activeTab) || ALL_TABS[0];
    const managed = servers.filter(s => s.botPresent);
    const inviteable = servers.filter(s => !s.botPresent);

    // Ab hier eine eigene Oberfläche über das ganze Fenster — ohne die Kopfzeile
    // der Website. Als Portal, weil der Inhaltsbereich des Layouts einen eigenen
    // Stapelkontext hat und die Kopfzeile sonst darüber läge.
    return createPortal(
        <div className="dc-root fixed inset-0 z-[200] flex flex-col">
            {seo(
                selectedServer ? `${selectedServer.name} – Discord Bot` : 'Discord Bot',
                selectedServer ? `Discord Bot Dashboard für den Server ${selectedServer.name}.` : 'Wähle einen Server aus um deinen Discord Bot zu verwalten.',
            )}

            {/* ══════════ Kopfleiste ══════════ */}
            <header className="relative z-30 shrink-0 h-12 flex items-center gap-2 px-3 border-b border-[var(--dc-line)] bg-[var(--dc-rail)]">
                <Link to="/tools" title="Zurück zur Website"
                    className="w-8 h-8 inline-flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                    <ArrowLeft size={16} />
                </Link>
                <DiscordGlyph className="w-4 h-4 text-[#7984f5] shrink-0" />
                <h1 className="text-[14px] font-bold text-white whitespace-nowrap">Discord-Bot</h1>

                {selectedServer && (
                    <div className="relative ml-2 min-w-0">
                        <button type="button" onClick={() => setSwitcherOpen(v => !v)} aria-expanded={switcherOpen}
                            className="h-8 pl-1.5 pr-2 inline-flex items-center gap-2 rounded-md border border-white/10 hover:border-white/25 text-[13px] font-semibold text-white max-w-[52vw] transition-colors">
                            {serverIcon(selectedServer, 22)}
                            <span className="truncate">{selectedServer.name}</span>
                            <ChevronDown size={13} className="text-white/40 shrink-0" />
                        </button>
                        {switcherOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setSwitcherOpen(false)} />
                                <div className="absolute left-0 top-full mt-1.5 z-20 w-72 max-w-[calc(100vw-16px)] max-h-[70dvh] overflow-y-auto custom-scrollbar rounded-md border border-white/10 bg-[#14151f] shadow-xl py-1">
                                    {managed.map(server => (
                                        <button key={server.id} type="button"
                                            onClick={() => switchServer(server)}
                                            className={`w-full flex items-center gap-2.5 px-2.5 h-10 text-left text-[13px] font-semibold transition-colors ${
                                                server.id === selectedServer.id ? 'bg-[#5865f2]/20 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                                            }`}>
                                            {serverIcon(server, 24)}
                                            <span className="truncate">{server.name}</span>
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => switchServer(null)}
                                        className="w-full px-3 h-9 mt-1 border-t border-white/10 text-left text-[12px] font-semibold text-white/50 hover:text-white transition-colors">
                                        Alle Server anzeigen
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {dirty && selectedServer && <span className="dc-unsaved ml-3 hidden md:inline-flex">Ungespeichert</span>}
                <LegalLinks className="ml-auto hidden sm:flex" />
            </header>

            {/* ══════════ Serverauswahl ══════════ */}
            {!selectedServer && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-8">
                    <div className="max-w-2xl mx-auto">
                        <h2 className="dc-h2">Deine Server</h2>
                        <p>Wähle den Server, den du einrichten möchtest.</p>

                        {[['Mit Bot', managed], ['Bot noch nicht eingeladen', inviteable]].map(([title, list]) => list.length > 0 && (
                            <section key={title} className="mt-6">
                                <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-white/40 mb-2">{title}</h3>
                                <div className="dc-card divide-y divide-white/[0.07]">
                                    {list.map(server => (
                                        <div key={server.id} className="flex items-center gap-3 p-2.5 pl-3">
                                            {serverIcon(server, 36)}
                                            <span className="flex-1 min-w-0 truncate text-[14px] font-semibold text-white">{server.name}</span>
                                            {server.botPresent ? (
                                                <button onClick={() => setSelectedServer(server)} className="dc-btn">
                                                    Einrichten <ArrowRight size={14} />
                                                </button>
                                            ) : (
                                                <a href={server.inviteUrl} target="_blank" rel="noopener noreferrer"
                                                    className="h-9 px-4 inline-flex items-center rounded-md border border-white/10 hover:border-white/25 text-[13px] font-bold text-white/80 hover:text-white transition-colors">
                                                    Bot einladen
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                        {servers.length === 0 && <p className="mt-6">Auf keinem deiner Server hast du Verwaltungsrechte.</p>}
                    </div>
                </div>
            )}

            {/* ══════════ Dashboard: Bereiche links, Unterseite rechts ══════════ */}
            {selectedServer && (
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                    {/* Schmale Fenster: Auswahl als Feld statt als Leiste */}
                    <div className="lg:hidden shrink-0 p-3 border-b border-[var(--dc-line)] bg-[var(--dc-rail)]">
                        <select value={activeTab} onChange={e => switchTab(e.target.value)} className="dc-input w-full" aria-label="Bereich">
                            {GROUPS.map(group => (
                                <optgroup key={group.label} label={group.label}>
                                    {group.tabs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    <nav className="hidden lg:block w-[212px] shrink-0 overflow-y-auto custom-scrollbar border-r border-[var(--dc-line)] bg-[var(--dc-rail)] pb-3">
                        {GROUPS.map(group => (
                            <section key={group.label}>
                                <p className="text-[10.5px] font-bold uppercase tracking-wider text-white/35 px-3.5 pt-3.5 pb-1.5">{group.label}</p>
                                {group.tabs.map(item => {
                                    const isActive = activeTab === item.id;
                                    return (
                                        <button key={item.id} type="button" onClick={() => switchTab(item.id)} aria-pressed={isActive}
                                            className={`relative w-full flex items-center gap-2.5 h-9 pl-3.5 pr-3 text-left text-[13px] font-semibold transition-colors ${
                                                isActive ? 'bg-[#5865f2]/[0.16] text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
                                            }`}>
                                            <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-[2px] ${isActive ? 'bg-[#5865f2]' : 'bg-transparent'}`} />
                                            <span className={`shrink-0 ${isActive ? 'text-[#8f98f8]' : 'text-white/35'}`}>{item.icon}</span>
                                            <span className="truncate">{item.label}</span>
                                            {/* Nur Bereiche, die man ein- und ausschalten kann, haben einen Punkt */}
                                            {item.id in overview && (
                                                <span className={`dc-dot${overview[item.id] ? ' is-on' : ''}`}
                                                    title={overview[item.id] ? 'Eingerichtet' : 'Noch nicht eingerichtet'} />
                                            )}
                                        </button>
                                    );
                                })}
                            </section>
                        ))}
                    </nav>

                    {/* Nur dieser Bereich blättert */}
                    <main key={activeItem.id} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6">
                    {activeTab === 'general' && (
                        <GeneralTab
                            prefix={prefix} setPrefix={setPrefix}
                            botNickname={botNickname} setBotNickname={setBotNickname}
                            isSaving={isSaving} saveStatus={saveStatus}
                            handleSaveSettings={handleSaveSettings}
                            dirty={sharedDirty}
                        />
                    )}
                    {activeTab === 'welcome' && (
                        <WelcomeTab
                            welcomeChannel={welcomeChannel} setWelcomeChannel={setWelcomeChannel}
                            welcomeMessage={welcomeMessage} setWelcomeMessage={setWelcomeMessage}
                            welcomeStyle={welcomeStyle} setWelcomeStyle={setWelcomeStyle}
                            imageLayout={welcomeImageLayout} setImageLayout={setWelcomeImageLayout}
                            serverName={selectedServer.name} serverId={selectedServer.id} botName={botNickname} dirty={sharedDirty} serverEmojis={serverEmojis}
                            channels={channels}
                            isSaving={isSaving} saveStatus={saveStatus}
                            handleSaveSettings={handleSaveSettings}
                        />
                    )}
                    {activeTab === 'leave' && (
                        <LeaveTab
                            leaveChannel={leaveChannel} setLeaveChannel={setLeaveChannel}
                            leaveMessage={leaveMessage} setLeaveMessage={setLeaveMessage}
                            leaveStyle={leaveStyle} setLeaveStyle={setLeaveStyle}
                            imageLayout={leaveImageLayout} setImageLayout={setLeaveImageLayout}
                            serverName={selectedServer.name} serverId={selectedServer.id} botName={botNickname} dirty={sharedDirty} serverEmojis={serverEmojis}
                            channels={channels}
                            isSaving={isSaving} saveStatus={saveStatus}
                            handleSaveSettings={handleSaveSettings}
                        />
                    )}
                    {activeTab === 'funcommands' && (
                        <FunCommandsTab
                            funChannel={funChannel} setFunChannel={setFunChannel}
                            channels={channels}
                            isSaving={isSaving} saveStatus={saveStatus}
                            handleSaveSettings={handleSaveSettings}
                            disabledCommands={disabledCommands}
                            setDisabledCommands={setDisabledCommands}
                            dirty={sharedDirty}
                        />
                    )}
                    {activeTab === 'reactionroles' && (
                        <ReactionRolesTab
                            selectedServer={selectedServer}
                            channels={channels}
                            serverRoles={serverRoles}
                            serverEmojis={serverEmojis}
                            botNickname={botNickname}
                        />
                    )}
                    {activeTab === 'approval' && (
                        <ApprovalTab
                            selectedServer={selectedServer}
                            channels={channels}
                            serverRoles={serverRoles}
                            serverEmojis={serverEmojis}
                        />
                    )}
                    {activeTab === 'voice' && (
                        <VoiceTab
                            selectedServer={selectedServer}
                            voiceChannels={voiceChannels}
                            onDirty={setTabDirty}
                        />
                    )}
                    {activeTab === 'autoroles' && (
                        <AutoRolesTab
                            selectedServer={selectedServer}
                            serverRoles={serverRoles}
                        />
                    )}
                    {activeTab === 'twitchnotif' && (
                        <TwitchNotifTab
                            selectedServer={selectedServer}
                            channels={channels}
                            serverRoles={serverRoles}
                        />
                    )}
                    {activeTab === 'imageonly' && (
                        <ImageOnlyTab
                            selectedServer={selectedServer}
                            channels={channels}
                        />
                    )}
                    {activeTab === 'syncchat' && (
                        <SyncChatTab
                            selectedServer={selectedServer}
                            channels={channels}
                        />
                    )}
                    {activeTab === 'stats' && (
                        <StatsTab
                            selectedServer={selectedServer}
                        />
                    )}
                    {activeTab === 'liverole' && (
                        <LiveRoleTab
                            selectedServer={selectedServer}
                            serverRoles={serverRoles}
                        />
                    )}
                    {activeTab === 'tickets' && (
                        <TicketsTab
                            selectedServer={selectedServer}
                            channels={channels}
                            serverRoles={serverRoles}
                        />
                    )}
                    </main>
                </div>
            )}
        </div>,
        document.body,
    );
}

