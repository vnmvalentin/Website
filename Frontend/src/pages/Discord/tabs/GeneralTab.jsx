import React from 'react';

export default function GeneralTab({ prefix, setPrefix, botNickname, setBotNickname, isSaving, saveStatus, handleSaveSettings }) {
    return (
        <div className="space-y-8 max-w-2xl animate-in slide-in-from-right-4 duration-300">
            <h2 className="text-2xl text-white font-bold">Allgemeine Einstellungen</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Befehls-Prefix</label>
                    <input type="text" value={prefix} onChange={e => setPrefix(e.target.value)}
                        className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none" />
                </div>
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Bot Nickname</label>
                    <input type="text" value={botNickname} onChange={e => setBotNickname(e.target.value)}
                        className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none"
                        placeholder="Leer = Standard" />
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
