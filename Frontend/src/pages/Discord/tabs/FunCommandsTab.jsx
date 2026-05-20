import React from 'react';

const COMMANDS = [
    {
        emoji: '🎮', name: '/connect3', tag: 'Spiel',
        desc: 'Starte ein Connect 3 Duell auf einem 5×5 Spielfeld.',
        usage: '/connect3 @gegner',
        details: ['5×5 Buttons (Schwerkraft wie Connect 4)', 'Zufälliger Startspieler', '3 in Reihe gewinnt (diagonal, senkrecht, waagerecht)', 'Nur der aktive Spieler kann klicken'],
    },
    {
        emoji: '🐚', name: '/magische_miesmuschel', tag: 'Spaß',
        desc: 'Frag die magische Miesmuschel eine Ja/Nein-Frage.',
        usage: '/magische_miesmuschel [frage]',
        details: ['18 mögliche Antworten', 'Zeigt Frage + mystische Antwort'],
    },
    {
        emoji: '🍆', name: '/pp', tag: 'Spaß',
        desc: 'Misst täglich deinen PP. Jeder Nutzer bekommt eine zufällige Zahl pro Tag.',
        usage: '/pp',
        details: ['1–25 cm zufällig pro Tag', 'Gleicher Wert bei Wiederholung', 'Zeigt Countdown bis zur nächsten Messung', 'Gespeichert in pp_data.json'],
    },
];

export default function FunCommandsTab({ funChannel, setFunChannel, channels, isSaving, saveStatus, handleSaveSettings }) {
    return (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Fun Commands</h2>
                <p className="text-gray-400 text-sm">Slash Commands für alle Mitglieder. Optional auf einen Kanal beschränken.</p>
            </div>

            <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-6 space-y-4 max-w-lg">
                <h3 className="text-white font-semibold flex items-center gap-2">⚙️ Kanal-Einschränkung</h3>
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Fun Commands Kanal</label>
                    <select value={funChannel} onChange={e => setFunChannel(e.target.value)}
                        className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none appearance-none">
                        <option value="">-- Überall erlaubt --</option>
                        {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                    </select>
                    <p className="text-gray-500 text-xs mt-2">
                        {funChannel
                            ? `Commands außerhalb von #${channels.find(c => c.id === funChannel)?.name || '?'} geben eine ephemeral Meldung.`
                            : 'Commands funktionieren in jedem Kanal.'}
                    </p>
                </div>
                <div className="pt-2 flex items-center gap-4">
                    <button onClick={handleSaveSettings} disabled={isSaving}
                        className="bg-cyan-500 text-black font-bold py-2.5 px-6 rounded-xl hover:bg-cyan-400 disabled:opacity-50 transition-all">
                        {isSaving ? 'Speichere...' : 'Speichern'}
                    </button>
                    {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
                </div>
            </div>

            <div>
                <h3 className="text-white font-semibold text-lg mb-4">Verfügbare Commands</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {COMMANDS.map(cmd => (
                        <div key={cmd.name} className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 flex flex-col gap-3 hover:border-cyan-500/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">{cmd.emoji}</span>
                                <div>
                                    <div className="text-white font-bold font-mono text-sm">{cmd.name}</div>
                                    <div className="text-gray-500 text-xs">{cmd.tag}</div>
                                </div>
                            </div>
                            <p className="text-gray-400 text-sm flex-1">{cmd.desc}</p>
                            <div className="bg-[#1a1a20] rounded-lg p-3 font-mono text-xs text-cyan-400">{cmd.usage}</div>
                            <ul className="text-gray-500 text-xs space-y-1">
                                {cmd.details.map((d, i) => <li key={i}>• {d}</li>)}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
