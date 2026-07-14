// discord/bot/events/guildMemberUpdate.js
const { getAutoRoles } = require('../../database/db');

module.exports = {
    name: 'guildMemberUpdate',
    once: false,
    async execute(oldMember, newMember) {
        if (newMember.user.bot) return;

        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;

        const addedRoleIds = [...newRoles.keys()].filter(id => !oldRoles.has(id));
        const removedRoleIds = [...oldRoles.keys()].filter(id => !newRoles.has(id));

        if (addedRoleIds.length === 0 && removedRoleIds.length === 0) return;

        let autoRules;
        try {
            autoRules = getAutoRoles(newMember.guild.id).filter(r => r.enabled);
        } catch (e) {
            return;
        }

        // Rolle hinzugekommen → Assign-Rolle vergeben
        for (const triggerId of addedRoleIds) {
            const rules = autoRules.filter(r => r.triggerRoleId === triggerId);
            for (const rule of rules) {
                if (!newMember.roles.cache.has(rule.assignRoleId)) {
                    await newMember.roles.add(rule.assignRoleId).catch(e =>
                        console.error(`[AutoRole] Fehler beim Hinzufügen von ${rule.assignRoleId}:`, e.message)
                    );
                }
            }
        }

        // Rolle entfernt → Assign-Rolle auch entfernen
        for (const triggerId of removedRoleIds) {
            const rules = autoRules.filter(r => r.triggerRoleId === triggerId);
            for (const rule of rules) {
                if (newMember.roles.cache.has(rule.assignRoleId)) {
                    await newMember.roles.remove(rule.assignRoleId).catch(e =>
                        console.error(`[AutoRole] Fehler beim Entfernen von ${rule.assignRoleId}:`, e.message)
                    );
                }
            }
        }
    },
};
