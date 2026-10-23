import React from 'react';
import MemberMessageForm from './MemberMessageForm';

const VARIABLES = [
    ['[USER]', 'Benutzername (keine Erwähnung — die Person ist nicht mehr auf dem Server)'],
    ['[SERVER]', 'Servername'],
    ['[MEMBER]', 'Mitgliederzahl nach dem Austritt'],
];

export default function LeaveTab({ leaveChannel, setLeaveChannel, leaveMessage, setLeaveMessage, leaveStyle, setLeaveStyle, handleSaveSettings, ...shared }) {
    return (
        <MemberMessageForm
            kind="leave"
            title="Abschiedsnachrichten"
            description="Wird gesendet, wenn ein Mitglied den Server verlässt."
            channelLabel="Abschieds-Kanal"
            variables={VARIABLES}
            note="[USER] ist hier der Benutzername, keine Erwähnung — die Person ist nicht mehr auf dem Server."
            channel={leaveChannel} setChannel={setLeaveChannel}
            message={leaveMessage} setMessage={setLeaveMessage}
            style={leaveStyle} setStyle={setLeaveStyle}
            onSave={handleSaveSettings}
            {...shared}
        />
    );
}
