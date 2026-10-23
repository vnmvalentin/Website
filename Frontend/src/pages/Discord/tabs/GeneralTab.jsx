import React from 'react';
import { DcSaveBar } from '../ui';

export default function GeneralTab({ prefix, setPrefix, botNickname, setBotNickname, isSaving, saveStatus, handleSaveSettings, dirty }) {
    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">Allgemeine Einstellungen</h2>
                <p>Gilt für den ganzen Server.</p>
            </div>
            <div className="dc-card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="dc-label" htmlFor="dc-prefix">Befehls-Prefix</label>
                    <input id="dc-prefix" type="text" value={prefix} onChange={e => setPrefix(e.target.value)} className="dc-input w-full" />
                    <p className="text-[12px] text-white/40 mt-1.5">Zeichen vor Text-Befehlen, etwa !ship.</p>
                </div>
                <div>
                    <label className="dc-label" htmlFor="dc-nick">Name des Bots auf diesem Server</label>
                    <input id="dc-nick" type="text" value={botNickname} onChange={e => setBotNickname(e.target.value)}
                        className="dc-input w-full" placeholder="Leer = Standard" />
                </div>
            </div>
            <DcSaveBar onSave={handleSaveSettings} isSaving={isSaving} status={saveStatus} dirty={dirty} />
        </div>
    );
}
