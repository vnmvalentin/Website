import React from 'react';
import { DcSaveBar } from '../ui';
import SetupCheck from './SetupCheck';
import { useDiscordText } from '../discordI18n.js';

// Sprachen, in denen der Bot schreiben kann (Backend/discord/bot/botTexts.js)
const BOT_LANGS = ['de', 'en'];

export default function GeneralTab({ serverId, overview, onOpenTab, prefix, setPrefix, botNickname, setBotNickname, botLanguage, setBotLanguage, isSaving, saveStatus, handleSaveSettings, dirty }) {
    const t = useDiscordText();
    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">{t.general.title}</h2>
                <p>{t.general.intro}</p>
            </div>
            {serverId && <SetupCheck key={serverId} serverId={serverId} overview={overview} onOpenTab={onOpenTab} />}
            <div className="dc-card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="dc-label" htmlFor="dc-prefix">{t.general.prefix}</label>
                    <input id="dc-prefix" type="text" value={prefix} onChange={e => setPrefix(e.target.value)} className="dc-input w-full" />
                    <p className="text-[12px] text-white/40 mt-1.5">{t.general.prefixHint}</p>
                </div>
                <div>
                    <label className="dc-label" htmlFor="dc-nick">{t.general.nick}</label>
                    <input id="dc-nick" type="text" value={botNickname} onChange={e => setBotNickname(e.target.value)}
                        className="dc-input w-full" placeholder={t.general.nickPlaceholder} />
                </div>
                <div className="md:col-span-2">
                    <span className="dc-label" id="dc-bot-lang">{t.general.botLanguage}</span>
                    <div className="dc-seg" role="group" aria-labelledby="dc-bot-lang">
                        {BOT_LANGS.map((lang) => (
                            <button key={lang} type="button" aria-pressed={botLanguage === lang}
                                className={botLanguage === lang ? 'is-active' : ''} onClick={() => setBotLanguage(lang)}>
                                {t.general.langNames[lang]}
                            </button>
                        ))}
                    </div>
                    <p className="text-[12px] text-white/40 mt-1.5 max-w-2xl">{t.general.botLanguageHint}</p>
                </div>
            </div>
            <DcSaveBar onSave={handleSaveSettings} isSaving={isSaving} status={saveStatus} dirty={dirty} />
        </div>
    );
}
