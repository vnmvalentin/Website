import React from 'react';
import MemberMessageForm from './MemberMessageForm';

const VARIABLES = [
    ['[USER]', 'Erwähnung des neuen Mitglieds'],
    ['[SERVER]', 'Servername'],
    ['[MEMBER]', 'Aktuelle Mitgliederzahl'],
];

export default function WelcomeTab({ welcomeChannel, setWelcomeChannel, welcomeMessage, setWelcomeMessage, welcomeStyle, setWelcomeStyle, handleSaveSettings, ...shared }) {
    return (
        <MemberMessageForm
            kind="welcome"
            title="Willkommens-Nachrichten"
            description="Wird gesendet, wenn ein neues Mitglied beitritt."
            channelLabel="Begrüßungs-Kanal"
            variables={VARIABLES}
            channel={welcomeChannel} setChannel={setWelcomeChannel}
            message={welcomeMessage} setMessage={setWelcomeMessage}
            style={welcomeStyle} setStyle={setWelcomeStyle}
            onSave={handleSaveSettings}
            {...shared}
        />
    );
}
