import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import {
    Settings, UserPlus, LogOut, Gamepad2, Tag, CheckSquare,
    Volume2, Users, Tv, Image, Globe, BarChart2, ChevronLeft,
    Radio, Ticket, Bot, ArrowRight,
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
            { id: 'general',      label: 'Allgemein',      icon: <Settings size={16} /> },
            { id: 'stats',        label: 'Statistiken',    icon: <BarChart2 size={16} /> },
        ],
    },
    {
        label: 'Mitglieder',
        tabs: [
            { id: 'welcome',      label: 'Eintritt',       icon: <UserPlus size={16} /> },
            { id: 'leave',        label: 'Austritt',       icon: <LogOut size={16} /> },
        ],
    },
    {
        label: 'Rollen',
        tabs: [
            { id: 'reactionroles',label: 'Rollen-Buttons', icon: <Tag size={16} /> },
            { id: 'approval',     label: 'Genehmigung',    icon: <CheckSquare size={16} /> },
            { id: 'autoroles',    label: 'Auto Roles',     icon: <Users size={16} /> },
            { id: 'liverole',     label: 'Live Rolle',     icon: <Radio size={16} /> },
        ],
    },
    {
        label: 'Kanäle',
        tabs: [
            { id: 'voice',        label: 'Voice Channels', icon: <Volume2 size={16} /> },
            { id: 'imageonly',    label: 'Image Only',     icon: <Image size={16} /> },
            { id: 'syncchat',     label: 'Taverne',        icon: <Globe size={16} /> },
        ],
    },
    {
        label: 'Features',
        tabs: [
            { id: 'funcommands',  label: 'Fun Commands',   icon: <Gamepad2 size={16} /> },
            { id: 'twitchnotif',  label: 'Twitch Notif.',  icon: <Tv size={16} /> },
            { id: 'tickets',      label: 'Tickets',        icon: <Ticket size={16} /> },
        ],
    },
];

export default function DiscordBotDashboard() {
    const { user, login } = useContext(TwitchAuthContext);

    const [isDiscordLoggedIn, setIsDiscordLoggedIn] = useState(false);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedServer, setSelectedServer] = useState(null);
    const [activeTab, setActiveTab] = useState('general');
    const [loginUrl, setLoginUrl] = useState('');

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
    const [disabledCommands, setDisabledCommands] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        if (!user) { setLoading(false); return; }
        fetch('/api/discord/guilds')
            .then(r => r.json())
            .then(data => {
                if (data.guilds) {
                    setServers(data.guilds);
                    setIsDiscordLoggedIn(true);
                } else {
                    fetch('/api/discord/login-url').then(r => r.json()).then(d => setLoginUrl(d.url));
                    setIsDiscordLoggedIn(false);
                }
            })
            .finally(() => setLoading(false));
    }, [user]);

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/guilds/${selectedServer.id}/channels?type=0`).then(r => r.json()).then(d => setChannels(d.channels || []));
        fetch(`/api/discord/guilds/${selectedServer.id}/channels?type=2`).then(r => r.json()).then(d => setVoiceChannels(d.channels || []));
        fetch(`/api/discord/guilds/${selectedServer.id}/roles`).then(r => r.json()).then(d => setServerRoles(d.roles || []));
        fetch(`/api/discord/guilds/${selectedServer.id}/emojis`).then(r => r.json()).then(d => setServerEmojis(d.emojis || []));
        fetch(`/api/discord/settings/${selectedServer.id}`).then(r => r.json()).then(d => {
            setPrefix(d.prefix || '!');
            setBotNickname(d.botNickname || '');
            setWelcomeChannel(d.welcomeChannel || '');
            setWelcomeMessage(d.welcomeMessage || 'Willkommen [USER] auf [SERVER]! Du bist unser Mitglied #[MEMBER]');
            setLeaveChannel(d.leaveChannel || '');
            setLeaveMessage(d.leaveMessage || 'Schade, [USER] hat [SERVER] verlassen. Noch [MEMBER] Mitglieder übrig.');
            setFunChannel(d.funChannel || '');
            setDisabledCommands(d.disabledCommands || []);
        });
        setActiveTab('general');
    }, [selectedServer]);

    const handleSaveSettings = async () => {
        setIsSaving(true);
        setSaveStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prefix, botNickname,
                    welcomeChannel, welcomeMessage,
                    leaveChannel, leaveMessage,
                    funChannel, disabledCommands,
                }),
            });
            setSaveStatus(res.ok ? 'Gespeichert!' : 'Fehler.');
        } catch {
            setSaveStatus('Netzwerkfehler.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    if (!user) return (
        <div className="page-fade h-full flex items-center justify-center p-6">
            <SEO title="Discord Bot" description="Verwalte deinen Discord Bot." path="/discord-bot" />
            <div className="panel p-10 max-w-md w-full flex flex-col items-center gap-5 text-center">
                <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
                    <Bot size={26} />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-white mb-2">Discord-Bot</h1>
                    <p className="text-sm text-white/50">Melde dich mit Twitch an, um den Bot zu verwalten.</p>
                </div>
                <button onClick={() => login(false)} className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                    <TwitchGlyph className="w-4 h-4" /> Mit Twitch anmelden
                </button>
                <LegalLinks />
            </div>
        </div>
    );
    if (loading) return (
        <div className="page-fade h-full flex items-center justify-center">
            <SEO title="Discord Bot" description="Verwalte deinen Discord Bot." path="/discord-bot" />
            <p className="text-white/40 animate-pulse font-medium text-sm">Lade Dashboard...</p>
        </div>
    );

    if (!isDiscordLoggedIn) return (
        <div className="page-fade h-full flex items-center justify-center p-6">
            <SEO title="Discord Bot" description="Verwalte deinen Discord Bot." path="/discord-bot" />
            <div className="panel p-10 max-w-md w-full flex flex-col items-center gap-5 text-center">
                <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#5865F2]/10 border border-[#5865F2]/30 text-[#7984f5]">
                    <DiscordGlyph className="w-6 h-6" />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-white mb-2">Discord verknüpfen</h1>
                    <p className="text-sm text-white/50">Verbinde deinen Discord-Account, um deine Server zu verwalten.</p>
                </div>
                <a href={loginUrl} className="flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                    <DiscordGlyph className="w-4 h-4" /> Mit Discord anmelden
                </a>
                <LegalLinks />
            </div>
        </div>
    );

    if (!selectedServer) return (
        <div className="page-fade h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <SEO title="Discord Bot" description="Wähle einen Server aus um deinen Discord Bot zu verwalten." path="/discord-bot" />
            <div className="max-w-6xl mx-auto">
                <h1 className="font-display text-3xl font-bold text-white tracking-tight mb-8">Deine Server</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {servers.map(server => (
                        <div key={server.id} className="panel p-6 flex flex-col items-center group">
                            <div className="w-20 h-20 rounded-2xl bg-black/30 mb-4 overflow-hidden border border-white/10 group-hover:border-violet-400/30 transition-colors">
                                {server.icon
                                    ? <img src={server.icon} className="w-full h-full object-cover " alt={server.name} />
                                    : <div className="text-3xl text-white/40 w-full h-full flex items-center justify-center">{server.name.charAt(0)}</div>}
                            </div>
                            <h3 className="text-white font-semibold mb-4 text-base text-center">{server.name}</h3>
                            {server.botPresent ? (
                                <button onClick={() => setSelectedServer(server)}
                                    className="w-full bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm flex items-center justify-center gap-1.5">
                                    Dashboard öffnen <ArrowRight size={14} />
                                </button>
                            ) : (
                                <a href={server.inviteUrl} target="_blank" rel="noopener noreferrer"
                                    className="block w-full text-center bg-white/5 hover:bg-[#5865F2] text-white py-2.5 rounded-lg font-semibold transition-colors text-sm">
                                    Bot einladen
                                </a>
                            )}
                        </div>
                    ))}
                </div>
                <LegalLinks className="justify-center mt-10" />
            </div>
        </div>
    );

    // ── App-like layout: fixed header + sidebar + scrollable content ──────────
    return (
        <div className="h-full flex flex-col overflow-hidden">
            <SEO
                title={`${selectedServer.name} – Discord Bot`}
                description={`Discord Bot Dashboard für den Server ${selectedServer.name}.`}
                path="/discord-bot"
            />

            {/* Top bar — fixed, never scrolls */}
            <div className="shrink-0 h-14 bg-black/25 border-b border-white/10 flex items-center px-4 gap-3">
                <button onClick={() => setSelectedServer(null)}
                    className="text-white/40 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 shrink-0">
                    <ChevronLeft size={20} />
                </button>
                <div className="w-8 h-8 rounded-lg bg-black/40 overflow-hidden border border-white/10 shrink-0">
                    {selectedServer.icon
                        ? <img src={selectedServer.icon} className="w-full h-full object-cover" alt={selectedServer.name} />
                        : <div className="text-sm text-white/50 w-full h-full flex items-center justify-center font-bold">{selectedServer.name.charAt(0)}</div>}
                </div>
                <span className="text-white font-semibold truncate">{selectedServer.name}</span>
                <span className="text-violet-300 text-xs font-semibold shrink-0 bg-violet-500/10 border border-violet-400/20 px-2 py-0.5 rounded-md">Dashboard</span>
            </div>

            {/* Body — sidebar + content */}
            <div className="flex-1 flex overflow-hidden">

                {/* Sidebar — fixed, never scrolls */}
                <div className="w-56 shrink-0 bg-black/20 border-r border-white/10 flex flex-col py-2 px-2 overflow-y-auto custom-scrollbar">
                    {GROUPS.map(group => (
                        <div key={group.label} className="mb-1">
                            <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider px-3 pt-3 pb-1">{group.label}</p>
                            {group.tabs.map(item => (
                                <button key={item.id} onClick={() => setActiveTab(item.id)}
                                    className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2.5 mb-0.5 ${
                                        activeTab === item.id
                                            ? 'bg-violet-600 text-white'
                                            : 'text-white/50 hover:bg-white/5 hover:text-white'
                                    }`}>
                                    <span className="shrink-0">{item.icon}</span>
                                    <span className="text-sm">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    ))}
                    <div className="mt-auto pt-3 px-3">
                        <LegalLinks />
                    </div>
                </div>

                {/* Content — only this scrolls */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    {activeTab === 'general' && (
                        <GeneralTab
                            prefix={prefix} setPrefix={setPrefix}
                            botNickname={botNickname} setBotNickname={setBotNickname}
                            isSaving={isSaving} saveStatus={saveStatus}
                            handleSaveSettings={handleSaveSettings}
                        />
                    )}
                    {activeTab === 'welcome' && (
                        <WelcomeTab
                            welcomeChannel={welcomeChannel} setWelcomeChannel={setWelcomeChannel}
                            welcomeMessage={welcomeMessage} setWelcomeMessage={setWelcomeMessage}
                            channels={channels}
                            isSaving={isSaving} saveStatus={saveStatus}
                            handleSaveSettings={handleSaveSettings}
                        />
                    )}
                    {activeTab === 'leave' && (
                        <LeaveTab
                            leaveChannel={leaveChannel} setLeaveChannel={setLeaveChannel}
                            leaveMessage={leaveMessage} setLeaveMessage={setLeaveMessage}
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
                </div>
            </div>
        </div>
    );
}

