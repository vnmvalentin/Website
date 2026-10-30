// Gemeinsames Formular für Eintritts- und Austrittsnachricht: Kanal, Text,
// Darstellung — und daneben die Vorschau, wie die Nachricht in Discord aussieht.
import React, { useRef } from 'react';
import { DcSaveBar, DiscordPreview } from '../ui';
import EmojiTextField from '../EmojiTextField';

const STYLES = [
    ['text', 'Schlichte Nachricht', 'Nur der Text.'],
    ['card', 'Karte mit Profilbild', 'Name und Profilbild des Mitglieds, der Text darunter.'],
    ['image', 'Gezeichnetes Bild', 'Großes Bild mit Profilbild und Name, dein Text steht darüber.'],
];

// Layouts des gezeichneten Bilds — dieselbe Liste wie IMAGE_LAYOUTS im Bot (memberImage.js)
const IMAGE_LAYOUTS = [
    ['classic', 'Klassisch', '1000 / 320'],
    ['center', 'Zentriert', '1000 / 420'],
    ['poster', 'Plakat', '1000 / 320'],
    ['light', 'Hell', '1000 / 320'],
    ['badge', 'Ausweis', '1000 / 320'],
];

export default function MemberMessageForm({
    kind, title, description, channelLabel, variables, note,
    channel, setChannel, message, setMessage, style, setStyle,
    imageLayout = 'classic', setImageLayout,
    channels, serverEmojis = [], serverName, serverId, botName, isSaving, saveStatus, onSave, dirty,
}) {
    const field = useRef(null);
    const imageUrl = (layout) => `/api/discord/settings/${serverId}/member-image?kind=${kind}&layout=${layout}`;
    const ratio = (IMAGE_LAYOUTS.find(([id]) => id === imageLayout) || IMAGE_LAYOUTS[0])[2];

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
                            <option value="">Aus — keine Nachricht senden</option>
                            {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                        </select>
                    </div>

                    <div className="dc-card p-4">
                        <label className="dc-label" htmlFor={`${kind}-message`}>Nachricht</label>
                        <EmojiTextField ref={field} id={`${kind}-message`} value={message} onChange={setMessage} rows={4}
                            emojis={serverEmojis} channels={channels} />
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                            <span className="text-[11px] text-white/40 mr-1">Einfügen:</span>
                            {variables.map(([token, hint]) => (
                                <button key={token} type="button" onMouseDown={e => e.preventDefault()} onClick={() => field.current?.insert(token)} title={hint} className="dc-chip">
                                    {token}
                                </button>
                            ))}
                        </div>
                        {note && <p className="text-[12px] text-white/45 mt-2.5">{note}</p>}
                    </div>

                    <div className="dc-card p-4">
                        <span className="dc-label">Darstellung</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {STYLES.map(([id, label, text]) => (
                                <button key={id} type="button" onClick={() => setStyle(id)} aria-pressed={style === id}
                                    className={`dc-choice${style === id ? ' is-active' : ''}`}>
                                    <b>{label}</b>
                                    <span>{text}</span>
                                </button>
                            ))}
                        </div>

                        {style === 'image' && setImageLayout && (
                            <>
                                <span className="dc-label mt-4">Design des Bilds</span>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {IMAGE_LAYOUTS.map(([id, label, r]) => (
                                        <button key={id} type="button" onClick={() => setImageLayout(id)} aria-pressed={imageLayout === id}
                                            className={`dc-layout${imageLayout === id ? ' is-active' : ''}`}>
                                            <img src={imageUrl(id)} alt="" loading="lazy" style={{ aspectRatio: r }} />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="xl:sticky xl:top-0">
                    <span className="dc-label">Vorschau</span>
                    <DiscordPreview kind={kind} style={style} text={message} serverName={serverName} botName={botName}
                        imageUrl={imageUrl(imageLayout)} imageRatio={ratio} />
                    <p className="text-[11.5px] text-white/35 mt-2">
                        Beispiel mit dem Mitglied „Mika“. Formatierungen wie **fett** setzt erst Discord um.
                    </p>
                </div>
            </div>

            <DcSaveBar onSave={onSave} isSaving={isSaving} status={saveStatus} dirty={dirty} />
        </div>
    );
}
