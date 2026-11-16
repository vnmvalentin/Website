import React from 'react';
import MemberMessageForm from './MemberMessageForm';
import { useDiscordText } from '../discordI18n.js';

export default function WelcomeTab({ welcomeChannel, setWelcomeChannel, welcomeMessage, setWelcomeMessage, welcomeStyle, setWelcomeStyle, handleSaveSettings, ...shared }) {
    const t = useDiscordText();
    const variables = [
        ['[USER]', t.welcome.vars.user],
        ['[SERVER]', t.welcome.vars.server],
        ['[MEMBER]', t.welcome.vars.member],
    ];
    return (
        <MemberMessageForm
            kind="welcome"
            title={t.welcome.title}
            description={t.welcome.description}
            channelLabel={t.welcome.channelLabel}
            variables={variables}
            channel={welcomeChannel} setChannel={setWelcomeChannel}
            message={welcomeMessage} setMessage={setWelcomeMessage}
            style={welcomeStyle} setStyle={setWelcomeStyle}
            onSave={handleSaveSettings}
            {...shared}
        />
    );
}
