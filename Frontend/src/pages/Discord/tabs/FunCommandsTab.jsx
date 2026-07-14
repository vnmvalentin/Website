import React from 'react';
import { Grid3x3, Sparkles, Ruler, Heart, Coins, Eye, Brain } from 'lucide-react';

const COMMANDS = [
    {
        icon: <Grid3x3 size={28} />, name: 'connect3', displayName: '/connect3', tag: 'Spiel',
        desc: 'Starte ein Connect 3 Duell auf einem 5×5 Spielfeld.',
        usage: '/connect3 @gegner  |  !connect3 @gegner',
        details: ['5×5 Buttons (Schwerkraft wie Connect 4)', 'Zufälliger Startspieler', '3 in Reihe gewinnt', 'Nur der aktive Spieler kann klicken'],
    },
    {
        icon: <Sparkles size={28} />, name: 'magische_miesmuschel', displayName: '/magische_miesmuschel', tag: 'Spaß',
        desc: 'Frag die magische Miesmuschel eine Ja/Nein-Frage.',
        usage: '/magische_miesmuschel [frage]  |  !miesmuschel [frage]',
        details: ['18 mögliche Antworten', 'Zeigt Frage + mystische Antwort'],
    },
    {
        icon: <Ruler size={28} />, name: 'pp', displayName: '/pp', tag: 'Spaß',
        desc: 'Misst täglich den PP eines Nutzers. Jeder Nutzer bekommt eine zufällige Zahl pro Tag.',
        usage: '/pp  |  !pp',
        details: ['1–25 cm zufällig pro Tag', 'Gleicher Wert bei Wiederholung', 'Zeigt Nutzernamen in der Antwort'],
    },
    {
        icon: <Eye size={28} />, name: 'aussehen', displayName: '/aussehen', tag: 'Spaß',
        desc: 'Bewertet täglich das Aussehen eines Nutzers. Jeder Nutzer bekommt eine zufällige Note pro Tag.',
        usage: '/aussehen',
        details: ['1–10 zufällig pro Tag', 'Gleicher Wert bei Wiederholung', 'Zeigt Nutzernamen in der Antwort'],
    },
    {
        icon: <Brain size={28} />, name: 'iq', displayName: '/iq', tag: 'Spaß',
        desc: 'Misst täglich den IQ eines Nutzers. Jeder Nutzer bekommt eine zufällige Zahl pro Tag.',
        usage: '/iq',
        details: ['0–180 zufällig pro Tag', 'Gleicher Wert bei Wiederholung', 'Zeigt Nutzernamen in der Antwort'],
    },
    {
        icon: <Heart size={28} />, name: 'ship', displayName: '/ship', tag: 'Spaß',
        desc: 'Berechnet den Liebeswert zwischen zwei Nutzern.',
        usage: '/ship @user1 @user2  |  !ship @user1 @user2',
        details: ['0–100% Liebeswert', 'Deterministisch (gleiche Paare = gleiches Ergebnis)', 'Generiert einen Ship-Namen', 'Emoji-Balken als Visualisierung'],
    },
    {
        icon: <Coins size={28} />, name: 'coinflip', displayName: '/coinflip', tag: 'Zufall',
        desc: 'Wirf eine Münze — Kopf oder Zahl?',
        usage: '/coinflip  |  !coinflip',
        details: ['50/50 Chance', 'Kopf oder Zahl'],
    },
];

function Toggle({ enabled, onToggle }) {
    return (
        <button
            onClick={onToggle}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${enabled ? 'bg-cyan-500' : 'bg-[#2a2a32]'}`}
        >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );
}

export default function FunCommandsTab({ funChannel, setFunChannel, channels, isSaving, saveStatus, handleSaveSettings, disabledCommands, setDisabledCommands }) {
    const isEnabled = (name) => !disabledCommands.includes(name);

    const toggleCommand = (name) => {
        setDisabledCommands(prev =>
            prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
        );
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Fun Commands</h2>
                <p className="text-gray-400 text-sm">Slash Commands und Prefix-Commands für alle Mitglieder. Optional auf einen Kanal beschränken.</p>
            </div>

            <div className="bg-[#0f0f13] border border-white/5 rounded-sm p-6 space-y-4 max-w-lg">
                <h3 className="text-white font-semibold flex items-center gap-2">⚙️ Kanal-Einschränkung</h3>
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Fun Commands Kanal</label>
                    <select value={funChannel} onChange={e => setFunChannel(e.target.value)}
                        className="w-full bg-[#1a1a20] border border-white/10 rounded-sm p-3 text-white focus:border-cyan-500 outline-none appearance-none">
                        <option value="">-- Überall erlaubt --</option>
                        {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                    </select>
                    <p className="text-gray-500 text-xs mt-2">
                        {funChannel
                            ? `Commands außerhalb von #${channels.find(c => c.id === funChannel)?.name || '?'} geben eine Fehlermeldung.`
                            : 'Commands funktionieren in jedem Kanal.'}
                    </p>
                </div>
                <div className="pt-2 flex items-center gap-4">
                    <button onClick={handleSaveSettings} disabled={isSaving}
                        className="bg-cyan-500 text-black font-bold py-2.5 px-6 rounded-sm hover:bg-cyan-400 disabled:opacity-50 transition-colors">
                        {isSaving ? 'Speichere...' : 'Speichern'}
                    </button>
                    {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
                </div>
            </div>

            <div>
                <h3 className="text-white font-semibold text-lg mb-4">Verfügbare Commands</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {COMMANDS.map(cmd => {
                        const enabled = isEnabled(cmd.name);
                        return (
                            <div key={cmd.name} className={`bg-[#0f0f13] border rounded-sm p-5 flex flex-col gap-3 transition-colors ${
                                enabled ? 'border-white/5 hover:border-cyan-500/20' : 'border-white/5 opacity-60'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-300 shrink-0">{cmd.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-bold font-mono text-sm">{cmd.displayName}</div>
                                        <div className="text-gray-500 text-xs">{cmd.tag}</div>
                                    </div>
                                    <Toggle enabled={enabled} onToggle={() => toggleCommand(cmd.name)} />
                                </div>
                                <p className="text-gray-400 text-sm flex-1">{cmd.desc}</p>
                                <div className="bg-[#1a1a20] rounded-sm p-3 font-mono text-xs text-cyan-400 leading-relaxed">{cmd.usage}</div>
                                <ul className="text-gray-500 text-xs space-y-1">
                                    {cmd.details.map((d, i) => <li key={i}>• {d}</li>)}
                                </ul>
                                {!enabled && (
                                    <div className="text-xs text-red-400 font-medium">⛔ Deaktiviert</div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="mt-4 flex items-center gap-4">
                    <button onClick={handleSaveSettings} disabled={isSaving}
                        className="bg-cyan-500 text-black font-bold py-2.5 px-6 rounded-sm hover:bg-cyan-400 disabled:opacity-50 transition-colors">
                        {isSaving ? 'Speichere...' : 'Änderungen speichern'}
                    </button>
                    {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
                </div>
            </div>
        </div>
    );
}

