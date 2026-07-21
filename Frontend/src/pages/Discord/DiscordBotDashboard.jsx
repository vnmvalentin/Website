import React, { useState, useEffect, useContext } from 'react';
import {
    Settings, UserPlus, LogOut, Gamepad2, Tag, CheckSquare,
    Volume2, Users, Tv, Image, Globe, BarChart2, ChevronLeft,
    Radio, Ticket,
} from 'lucide-react';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
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
    const { user } = useContext(TwitchAuthContext);

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
        <>
            <SEO title="Discord Bot" description="Verwalte deinen Discord Bot." path="/discord-bot" />
            <div className="h-full flex items-center justify-center">
                <p className="text-white font-medium">Bitte einloggen</p>
            </div>
        </>
    );
    if (loading) return (
        <>
            <SEO title="Discord Bot" description="Verwalte deinen Discord Bot." path="/discord-bot" />
            <div className="h-full flex items-center justify-center">
                <p className="text-cyan-400 animate-pulse font-medium">Lade Dashboard...</p>
            </div>
        </>
    );

    if (!isDiscordLoggedIn) return (
        <>
            <SEO title="Discord Bot" description="Verwalte deinen Discord Bot." path="/discord-bot" />
            <div className="h-full flex items-center justify-center">
                <a href={loginUrl} className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-8 py-3 rounded-sm font-bold transition-colors">
                    Mit Discord Anmelden
                </a>
            </div>
        </>
    );

    if (!selectedServer) return (
        <div className="h-full overflow-y-auto p-6 md:p-10 custom-scrollbar">
            <SEO title="Discord Bot" description="Wähle einen Server aus um deinen Discord Bot zu verwalten." path="/discord-bot" />
            <h1 className="text-3xl font-bold text-white mb-8 border-b border-white/5 pb-4">Deine Server</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {servers.map(server => (
                    <div key={server.id}
                        className="bg-[#1a1a20] border border-white/5 hover:border-white/20 p-6 rounded-sm flex flex-col items-center group transition-colors">
                        <div className="w-20 h-20 rounded-full bg-[#202028] mb-4 overflow-hidden border-4 border-[#202028] group-hover:border-cyan-500/30 transition-colors">
                            {server.icon
                                ? <img src={server.icon} className="w-full h-full object-cover " alt={server.name} />
                                : <div className="text-3xl text-white/50 w-full h-full flex items-center justify-center">{server.name.charAt(0)}</div>}
                        </div>
                        <h3 className="text-white font-bold mb-4 text-base text-center">{server.name}</h3>
                        {server.botPresent ? (
                            <button onClick={() => setSelectedServer(server)}
                                className="w-full bg-cyan-500/10 hover:bg-cyan-500 hover:text-black text-cyan-400 py-2.5 rounded-sm font-bold transition-colors text-sm">
                                Dashboard öffnen
                            </button>
                        ) : (
                            <a href={server.inviteUrl} target="_blank" rel="noopener noreferrer"
                                className="block w-full text-center bg-white/5 hover:bg-[#5865F2] text-white py-2.5 rounded-sm font-bold transition-colors text-sm">
                                Bot einladen
                            </a>
                        )}
                    </div>
                ))}
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
            <div className="shrink-0 h-14 bg-[#16161a] border-b border-white/5 flex items-center px-4 gap-4 relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-64 bg-cyan-500/5 blur-[60px] pointer-events-none" />
                <button onClick={() => setSelectedServer(null)}
                    className="text-gray-500 hover:text-white transition-colors p-1 shrink-0">
                    <ChevronLeft size={20} />
                </button>
                <div className="w-8 h-8 rounded-lg bg-black/40 overflow-hidden border border-white/10 shrink-0">
                    {selectedServer.icon
                        ? <img src={selectedServer.icon} className="w-full h-full object-cover" alt={selectedServer.name} />
                        : <div className="text-sm text-white/50 w-full h-full flex items-center justify-center font-bold">{selectedServer.name.charAt(0)}</div>}
                </div>
                <span className="text-white font-semibold truncate">{selectedServer.name}</span>
                <span className="text-cyan-500 text-xs font-medium shrink-0">Dashboard</span>
            </div>

            {/* Body — sidebar + content */}
            <div className="flex-1 flex overflow-hidden">

                {/* Sidebar — fixed, never scrolls */}
                <div className="w-56 shrink-0 bg-[#16161a] border-r border-white/5 flex flex-col py-2 px-2 overflow-y-auto custom-scrollbar">
                    {GROUPS.map(group => (
                        <div key={group.label} className="mb-1">
                            <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-wider px-3 pt-3 pb-1">{group.label}</p>
                            {group.tabs.map(item => (
                                <button key={item.id} onClick={() => setActiveTab(item.id)}
                                    className={`w-full text-left px-3 py-2 rounded-sm font-medium transition-colors flex items-center gap-2.5 mb-0.5 ${
                                        activeTab === item.id
                                            ? 'bg-cyan-500 text-black'
                                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                    }`}>
                                    <span className="shrink-0">{item.icon}</span>
                                    <span className="text-sm">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    ))}
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

