// giveaways/discordPost.js — der Beitrag eines Giveaways im Discord (mit Knopf „Teilnehmen“) und der Knopf selbst.
// Der Beitrag entsteht beim Anlegen im eingestellten Kanal (Giveaway-Seite → Einstellungen) und wird bei neuen
// Teilnehmern höchstens alle 20 Sekunden aufgefrischt; nach der Ziehung stehen dort die Gewinner, der Knopf ist weg.
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, escapeMarkdown } = require('discord.js');
const { texte } = require('./texte');

const KNOPF_PREFIX = 'gw_join:';

/** @param {{ giveaway: object, url: string, lang: string }} daten  giveaway = core.publicView */
function baueNachricht({ giveaway: g, url, lang }) {
  const t = texte(lang);
  const unix = Math.floor(g.endDate / 1000);
  const wege = [t.postWegWebsite];
  if (g.wege.chat && g.stichwort) wege.push(t.postWegChat(g.stichwort));
  if (g.wege.discord && g.zustand === 'offen') wege.push(t.postWegDiscord);
  const bed = [];
  if (g.bedingungen.follow) bed.push(t.postBed.follow);
  if (g.bedingungen.discord) bed.push(t.postBed.discord);
  if (g.bedingungen.streams > 0) bed.push(t.postBed.streams(g.bedingungen.streams));

  const embed = new EmbedBuilder()
    .setColor(g.zustand === 'gezogen' ? 0xf59e0b : 0x8b5cf6)
    .setTitle(t.postTitel(escapeMarkdown(g.title)))
    .setURL(url)
    .setFooter({ text: t.postDabei(g.count) });
  if (g.prize) embed.addFields({ name: t.postGewinn, value: escapeMarkdown(g.prize) });
  if (g.zustand === 'gezogen') {
    const namen = g.winners.map((w) => `**${escapeMarkdown(w.name)}**`).join(', ');
    embed.addFields({ name: t.postGewinner, value: namen || '—' });
  } else {
    embed.addFields(
      { name: g.zustand === 'offen' ? t.postEnde : t.postEndeVorbei, value: `<t:${unix}:R>`, inline: true },
      { name: t.postWege, value: wege.join('\n'), inline: true },
      { name: t.postBedingungen, value: bed.length ? bed.map((b) => `• ${b}`).join('\n') : t.postKeine },
    );
    if (g.zustand === 'wartet') embed.setDescription(t.postWartet);
  }

  const knoepfe = [];
  if (g.zustand === 'offen' && g.wege.discord) {
    knoepfe.push(new ButtonBuilder().setCustomId(`${KNOPF_PREFIX}${g.id}`).setStyle(ButtonStyle.Primary).setLabel(t.postKnopf).setEmoji('🎁'));
  }
  knoepfe.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t.postWebsite).setURL(url));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(...knoepfe)] };
}

/** Antwort auf einen Knopfdruck, nur für den Drückenden sichtbar. Sprache nach der Discord-Sprache des Nutzers. */
async function handleGiveawayButton(interaction) {
  const lang = String(interaction.locale || '').startsWith('de') ? 'de' : 'en';
  const t = texte(lang);
  const antworte = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  const dienst = require('./dienst').aktiv();
  if (!dienst) return antworte(t.knopfVorbei);
  // Bedingungen prüfen kann ein paar Sekunden dauern (Twitch, Discord) — Discord will binnen 3 s eine Antwort
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const sag = (content) => interaction.editReply({ content }).catch(() => {});
  const id = interaction.customId.slice(KNOPF_PREFIX.length);
  const user = interaction.user;
  const name = interaction.member?.displayName || user.globalName || user.username;
  const avatar = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 128 }) : '';
  const res = await dienst.mitmachen(id, { discordId: user.id, name, avatar }, 'discord');
  if (res.ok) return sag(res.neu ? t.knopfDabei(res.title || '') : t.knopfSchon);
  if (res.error === 'conditions') {
    const zeilen = res.ergebnisse.filter((e) => !e.ok).map((e) => {
      const g = t.knopfGrund[e.grund];
      return `• ${typeof g === 'function' ? g(e.wert || 0, e.noetig || 0) : g}`;
    });
    return sag(`${t.knopfFehlt}\n${zeilen.join('\n')}`);
  }
  if (res.error === 'way_closed') return sag(t.knopfWegZu);
  return sag(t.knopfVorbei);
}

module.exports = { baueNachricht, handleGiveawayButton, KNOPF_PREFIX };
