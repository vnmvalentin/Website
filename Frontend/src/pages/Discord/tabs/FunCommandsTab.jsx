import React from 'react';
import { Grid3x3, Sparkles, Ruler, Heart, Coins, Eye, Brain, PersonStanding, Scale, BarChart3, Zap, MessageCircleQuestion } from 'lucide-react';
import { isErrorStatus, useDiscordText } from '../discordI18n.js';

// name = Befehlsname im Bot (bleibt in jeder Sprache gleich). Beschreibung, Aufruf und Details: discordI18n.js (fun.commands)
const COMMANDS = [
    { icon: <Grid3x3 size={28} />, name: 'connect3', tag: 'game' },
    { icon: <Sparkles size={28} />, name: 'magische_miesmuschel', tag: 'fun' },
    { icon: <Ruler size={28} />, name: 'pp', tag: 'fun' },
    { icon: <Eye size={28} />, name: 'aussehen', tag: 'fun' },
    { icon: <Brain size={28} />, name: 'iq', tag: 'fun' },
    { icon: <PersonStanding size={28} />, name: 'größe', tag: 'fun' },
    { icon: <Scale size={28} />, name: 'gewicht', tag: 'fun' },
    { icon: <Heart size={28} />, name: 'ship', tag: 'fun' },
    { icon: <Coins size={28} />, name: 'coinflip', tag: 'chance' },
    { icon: <BarChart3 size={28} />, name: 'allstats', tag: 'fun' },
    { icon: <Zap size={28} />, name: 'superkraft', tag: 'adult' },
    { icon: <MessageCircleQuestion size={28} />, name: 'ausrede', tag: 'adult' },
];

function Toggle({ enabled, onToggle, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={label}
            onClick={onToggle}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${enabled ? 'bg-indigo-500' : 'bg-[#2a2a32]'}`}
        >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );
}

export default function FunCommandsTab({ funChannel, setFunChannel, channels, isSaving, saveStatus, handleSaveSettings, disabledCommands, setDisabledCommands, dirty }) {
    const t = useDiscordText();
    const isEnabled = (name) => !disabledCommands.includes(name);

    const toggleCommand = (name) => {
        setDisabledCommands(prev =>
            prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
        );
    };

    const statusLine = saveStatus
        ? <span className={`text-sm font-medium ${isErrorStatus(saveStatus) ? 'text-red-400' : 'text-white'}`}>{saveStatus}</span>
        : dirty && <span className="dc-unsaved">{t.common.unsaved}</span>;

    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">{t.fun.title}</h2>
                <p className="text-white/50 text-sm">{t.fun.intro}</p>
            </div>

            <div className="dc-card p-6 space-y-4 max-w-lg">
                <h3 className="text-white font-semibold flex items-center gap-2">{t.fun.restriction}</h3>
                <div>
                    <label className="dc-label">{t.fun.channelLabel}</label>
                    <select value={funChannel} onChange={e => setFunChannel(e.target.value)}
                        className="dc-input w-full">
                        <option value="">{t.common.everywhere}</option>
                        {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                    </select>
                    <p className="text-white/40 text-xs mt-2">
                        {funChannel
                            ? t.fun.restrictedTo(channels.find(c => c.id === funChannel)?.name || '?')
                            : t.fun.everywhereNote}
                    </p>
                </div>
                <div className="pt-2 flex items-center gap-4">
                    <button onClick={handleSaveSettings} disabled={isSaving}
                        className="dc-btn">
                        {isSaving ? t.common.saving : t.common.save}
                    </button>
                    {statusLine}
                </div>
            </div>

            <div>
                <h3 className="text-white font-semibold text-lg mb-1">{t.fun.available}</h3>
                <p className="text-white/40 text-xs mb-4">{t.fun.germanOnly}</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {COMMANDS.map(cmd => {
                        const enabled = isEnabled(cmd.name);
                        const text = t.fun.commands[cmd.name];
                        return (
                            <div key={cmd.name} className={`dc-card p-5 flex flex-col gap-3 transition-colors ${
                                enabled ? 'border-white/5 hover:border-indigo-500/20' : 'border-white/5 opacity-60'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <span className="text-white/60 shrink-0">{cmd.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-bold text-sm">/{cmd.name}</div>
                                        <div className="text-white/40 text-xs">{t.fun.tags[cmd.tag]}</div>
                                    </div>
                                    <Toggle enabled={enabled} onToggle={() => toggleCommand(cmd.name)} label={t.fun.toggle(`/${cmd.name}`)} />
                                </div>
                                <p className="text-white/50 text-sm flex-1">{text.desc}</p>
                                <div className="dc-inset p-3 text-xs text-indigo-400 leading-relaxed">{text.usage}</div>
                                <ul className="text-white/40 text-xs space-y-1">
                                    {text.details.map((d, i) => <li key={i}>• {d}</li>)}
                                </ul>
                                {!enabled && (
                                    <div className="text-xs text-red-400 font-medium">{t.fun.disabled}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="mt-4 flex items-center gap-4">
                    <button onClick={handleSaveSettings} disabled={isSaving}
                        className="dc-btn">
                        {isSaving ? t.common.saving : t.common.saveChanges}
                    </button>
                    {statusLine}
                </div>
            </div>
        </div>
    );
}
