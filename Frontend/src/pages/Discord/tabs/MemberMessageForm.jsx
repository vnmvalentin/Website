// Gemeinsames Formular für Eintritts- und Austrittsnachricht: Kanal, Text,
// Darstellung — und daneben die Vorschau, wie die Nachricht in Discord aussieht.
import React, { useRef } from 'react';
import { DcSaveBar, DiscordPreview } from '../ui';
import EmojiTextField from '../EmojiTextField';
import { useDiscordText } from '../discordI18n.js';

// Beschriftungen in discordI18n.js (member.styles / member.layouts)
const STYLES = ['text', 'card', 'image'];

// Layouts des gezeichneten Bilds — dieselbe Liste wie IMAGE_LAYOUTS im Bot (memberImage.js): [id, Seitenverhältnis]
const IMAGE_LAYOUTS = [
    ['classic', '1000 / 320'],
    ['center', '1000 / 420'],
    ['poster', '1000 / 320'],
    ['light', '1000 / 320'],
    ['badge', '1000 / 320'],
];

export default function MemberMessageForm({
    kind, title, description, channelLabel, variables, note,
    channel, setChannel, message, setMessage, style, setStyle,
    imageLayout = 'classic', setImageLayout,
    channels, serverEmojis = [], serverName, serverId, botName, botLanguage = 'de', isSaving, saveStatus, onSave, dirty,
}) {
    const t = useDiscordText();
    const field = useRef(null);
    // Das Bild zeichnet der Server in der Sprache des Bots (auch eine noch ungespeicherte Wahl)
    const imageUrl = (layout) => `/api/discord/settings/${serverId}/member-image?kind=${kind}&layout=${layout}&lang=${botLanguage}`;
    const ratio = (IMAGE_LAYOUTS.find(([id]) => id === imageLayout) || IMAGE_LAYOUTS[0])[1];

    return (
        <div className="dc-page" style={{ maxWidth: 1080 }}>
            <div>
                <h2 className="dc-h2">{title}</h2>
                <p>{description}</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
                <div className="space-y-3">
                    <div className="dc-card p-4">
                        <label className="dc-label" htmlFor={`${kind}-channel`}>{channelLabel}</label>
                        <select id={`${kind}-channel`} value={channel} onChange={e => setChannel(e.target.value)} className="dc-input w-full">
                            <option value="">{t.member.off}</option>
                            {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                        </select>
                    </div>

                    <div className="dc-card p-4">
                        <label className="dc-label" htmlFor={`${kind}-message`}>{t.member.message}</label>
                        <EmojiTextField ref={field} id={`${kind}-message`} value={message} onChange={setMessage} rows={4}
                            emojis={serverEmojis} channels={channels} />
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                            <span className="text-[11px] text-white/40 mr-1">{t.member.insert}</span>
                            {variables.map(([token, hint]) => (
                                <button key={token} type="button" onMouseDown={e => e.preventDefault()} onClick={() => field.current?.insert(token)} title={hint} className="dc-chip">
                                    {token}
                                </button>
                            ))}
                        </div>
                        {note && <p className="text-[12px] text-white/45 mt-2.5">{note}</p>}
                    </div>

                    <div className="dc-card p-4">
                        <span className="dc-label">{t.member.style}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {STYLES.map((id) => (
                                <button key={id} type="button" onClick={() => setStyle(id)} aria-pressed={style === id}
                                    className={`dc-choice${style === id ? ' is-active' : ''}`}>
                                    <b>{t.member.styles[id].label}</b>
                                    <span>{t.member.styles[id].text}</span>
                                </button>
                            ))}
                        </div>

                        {style === 'image' && setImageLayout && (
                            <>
                                <span className="dc-label mt-4">{t.member.layoutLabel}</span>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {IMAGE_LAYOUTS.map(([id, r]) => (
                                        <button key={id} type="button" onClick={() => setImageLayout(id)} aria-pressed={imageLayout === id}
                                            className={`dc-layout${imageLayout === id ? ' is-active' : ''}`}>
                                            <img src={imageUrl(id)} alt="" loading="lazy" style={{ aspectRatio: r }} />
                                            {t.member.layouts[id]}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="xl:sticky xl:top-0">
                    <span className="dc-label">{t.common.preview}</span>
                    <DiscordPreview kind={kind} style={style} text={message} serverName={serverName} botName={botName}
                        botLanguage={botLanguage} imageUrl={imageUrl(imageLayout)} imageRatio={ratio} />
                    <p className="text-[11.5px] text-white/35 mt-2">
                        {/* Das Beispiel **fett** zeigt die Sternchen bewusst als Text */}
                        {t.member.previewNote}
                    </p>
                </div>
            </div>

            <DcSaveBar onSave={onSave} isSaving={isSaving} status={saveStatus} dirty={dirty} />
        </div>
    );
}
