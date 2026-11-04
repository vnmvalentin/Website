// discord/loyalty/games.js
// Slash-Befehle und Knöpfe des Punkte-Systems: /punkte, /daily, /rangliste, /geben,
// /gamble (Glücksrad), /rakete (Crash mit Aussteigen-Knopf), /duell, /punkteadmin.
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const crypto = require('crypto');
const store = require('./store');

const COLOR = { win: 0x22c55e, lose: 0xef4444, gold: 0xfbbf24, info: 0x5865f2, idle: 0x2b2d31 };
const LOYALTY_COMMANDS = ['punkte', 'daily', 'rangliste', 'geben', 'gamble', 'rakete', 'duell', 'punkteadmin'];
// Diese Befehle gehen nur im Spiele-Kanal, falls einer gesetzt ist
const GAME_COMMANDS = ['daily', 'gamble', 'rakete', 'duell'];

/* ── Hilfen ─────────────────────────────────────────────────────────────── */

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('de-DE');
const fmtX = (m) => `${m.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const money = (cfg, n) => `**${fmt(n)}** ${cfg.emoji ? `${cfg.emoji} ` : ''}${cfg.currency}`;
const nameOf = (interaction, user = interaction.user) =>
    (user.id === interaction.user.id ? interaction.member?.displayName : null) || user.globalName || user.username;
const ephemeral = (interaction, content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});

/** "500", "1k", "2,5k", "half", "all", "25%" -> Punkte; -1 = ungültig. */
function parseBet(text, balance) {
    const t = String(text || '').trim().toLowerCase().replace(/\s/g, '');
    if (['all', 'alles', 'allin'].includes(t)) return balance;
    if (['half', 'hälfte', 'haelfte', 'halb'].includes(t)) return Math.floor(balance / 2);
    const pct = t.match(/^(\d+(?:[.,]\d+)?)%$/);
    if (pct) return Math.floor(balance * Math.min(100, Number(pct[1].replace(',', '.'))) / 100);
    const k = t.match(/^(\d+(?:[.,]\d+)?)k$/);
    if (k) return Math.floor(Number(k[1].replace(',', '.')) * 1000);
    if (/^\d{1,12}$/.test(t.replace(/\./g, ''))) return Number(t.replace(/\./g, ''));
    return -1;
}

function betError(cfg, bet) {
    if (bet < 0) return 'Ungültiger Einsatz — z. B. `100`, `1k`, `half`, `all` oder `25%`.';
    if (bet < cfg.minBet) return `Mindesteinsatz: ${money(cfg, cfg.minBet)}.`;
    if (cfg.maxBet > 0 && bet > cfg.maxBet) return `Höchsteinsatz: ${money(cfg, cfg.maxBet)}.`;
    return null;
}

/** Prüft, ob das System an ist und der Kanal passt. Gibt die Einstellungen oder null zurück. */
async function gate(interaction) {
    if (!interaction.guildId) {
        await ephemeral(interaction, 'Das Punkte-System gibt es nur auf Servern.');
        return null;
    }
    const cfg = store.getConfig(interaction.guildId);
    if (!cfg.enabled) {
        await ephemeral(interaction, 'Das Punkte-System ist auf diesem Server aus. Ein Admin kann es im Dashboard unter **Punkte** einschalten.');
        return null;
    }
    if (GAME_COMMANDS.includes(interaction.commandName) && cfg.gameChannel && interaction.channelId !== cfg.gameChannel) {
        const what = interaction.commandName === 'daily' ? 'Den Tagesbonus gibt es' : 'Spiele gehen';
        await ephemeral(interaction, `${what} nur in <#${cfg.gameChannel}>.`);
        return null;
    }
    return cfg;
}

/* ── /punkte ────────────────────────────────────────────────────────────── */

async function handlePunkte(interaction, cfg) {
    const target = interaction.options.getUser('user') || interaction.user;
    if (target.bot) return ephemeral(interaction, 'Bots sammeln keine Punkte.');
    const own = target.id === interaction.user.id;
    const u = own ? store.getUser(interaction.guildId, target.id) : store.peekUser(interaction.guildId, target.id);
    if (!u) return ephemeral(interaction, `${target.username} hat noch keine ${cfg.currency}.`);

    const member = own ? interaction.member : await interaction.guild?.members.fetch(target.id).catch(() => null);
    const name = member?.displayName || target.globalName || target.username;
    const games = u.wins + u.losses;
    const embed = new EmbedBuilder()
        .setColor(COLOR.info)
        .setAuthor({ name, iconURL: target.displayAvatarURL({ size: 64 }) })
        .setDescription(`${money(cfg, u.points)}\nPlatz **#${store.rankOf(interaction.guildId, target.id)}** auf diesem Server`)
        .addFields(
            { name: 'Spiele', value: games ? `${u.wins} gewonnen · ${u.losses} verloren` : 'noch keine', inline: true },
            { name: 'Größter Gewinn', value: u.biggest_win ? money(cfg, u.biggest_win) : '–', inline: true },
            { name: 'Daily-Serie', value: u.daily_streak ? `${u.daily_streak} ${u.daily_streak === 1 ? 'Tag' : 'Tage'}` : '–', inline: true },
            { name: 'Im Voice', value: u.voice_minutes >= 60 ? `${Math.floor(u.voice_minutes / 60)} Std ${u.voice_minutes % 60} Min` : `${u.voice_minutes} Min`, inline: true },
            { name: 'Nachrichten', value: fmt(u.messages), inline: true },
        );
    return interaction.reply({ embeds: [embed] });
}

/* ── /daily ─────────────────────────────────────────────────────────────── */

async function handleDaily(interaction, cfg) {
    const r = store.claimDaily(interaction.guildId, interaction.user.id);
    if (!r.ok) {
        const midnight = nextBerlinMidnight();
        return ephemeral(interaction, `Heute schon abgeholt. Nächster Bonus <t:${Math.floor(midnight / 1000)}:R>. Serie: **${r.streak}**`);
    }
    const flames = '🔥'.repeat(Math.min(r.streak, 7));
    const embed = new EmbedBuilder()
        .setColor(COLOR.gold)
        .setTitle('Tagesbonus abgeholt')
        .setDescription(`+${money(cfg, r.amount)}\nSerie: **${r.streak}** ${r.streak === 1 ? 'Tag' : 'Tage'} ${flames}\nKontostand: ${money(cfg, r.points)}`)
        .setFooter({ text: r.streak < 7 ? 'Komm morgen wieder — jeder Tag in Folge gibt mehr (bis 7 Tage).' : 'Volle Serie! Bleib dran.' });
    return interaction.reply({ embeds: [embed] });
}

function nextBerlinMidnight(now = Date.now()) {
    // Ab jetzt in 15-Minuten-Schritten suchen, wann der Berliner Tag wechselt (Sommerzeit-sicher)
    const today = store.berlinDay(now);
    let t = now - (now % (15 * 60 * 1000));
    while (store.berlinDay(t) === today) t += 15 * 60 * 1000;
    return t;
}

/* ── /rangliste ─────────────────────────────────────────────────────────── */

async function handleRangliste(interaction, cfg) {
    const page = Math.max(1, interaction.options.getInteger('seite') || 1);
    const rows = store.leaderboard(interaction.guildId, 10, (page - 1) * 10);
    if (!rows.length) return ephemeral(interaction, page > 1 ? 'So viele Seiten gibt es nicht.' : `Noch hat niemand ${cfg.currency}.`);

    await interaction.guild?.members.fetch({ user: rows.map(r => r.user_id) }).catch(() => {});
    const medal = ['🥇', '🥈', '🥉'];
    const lines = rows.map((r, i) => {
        const place = (page - 1) * 10 + i + 1;
        const m = interaction.guild?.members.cache.get(r.user_id);
        const name = m?.displayName || 'Ehemaliges Mitglied';
        return `${medal[place - 1] || `\`#${place}\``} **${name}** — ${fmt(r.points)}`;
    });
    const mine = store.rankOf(interaction.guildId, interaction.user.id);
    const sum = store.summary(interaction.guildId);
    const embed = new EmbedBuilder()
        .setColor(COLOR.gold)
        .setTitle(`Rangliste · ${cfg.currency}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${mine ? `Dein Platz: #${mine} · ` : ''}${fmt(sum.users)} Mitglieder · Seite ${page}` });
    return interaction.reply({ embeds: [embed] });
}

/* ── /geben ─────────────────────────────────────────────────────────────── */

async function handleGeben(interaction, cfg) {
    const target = interaction.options.getUser('user', true);
    if (target.bot) return ephemeral(interaction, 'Bots brauchen keine Punkte.');
    if (target.id === interaction.user.id) return ephemeral(interaction, 'An dich selbst geht nicht.');
    const balance = store.getUser(interaction.guildId, interaction.user.id).points;
    const amount = parseBet(interaction.options.getString('betrag', true), balance);
    if (amount <= 0) return ephemeral(interaction, 'Ungültiger Betrag.');
    if (!store.spend(interaction.guildId, interaction.user.id, amount)) return ephemeral(interaction, `Du hast nur ${money(cfg, balance)}.`);
    store.addPoints(interaction.guildId, target.id, amount);
    return interaction.reply({ content: `${interaction.user} schenkt ${target} ${money(cfg, amount)}.`, allowedMentions: { users: [target.id] } });
}

/* ── /gamble: Glücksrad ─────────────────────────────────────────────────── */
// Grün 48 % doppelt, Gold 2 % Jackpot x5, Rot 50 % weg. Das Band hat genau dieses Verhältnis.

const STRIP = (() => {
    const s = [];
    for (let i = 0; i < 49; i++) s.push(i % 2 === 0 ? '🟥' : '🟩'); // 25 rot, 24 grün
    s.splice(24, 0, '🟨'); // 1 gold
    return s; // 50 Felder
})();
const RESULT_TILE = { verloren: '🟥', gewonnen: '🟩', jackpot: '🟨' };

function stripView(pos) {
    const at = (i) => STRIP[((i % STRIP.length) + STRIP.length) % STRIP.length];
    const row = [];
    for (let i = pos - 3; i <= pos + 3; i++) row.push(at(i));
    return `⬛⬛⬛🔻⬛⬛⬛\n${row.join('')}`;
}

async function handleGamble(interaction, cfg) {
    const gid = interaction.guildId, uid = interaction.user.id;
    const balance = store.getUser(gid, uid).points;
    const bet = parseBet(interaction.options.getString('einsatz', true), balance);
    const err = betError(cfg, bet);
    if (err) return ephemeral(interaction, err);
    const allIn = bet === balance;
    if (!store.spend(gid, uid, bet)) return ephemeral(interaction, `Du hast nur ${money(cfg, balance)}.`);

    const roll = crypto.randomInt(0, 100);
    const result = roll < 2 ? 'jackpot' : roll < 50 ? 'gewonnen' : 'verloren';
    const payout = result === 'jackpot' ? bet * 5 : result === 'gewonnen' ? bet * 2 : 0;

    // Gutschrift sofort — das Rad ist nur die Show
    if (payout) store.addPoints(gid, uid, payout);
    store.recordGame(gid, uid, payout ? payout - bet : -bet);
    const after = store.getUser(gid, uid).points;

    // Zielfeld im Band, dann rückwärts die Zwischenstände
    const targets = STRIP.map((t, i) => (t === RESULT_TILE[result] ? i : -1)).filter(i => i >= 0);
    const final = targets[crypto.randomInt(0, targets.length)] + STRIP.length * 3;
    const frames = [final - 23, final - 11, final - 4, final - 1, final];
    const name = nameOf(interaction);
    const base = () => new EmbedBuilder()
        .setAuthor({ name: `${name} dreht am Glücksrad`, iconURL: interaction.user.displayAvatarURL({ size: 64 }) })
        .setFooter({ text: `Einsatz ${fmt(bet)}${allIn ? ' · ALL IN' : ''} · 🟩 doppelt · 🟥 weg · 🟨 Jackpot x5` });

    await interaction.reply({ embeds: [base().setColor(COLOR.idle).setDescription(stripView(frames[0]))] });
    for (let i = 1; i < frames.length - 1; i++) {
        await sleep(650 + i * 150);
        await interaction.editReply({ embeds: [base().setColor(COLOR.idle).setDescription(stripView(frames[i]))] }).catch(() => {});
    }
    await sleep(1100);

    let line;
    if (result === 'jackpot') line = `🟨 **JACKPOT!** +${money(cfg, payout - bet)}`;
    else if (result === 'gewonnen') line = allIn ? `🟩 **ALL IN und verdoppelt!** +${money(cfg, bet)}` : `🟩 **Grün!** +${money(cfg, bet)}`;
    else line = allIn ? `🟥 **ALL IN … und weg.** −${money(cfg, bet)}` : `🟥 **Rot.** −${money(cfg, bet)}`;
    await interaction.editReply({
        embeds: [base()
            .setColor(result === 'verloren' ? COLOR.lose : result === 'jackpot' ? COLOR.gold : COLOR.win)
            .setDescription(`${stripView(frames[frames.length - 1])}\n\n${line}\nKontostand: ${money(cfg, after)}`)],
    }).catch(() => {});
}

/* ── /rakete: Crash mit Aussteigen-Knopf ────────────────────────────────── */
// Eine Runde je Kanal. Die erste /rakete öffnet die Anmeldung, nach LOBBY_MS hebt sie ab.
// Multiplikator = e^(GROWTH * Sekunden). Wer rechtzeitig "Aussteigen" drückt, bekommt Einsatz x Multiplikator.

const LOBBY_MS = 20_000;
const TICK_MS = 1_500;
const GROWTH = 0.1;
const HOUSE_EDGE = 0.04;
const MAX_CRASH = 100;
const rockets = new Map(); // channelId -> Runde

const multAt = (round, now = Date.now()) => Math.exp(GROWTH * Math.max(0, now - round.launchedAt) / 1000);

function rocketEmbed(round, cfg) {
    const e = new EmbedBuilder().setTitle('🚀 Rakete');
    const lines = [...round.bets.values()].map(b => {
        if (b.cashedAt) return `🟩 **${b.name}** stieg bei ${fmtX(b.cashedAt)} aus · +${fmt(b.payout - b.bet)}`;
        if (round.phase === 'done') return `💥 ~~${b.name}~~ · −${fmt(b.bet)}`;
        return `🧑‍🚀 **${b.name}** · ${fmt(b.bet)}${b.auto ? ` · Auto ${fmtX(b.auto)}` : ''}`;
    });
    if (round.phase === 'open') {
        e.setColor(COLOR.info).setDescription(
            `Start <t:${Math.floor(round.startsAt / 1000)}:R> · Einsteigen mit \`/rakete einsatz\`\n\n${lines.join('\n')}`);
    } else if (round.phase === 'flight') {
        const m = Math.min(multAt(round), round.crash);
        const height = Math.min(10, Math.floor(Math.log(m) / Math.log(1.35)));
        const track = `${'🟦'.repeat(height)}🚀${'⬛'.repeat(10 - height)}`;
        e.setColor(COLOR.gold).setDescription(`# ${fmtX(m)}\n${track}\n\n${lines.join('\n')}`)
            .setFooter({ text: 'Drück "Aussteigen", bevor sie explodiert!' });
    } else {
        e.setColor(COLOR.lose).setDescription(`# 💥 ${fmtX(round.crash)}\nDie Rakete ist explodiert.\n\n${lines.join('\n')}`);
    }
    return e;
}

function rocketButtons(round) {
    if (round.phase !== 'flight') return [];
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`lp_rk_${round.id}`).setLabel('Aussteigen').setEmoji('💰').setStyle(ButtonStyle.Success),
    )];
}

function cashOut(round, bet, m, cfg) {
    bet.cashedAt = Math.floor(m * 100) / 100;
    bet.payout = Math.floor(bet.bet * bet.cashedAt);
    store.addPoints(round.guildId, bet.userId, bet.payout);
    store.recordGame(round.guildId, bet.userId, bet.payout - bet.bet);
    return bet.payout;
}

async function handleRakete(interaction, cfg) {
    const gid = interaction.guildId, uid = interaction.user.id;
    const balance = store.getUser(gid, uid).points;
    const bet = parseBet(interaction.options.getString('einsatz', true), balance);
    const err = betError(cfg, bet);
    if (err) return ephemeral(interaction, err);
    const auto = interaction.options.getNumber('auto');
    if (auto !== null && (auto < 1.1 || auto > MAX_CRASH)) return ephemeral(interaction, `Auto-Aussteigen muss zwischen 1,1 und ${MAX_CRASH} liegen.`);

    let round = rockets.get(interaction.channelId);
    if (round && round.phase !== 'open') return ephemeral(interaction, 'Die Rakete fliegt gerade — gleich geht die nächste Runde auf.');
    if (round && round.bets.has(uid)) return ephemeral(interaction, 'Du bist schon an Bord.');
    if (!store.spend(gid, uid, bet)) return ephemeral(interaction, `Du hast nur ${money(cfg, balance)}.`);

    const entry = { userId: uid, name: nameOf(interaction), bet, auto: auto ? Math.round(auto * 100) / 100 : null, cashedAt: null, payout: 0 };
    if (round) {
        round.bets.set(uid, entry);
        await round.message?.edit({ embeds: [rocketEmbed(round, cfg)] }).catch(() => {});
        return ephemeral(interaction, `Du bist an Bord mit ${money(cfg, bet)}.`);
    }

    round = {
        id: crypto.randomBytes(5).toString('hex'),
        guildId: gid, channelId: interaction.channelId,
        phase: 'open', startsAt: Date.now() + LOBBY_MS, launchedAt: 0, crash: 1,
        bets: new Map([[uid, entry]]), message: null,
    };
    rockets.set(interaction.channelId, round);
    const { resource } = await interaction.reply({ embeds: [rocketEmbed(round, cfg)], withResponse: true });
    round.message = resource?.message || null;
    setTimeout(() => flyRocket(round, cfg).catch(e => {
        console.error('[Punkte] Rakete:', e);
        refundRocket(round);
    }), LOBBY_MS);
}

function refundRocket(round) {
    for (const b of round.bets.values()) if (!b.cashedAt && round.phase !== 'done') store.addPoints(round.guildId, b.userId, b.bet);
    round.phase = 'done';
    rockets.delete(round.channelId);
}

async function flyRocket(round, cfg) {
    // Gleichverteilte Absturzstelle mit Hausvorteil; ab und zu explodiert sie sofort
    const u = crypto.randomInt(0, 1_000_000) / 1_000_000;
    round.crash = Math.max(1, Math.min(MAX_CRASH, Math.floor(((1 - HOUSE_EDGE) / (1 - u)) * 100) / 100));
    round.launchedAt = Date.now();
    round.phase = 'flight';
    const edit = () => round.message?.edit({ embeds: [rocketEmbed(round, cfg)], components: rocketButtons(round) }).catch(() => {});
    await edit();

    while (round.phase === 'flight') {
        await sleep(TICK_MS);
        const m = multAt(round);
        // Auto-Aussteiger, deren Ziel vor der Explosion liegt
        for (const b of round.bets.values()) {
            if (!b.cashedAt && b.auto && b.auto <= Math.min(m, round.crash) && b.auto < round.crash + 1e-9) cashOut(round, b, b.auto, cfg);
        }
        if (m >= round.crash) {
            round.phase = 'done';
            for (const b of round.bets.values()) if (!b.cashedAt) store.recordGame(round.guildId, b.userId, -b.bet);
        }
        await edit();
    }
    rockets.delete(round.channelId);
}

async function handleRocketButton(interaction) {
    const id = interaction.customId.slice('lp_rk_'.length);
    const round = [...rockets.values()].find(r => r.id === id);
    if (!round || round.phase !== 'flight') return ephemeral(interaction, 'Zu spät — die Runde ist vorbei.');
    const bet = round.bets.get(interaction.user.id);
    if (!bet) return ephemeral(interaction, 'Du bist in dieser Runde nicht an Bord.');
    if (bet.cashedAt) return ephemeral(interaction, `Du bist schon bei ${fmtX(bet.cashedAt)} ausgestiegen.`);
    const m = multAt(round);
    if (m >= round.crash) return ephemeral(interaction, '💥 Zu spät — die Rakete ist schon explodiert.');
    const cfg = store.getConfig(round.guildId);
    const payout = cashOut(round, bet, m, cfg);
    return ephemeral(interaction, `💰 Ausgestiegen bei **${fmtX(bet.cashedAt)}** — du bekommst ${money(cfg, payout)}.`);
}

/* ── /duell ─────────────────────────────────────────────────────────────── */

const DUEL_MS = 60_000;
const duels = new Map(); // id -> Duell

async function handleDuell(interaction, cfg) {
    const gid = interaction.guildId, uid = interaction.user.id;
    const opponent = interaction.options.getUser('gegner', true);
    if (opponent.bot) return ephemeral(interaction, 'Gegen Bots kannst du nicht spielen.');
    if (opponent.id === uid) return ephemeral(interaction, 'Gegen dich selbst geht nicht.');
    const balance = store.getUser(gid, uid).points;
    const bet = parseBet(interaction.options.getString('einsatz', true), balance);
    const err = betError(cfg, bet);
    if (err) return ephemeral(interaction, err);
    if (balance < bet) return ephemeral(interaction, `Du hast nur ${money(cfg, balance)}.`);

    const duel = { id: crypto.randomBytes(5).toString('hex'), guildId: gid, from: uid, to: opponent.id, bet, done: false, fromName: nameOf(interaction) };
    duels.set(duel.id, duel);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`lp_du_ok_${duel.id}`).setLabel('Annehmen').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`lp_du_no_${duel.id}`).setLabel('Ablehnen').setStyle(ButtonStyle.Secondary),
    );
    const embed = new EmbedBuilder().setColor(COLOR.info).setTitle('⚔️ Duell')
        .setDescription(`${interaction.user} fordert ${opponent} heraus — um ${money(cfg, bet)}.\nDie Münze entscheidet, der Gewinner bekommt alles.\nLäuft ab <t:${Math.floor((Date.now() + DUEL_MS) / 1000)}:R>.`);
    await interaction.reply({ content: `${opponent}`, embeds: [embed], components: [row], allowedMentions: { users: [opponent.id] } });

    setTimeout(async () => {
        if (duel.done) return;
        duel.done = true;
        duels.delete(duel.id);
        await interaction.editReply({ content: '', embeds: [embed.setColor(COLOR.idle).setDescription(`${interaction.user} gegen ${opponent}: niemand hat angenommen.`)], components: [] }).catch(() => {});
    }, DUEL_MS);
}

async function handleDuelButton(interaction) {
    const accept = interaction.customId.startsWith('lp_du_ok_');
    const duel = duels.get(interaction.customId.slice(9));
    if (!duel || duel.done) return ephemeral(interaction, 'Dieses Duell ist vorbei.');
    if (interaction.user.id !== duel.to && !(interaction.user.id === duel.from && !accept)) {
        return ephemeral(interaction, 'Das Duell ist nicht für dich.');
    }
    const cfg = store.getConfig(duel.guildId);
    const base = new EmbedBuilder().setTitle('⚔️ Duell');

    if (!accept) {
        duel.done = true;
        duels.delete(duel.id);
        const who = interaction.user.id === duel.from ? 'zurückgezogen' : 'abgelehnt';
        return interaction.update({ content: '', embeds: [base.setColor(COLOR.idle).setDescription(`Duell ${who}.`)], components: [] });
    }

    // Beide Einsätze sicher abbuchen — fehlt einem das Geld, bekommt der andere seins zurück
    if (!store.spend(duel.guildId, duel.to, duel.bet)) return ephemeral(interaction, `Du hast keine ${money(cfg, duel.bet)}.`);
    if (!store.spend(duel.guildId, duel.from, duel.bet)) {
        store.addPoints(duel.guildId, duel.to, duel.bet);
        duel.done = true;
        duels.delete(duel.id);
        return interaction.update({ content: '', embeds: [base.setColor(COLOR.idle).setDescription(`<@${duel.from}> hat die ${cfg.currency} nicht mehr. Duell abgesagt.`)], components: [] });
    }
    duel.done = true;
    duels.delete(duel.id);

    await interaction.update({ content: '', embeds: [base.setColor(COLOR.gold).setDescription(`<@${duel.from}> gegen <@${duel.to}> um ${money(cfg, duel.bet * 2)}\n\n🪙 Die Münze fliegt …`)], components: [] });
    await sleep(1800);
    const winner = crypto.randomInt(0, 2) === 0 ? duel.from : duel.to;
    const loser = winner === duel.from ? duel.to : duel.from;
    store.addPoints(duel.guildId, winner, duel.bet * 2);
    store.recordGame(duel.guildId, winner, duel.bet);
    store.recordGame(duel.guildId, loser, -duel.bet);
    await interaction.editReply({
        embeds: [base.setColor(COLOR.win).setDescription(`<@${duel.from}> gegen <@${duel.to}>\n\n🏆 <@${winner}> gewinnt ${money(cfg, duel.bet * 2)}!`)],
    }).catch(() => {});
}

/* ── /punkteadmin ───────────────────────────────────────────────────────── */

async function handleAdmin(interaction, cfg) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return ephemeral(interaction, 'Dafür brauchst du die Berechtigung „Server verwalten“.');
    }
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user', true);
    if (target.bot) return ephemeral(interaction, 'Bots haben kein Konto.');
    const amount = interaction.options.getInteger('betrag', true);
    let now;
    if (sub === 'geben') now = store.addPoints(interaction.guildId, target.id, amount);
    else if (sub === 'nehmen') now = store.addPoints(interaction.guildId, target.id, -amount);
    else now = store.setPoints(interaction.guildId, target.id, amount);
    return ephemeral(interaction, `${target} hat jetzt ${money(cfg, now)}.`);
}

/* ── Verteiler ──────────────────────────────────────────────────────────── */

async function handleLoyaltyCommand(interaction) {
    const cfg = await gate(interaction);
    if (!cfg) return;
    switch (interaction.commandName) {
        case 'punkte': return handlePunkte(interaction, cfg);
        case 'daily': return handleDaily(interaction, cfg);
        case 'rangliste': return handleRangliste(interaction, cfg);
        case 'geben': return handleGeben(interaction, cfg);
        case 'gamble': return handleGamble(interaction, cfg);
        case 'rakete': return handleRakete(interaction, cfg);
        case 'duell': return handleDuell(interaction, cfg);
        case 'punkteadmin': return handleAdmin(interaction, cfg);
        default: return undefined;
    }
}

async function handleLoyaltyButton(interaction) {
    if (interaction.customId.startsWith('lp_rk_')) return handleRocketButton(interaction);
    if (interaction.customId.startsWith('lp_du_')) return handleDuelButton(interaction);
    return undefined;
}

module.exports = {
    LOYALTY_COMMANDS, handleLoyaltyCommand, handleLoyaltyButton,
    parseBet, STRIP, // für Prüfstände
};
