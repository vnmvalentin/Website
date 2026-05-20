import React from 'react';

const VAR = "text-xs bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2 py-1 rounded-md font-mono cursor-help";

export default function LeaveTab({ leaveChannel, setLeaveChannel, leaveMessage, setLeaveMessage, channels, isSaving, saveStatus, handleSaveSettings }) {
    return (
        <div className="space-y-8 max-w-2xl animate-in slide-in-from-right-4 duration-300">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Abschiedsnachrichten</h2>
                <p className="text-gray-400 text-sm">Wird gesendet wenn ein Mitglied den Server verlässt.</p>
            </div>
            <div className="space-y-5">
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Abschied-Kanal</label>
                    <select value={leaveChannel} onChange={e => setLeaveChannel(e.target.value)}
                        className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none appearance-none">
                        <option value="">-- Deaktiviert --</option>
                        {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Nachricht</label>
                    <textarea value={leaveMessage} onChange={e => setLeaveMessage(e.target.value)} rows="4"
                        className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-4 text-white focus:border-cyan-500 outline-none resize-y" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={VAR} title="Benutzername (kein Ping — Person hat den Server verlassen)">[USER]</span>
                    <span className={VAR} title="Servername">[SERVER]</span>
                    <span className={VAR} title="Mitgliederanzahl nach dem Austritt">[MEMBER]</span>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-yellow-300 text-xs">
                    ℹ️ <strong>[USER]</strong> ist der Benutzername, kein @Ping (Person ist nicht mehr auf dem Server).
                </div>
            </div>
            <div className="pt-6 border-t border-white/5 flex items-center gap-4">
                <button onClick={handleSaveSettings} disabled={isSaving}
                    className="bg-cyan-500 text-black font-bold py-3 px-8 rounded-xl hover:bg-cyan-400 disabled:opacity-50 transition-all">
                    {isSaving ? 'Speichere...' : 'Speichern'}
                </button>
                {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
            </div>
        </div>
    );
}
