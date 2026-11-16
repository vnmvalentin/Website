import React from 'react';
import MemberMessageForm from './MemberMessageForm';
import { useDiscordText } from '../discordI18n.js';

export default function LeaveTab({ leaveChannel, setLeaveChannel, leaveMessage, setLeaveMessage, leaveStyle, setLeaveStyle, handleSaveSettings, ...shared }) {
    const t = useDiscordText();
    const variables = [
        ['[USER]', t.leave.vars.user],
        ['[SERVER]', t.leave.vars.server],
        ['[MEMBER]', t.leave.vars.member],
    ];
    return (
        <MemberMessageForm
            kind="leave"
            title={t.leave.title}
            description={t.leave.description}
            channelLabel={t.leave.channelLabel}
            variables={variables}
            note={t.leave.note}
            channel={leaveChannel} setChannel={setLeaveChannel}
            message={leaveMessage} setMessage={setLeaveMessage}
            style={leaveStyle} setStyle={setLeaveStyle}
            onSave={handleSaveSettings}
            {...shared}
        />
    );
}
