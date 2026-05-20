import React, { useState, useEffect, useContext } from 'react';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import GeneralTab from './tabs/GeneralTab';
import WelcomeTab from './tabs/WelcomeTab';
import LeaveTab from './tabs/LeaveTab';
import FunCommandsTab from './tabs/FunCommandsTab';
import ReactionRolesTab from './tabs/ReactionRolesTab';
import ApprovalTab from './tabs/ApprovalTab';
import VoiceTab from './tabs/VoiceTab';

const TABS = [
    { id: 'general', label: 'Allgemein', icon: '⚙️' },
    { id: 'welcome', label: 'Willkommen', icon: '👋' },
    { id: 'leave', label: 'Austritt', icon: '🚪' },
    { id: 'funcommands', label: 'Fun Commands', icon: '🎮' },
    { id: 'reactionroles', label: 'Rollen-Buttons', icon: '🔘' },
    { id: 'approval', label: 'Genehmigung', icon: '✅' },
    { id: 'voice', label: 'Voice Channels', icon: '🔊' },
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
                body: JSON.stringify({ prefix, botNickname, welcomeChannel, welcomeMessage, leaveChannel, leaveMessage, funChannel }),
            });
            setSaveStatus(res.ok ? '✅ Gespeichert!' : '❌ Fehler.');
        } catch {
            setSaveStatus('❌ Netzwerkfehler.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    if (!user) return <div className="text-center mt-20 text-white font-medium">Bitte einloggen</div>;
    if (loading) return <div className="text-center mt-20 text-cyan-400 animate-pulse font-medium">Lade Dashboard...</div>;

    if (!isDiscordLoggedIn) return (
        <div className="flex justify-center mt-10">
            <a href={loginUrl} className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-8 py-3 rounded-xl font-bold transition-all duration-200 hover:-translate-y-1">
                Mit Discord Anmelden
            </a>
        </div>
    );

    if (!selectedServer) return (
        <div className="max-w-5xl mx-auto w-full animate-in fade-in duration-300">
            <h1 className="text-3xl font-bold text-white mb-8 border-b border-white/5 pb-4">Deine Server</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {servers.map(server => (
                    <div
                        key={server.id}
                        className="bg-[#1a1a20] border border-white/5 hover:border-white/20 p-6 rounded-2xl flex flex-col items-center group transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
                    >
                        <div className="w-24 h-24 rounded-full bg-[#202028] mb-4 overflow-hidden border-4 border-[#202028] group-hover:border-cyan-500/30 transition-all duration-300">
                            {server.icon
                                ? <img src={server.icon} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={server.name} />
                                : <div className="text-3xl text-white/50 w-full h-full flex items-center justify-center">{server.name.charAt(0)}</div>}
                        </div>
                        <h3 className="text-white font-bold mb-4 text-lg">{server.name}</h3>
                        {server.botPresent ? (
                            <button
                                onClick={() => setSelectedServer(server)}
                                className="w-full bg-cyan-500/10 hover:bg-cyan-500 hover:text-black text-cyan-400 py-3 rounded-xl font-bold transition-all duration-200"
                            >
                                ⚙️ Dashboard
                            </button>
                        ) : (
                            <a
                                href={server.inviteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full text-center bg-white/5 hover:bg-[#5865F2] text-white py-3 rounded-xl font-bold transition-all duration-200"
                            >
                                ➕ Bot einladen
                            </a>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto w-full h-full flex flex-col animate-in fade-in duration-300">
            <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-4">
                <span className="text-2xl shrink-0">⚠️</span>
                <div>
                    <h4 className="text-red-400 font-bold mb-1">Wichtiger Hinweis: Bot-Rollen Hierarchie</h4>
                    <p className="text-gray-300 text-sm">
                        Damit der Bot Rollen verteilen kann, gehe in die Server-Einstellungen → Rollen und ziehe die Bot-Rolle <strong>ganz nach oben</strong> über alle Rollen, die er vergeben soll.
                    </p>
                </div>
            </div>

            <div className="mb-4">
                <button
                    onClick={() => setSelectedServer(null)}
                    className="text-gray-400 hover:text-white bg-[#1a1a20] hover:bg-white/10 border border-white/5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 w-max hover:-translate-x-1"
                >
                    ← Zurück zur Übersicht
                </button>
            </div>

            <div className="bg-[#1a1a20] rounded-2xl border border-white/5 p-8 mb-8 flex flex-col sm:flex-row items-center gap-6 relative overflow-hidden shadow-lg">
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="w-20 h-20 rounded-2xl bg-black/50 overflow-hidden border border-white/10 shrink-0 shadow-inner">
                    {selectedServer.icon
                        ? <img src={selectedServer.icon} className="w-full h-full object-cover" alt={selectedServer.name} />
                        : <div className="text-2xl text-white/50 w-full h-full flex justify-center items-center font-bold">{selectedServer.name.charAt(0)}</div>}
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">{selectedServer.name}</h1>
                    <p className="text-cyan-400 font-medium mt-1">Bot Dashboard aktiv</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar */}
                <div className="w-full md:w-64 flex flex-col gap-2 shrink-0">
                    {TABS.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`text-left px-5 py-4 rounded-xl font-medium transition-all duration-200 flex items-center gap-3 ${
                                activeTab === item.id
                                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 translate-x-2'
                                    : 'bg-[#1a1a20] text-gray-400 hover:bg-white/5 hover:text-white hover:translate-x-1 border border-transparent hover:border-white/5'
                            }`}
                        >
                            <span className="text-xl">{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 bg-[#1a1a20] border border-white/5 rounded-2xl p-6 sm:p-8 shadow-xl min-h-0">
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
                </div>
            </div>
        </div>
    );
}
