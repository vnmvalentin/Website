import React from 'react';

const VAR = "text-xs bg-violet-500/10 border border-violet-500/20 text-violet-400 px-2 py-1 rounded-md font-mono cursor-help";

export default function WelcomeTab({ welcomeChannel, setWelcomeChannel, welcomeMessage, setWelcomeMessage, channels, isSaving, saveStatus, handleSaveSettings }) {
    return (
        <div className="space-y-8 max-w-2xl">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Willkommens-Nachrichten</h2>
                <p className="text-white/50 text-sm">Wird gesendet wenn ein neues Mitglied beitritt.</p>
            </div>
            <div className="space-y-5">
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Begrüßungs-Kanal</label>
                    <select value={welcomeChannel} onChange={e => setWelcomeChannel(e.target.value)}
                        className="w-full bg-[#0e0e1a]/75 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 outline-none appearance-none">
                        <option value="">-- Deaktiviert --</option>
                        {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Nachricht</label>
                    <textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} rows="4"
                        className="w-full bg-[#0e0e1a]/75 border border-white/10 rounded-lg p-4 text-white focus:border-violet-500 outline-none resize-y" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={VAR} title="@Ping des neuen Mitglieds">[USER]</span>
                    <span className={VAR} title="Servername">[SERVER]</span>
                    <span className={VAR} title="Aktuelle Mitgliederanzahl">[MEMBER]</span>
                </div>
            </div>
            <div className="pt-6 border-t border-white/5 flex items-center gap-4">
                <button onClick={handleSaveSettings} disabled={isSaving}
                    className="bg-violet-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-violet-500 disabled:opacity-50 transition-colors">
                    {isSaving ? 'Speichere...' : 'Speichern'}
                </button>
                {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
            </div>
        </div>
    );
}

