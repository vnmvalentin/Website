// discord/loyalty/games.js
// Slash-Befehle und Knöpfe des Punkte-Systems: /punkte, /daily, /rangliste, /geben,
// /gamble (Glücksrad), /rakete (Crash mit Aussteigen-Knopf), /duell, /punkteadmin.
//
// Texte und Zahlenformat folgen der Sprache des Bots auf dem Server (bot/botTexts.js, loyalty). Sie hängen als
// cfg.t und cfg.locale an den Einstellungen (withLang) — so reicht überall weiter das eine cfg.
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const crypto = require('crypto');
const store = require('./store');
const { botText } = require('../bot/botText');

const COLOR = { win: 0x22c55e, lose: 0xef4444, gold: 0xfbbf24, info: 0x5865f2, idle: 0x2b2d31 };
const LOYALTY_COMMANDS = ['punkte', 'daily', 'rangliste', 'geben', 'gamble', 'rakete', 'duell', 'punkteadmin'];
// Diese Befehle gehen nur im Spiele-Kanal, falls einer gesetzt ist
const GAME_COMMANDS = ['daily', 'gamble', 'rakete', 'duell'];

/* ── Hilfen ─────────────────────────────────────────────────────────────── */

/** Einstellungen plus Texte und Zahlenformat des Servers. Neues Objekt — die gespeicherten Einstellungen bleiben unberührt. */
function withLang(cfg, guildId) {
    const all = botText(guildId);
    return { ...cfg, t: all.loyalty, locale: all.locale };
}

const fmt = (n, cfg) => Math.round(Number(n) || 0).toLocaleString(cfg.locale);
const fmtX = (m, cfg) => `${m.toLocaleString(cfg.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const money = (cfg, n) => `**${fmt(n, cfg)}** ${cfg.emoji ? `${cfg.emoji} ` : ''}${cfg.currency}`;
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
    if (bet < 0) return cfg.t.badBet;
    if (bet < cfg.minBet) return cfg.t.minBet(money(cfg, cfg.minBet));
    if (cfg.maxBet > 0 && bet > cfg.maxBet) return cfg.t.maxBet(money(cfg, cfg.maxBet));
    return null;
}

/** Prüft, ob das System an ist und der Kanal passt. Gibt die Einstellungen (mit Texten) oder null zurück. */
async function gate(interaction) {
    if (!interaction.guildId) {
        await ephemeral(interaction, botText(null).loyalty.onlyServers);
        return null;
    }
    const cfg = withLang(store.getConfig(interaction.guildId), interaction.guildId);
    if (!cfg.enabled) {
        await ephemeral(interaction, cfg.t.off);
        return null;
    }
    if (GAME_COMMANDS.includes(interaction.commandName) && cfg.gameChannel && interaction.channelId !== cfg.gameChannel) {
        const text = interaction.commandName === 'daily' ? cfg.t.dailyOnlyIn(cfg.gameChannel) : cfg.t.gamesOnlyIn(cfg.gameChannel);
        await ephemeral(interaction, text);
        return null;
    }
    return cfg;
}

/* ── /punkte ────────────────────────────────────────────────────────────── */

async function handlePunkte(interaction, cfg) {
    const { t } = cfg;
    const target = interaction.options.getUser('user') || interaction.user;
    if (target.bot) return ephemeral(interaction, t.botsNoPoints);
    const own = target.id === interaction.user.id;
    const u = own ? store.getUser(interaction.guildId, target.id) : store.peekUser(interaction.guildId, target.id);
    if (!u) return ephemeral(interaction, t.noneYet(target.username, cfg.currency));

    const member = own ? interaction.member : await interaction.guild?.members.fetch(target.id).catch(() => null);
    const name = member?.displayName || target.globalName || target.username;
    const games = u.wins + u.losses;
    const embed = new EmbedBuilder()
        .setColor(COLOR.info)
        .setAuthor({ name, iconURL: target.displayAvatarURL({ size: 64 }) })
        .setDescription(`${money(cfg, u.points)}\n${t.rank(store.rankOf(interaction.guildId, target.id))}`)
        .addFields(
            { name: t.fieldGames, value: games ? t.gamesValue(u.wins, u.losses) : t.gamesNone, inline: true },
            { name: t.fieldBiggest, value: u.biggest_win ? money(cfg, u.biggest_win) : '–', inline: true },
            { name: t.fieldStreak, value: u.daily_streak ? t.days(u.daily_streak) : '–', inline: true },
            { name: t.fieldVoice, value: t.voiceTime(u.voice_minutes), inline: true },
            { name: t.fieldMessages, value: fmt(u.messages, cfg), inline: true },
        );
    return interaction.reply({ embeds: [embed] });
}

/* ── /daily ─────────────────────────────────────────────────────────────── */

async function handleDaily(interaction, cfg) {
    const { t } = cfg;
    const r = store.claimDaily(interaction.guildId, interaction.user.id);
    if (!r.ok) {
        const midnight = nextBerlinMidnight();
        return ephemeral(interaction, t.dailyDone(Math.floor(midnight / 1000), r.streak));
    }
    const flames = '🔥'.repeat(Math.min(r.streak, 7));
    const embed = new EmbedBuilder()
        .setColor(COLOR.gold)
        .setTitle(t.dailyTitle)
        .setDescription(t.dailyBody(money(cfg, r.amount), r.streak, flames, money(cfg, r.points)))
        .setFooter({ text: r.streak < 7 ? t.dailyMore : t.dailyFull });
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
    const { t } = cfg;
    const page = Math.max(1, interaction.options.getInteger('seite') || 1);
    const rows = store.leaderboard(interaction.guildId, 10, (page - 1) * 10);
    if (!rows.length) return ephemeral(interaction, page > 1 ? t.noSuchPage : t.nobodyHas(cfg.currency));

    await interaction.guild?.members.fetch({ user: rows.map(r => r.user_id) }).catch(() => {});
    const medal = ['🥇', '🥈', '🥉'];
    const lines = rows.map((r, i) => {
        const place = (page - 1) * 10 + i + 1;
        const m = interaction.guild?.members.cache.get(r.user_id);
        const name = m?.displayName || t.formerMember;
        return `${medal[place - 1] || `\`#${place}\``} **${name}** — ${fmt(r.points, cfg)}`;
    });
    const mine = store.rankOf(interaction.guildId, interaction.user.id);
    const sum = store.summary(interaction.guildId);
    const embed = new EmbedBuilder()
        .setColor(COLOR.gold)
        .setTitle(t.boardTitle(cfg.currency))
        .setDescription(lines.join('\n'))
        .setFooter({ text: t.boardFooter(mine, fmt(sum.users, cfg), page) });
    return interaction.reply({ embeds: [embed] });
}

/* ── /geben ─────────────────────────────────────────────────────────────── */

async function handleGeben(interaction, cfg) {
    const { t } = cfg;
    const target = interaction.options.getUser('user', true);
    if (target.bot) return ephemeral(interaction, t.botsNoNeed);
    if (target.id === interaction.user.id) return ephemeral(interaction, t.notYourself);
    const balance = store.getUser(interaction.guildId, interaction.user.id).points;
    const amount = parseBet(interaction.options.getString('betrag', true), balance);
    if (amount <= 0) return ephemeral(interaction, t.badAmount);
    if (!store.spend(interaction.guildId, interaction.user.id, amount)) return ephemeral(interaction, t.onlyHave(money(cfg, balance)));
    store.addPoints(interaction.guildId, target.id, amount);
    return interaction.reply({ content: t.gives(`${interaction.user}`, `${target}`, money(cfg, amount)), allowedMentions: { users: [target.id] } });
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
    const { t } = cfg;
    const gid = interaction.guildId, uid = interaction.user.id;
    const balance = store.getUser(gid, uid).points;
    const bet = parseBet(interaction.options.getString('einsatz', true), balance);
    const err = betError(cfg, bet);
    if (err) return ephemeral(interaction, err);
    const allIn = bet === balance;
    if (!store.spend(gid, uid, bet)) return ephemeral(interaction, t.onlyHave(money(cfg, balance)));

    const roll = crypto.randomInt(0, 100);
    const result = roll < 2 ? 'jackpot' : roll < 50 ? 'gewonnen' : 'verloren';
    const payout = result === 'jackpot' ? bet * 5 : result === 'gewonnen' ? bet * 2 : 0;

    // Gutschrift sofort — das Rad ist nur die Show
    if (payout) store.addPoints(gid, uid, payout);
    store.recordGame(gid, uid, payout ? payout - bet : -bet);
    const after = store.getUser(gid, uid).points;

    // Zielfeld im Band, dann rückwärts die Zwischenstände
    const targets = STRIP.map((tile, i) => (tile === RESULT_TILE[result] ? i : -1)).filter(i => i >= 0);
    const final = targets[crypto.randomInt(0, targets.length)] + STRIP.length * 3;
    const frames = [final - 23, final - 11, final - 4, final - 1, final];
    const name = nameOf(interaction);
    const base = () => new EmbedBuilder()
        .setAuthor({ name: t.wheelAuthor(name), iconURL: interaction.user.displayAvatarURL({ size: 64 }) })
        .setFooter({ text: t.wheelFooter(fmt(bet, cfg), allIn) });

    await interaction.reply({ embeds: [base().setColor(COLOR.idle).setDescription(stripView(frames[0]))] });
    for (let i = 1; i < frames.length - 1; i++) {
        await sleep(650 + i * 150);
        await interaction.editReply({ embeds: [base().setColor(COLOR.idle).setDescription(stripView(frames[i]))] }).catch(() => {});
    }
    await sleep(1100);

    let line;
    if (result === 'jackpot') line = t.jackpot(money(cfg, payout - bet));
    else if (result === 'gewonnen') line = allIn ? t.greenAllIn(money(cfg, bet)) : t.green(money(cfg, bet));
    else line = allIn ? t.redAllIn(money(cfg, bet)) : t.red(money(cfg, bet));
    await interaction.editReply({
        embeds: [base()
            .setColor(result === 'verloren' ? COLOR.lose : result === 'jackpot' ? COLOR.gold : COLOR.win)
            .setDescription(`${stripView(frames[frames.length - 1])}\n\n${line}\n${t.balance(money(cfg, after))}`)],
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
    const { t } = cfg;
    const e = new EmbedBuilder().setTitle(t.rocketTitle);
    const lines = [...round.bets.values()].map(b => {
        if (b.cashedAt) return t.rocketCashed(b.name, fmtX(b.cashedAt, cfg), fmt(b.payout - b.bet, cfg));
        if (round.phase === 'done') return `💥 ~~${b.name}~~ · −${fmt(b.bet, cfg)}`;
        return `🧑‍🚀 **${b.name}** · ${fmt(b.bet, cfg)}${b.auto ? ` · Auto ${fmtX(b.auto, cfg)}` : ''}`;
    });
    if (round.phase === 'open') {
        e.setColor(COLOR.info).setDescription(
            `${t.rocketOpen(Math.floor(round.startsAt / 1000))}\n\n${lines.join('\n')}`);
    } else if (round.phase === 'flight') {
        const m = Math.min(multAt(round), round.crash);
        const height = Math.min(10, Math.floor(Math.log(m) / Math.log(1.35)));
        const track = `${'🟦'.repeat(height)}🚀${'⬛'.repeat(10 - height)}`;
        e.setColor(COLOR.gold).setDescription(`# ${fmtX(m, cfg)}\n${track}\n\n${lines.join('\n')}`)
            .setFooter({ text: t.rocketHint });
    } else {
        e.setColor(COLOR.lose).setDescription(`# 💥 ${fmtX(round.crash, cfg)}\n${t.rocketExploded}\n\n${lines.join('\n')}`);
    }
    return e;
}

function rocketButtons(round, cfg) {
    if (round.phase !== 'flight') return [];
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`lp_rk_${round.id}`).setLabel(cfg.t.cashOutButton).setEmoji('💰').setStyle(ButtonStyle.Success),
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
    const { t } = cfg;
    const gid = interaction.guildId, uid = interaction.user.id;
    const balance = store.getUser(gid, uid).points;
    const bet = parseBet(interaction.options.getString('einsatz', true), balance);
    const err = betError(cfg, bet);
    if (err) return ephemeral(interaction, err);
    const auto = interaction.options.getNumber('auto');
    if (auto !== null && (auto < 1.1 || auto > MAX_CRASH)) return ephemeral(interaction, t.autoRange(MAX_CRASH));

    let round = rockets.get(interaction.channelId);
    if (round && round.phase !== 'open') return ephemeral(interaction, t.rocketFlying);
    if (round && round.bets.has(uid)) return ephemeral(interaction, t.alreadyAboard);
    if (!store.spend(gid, uid, bet)) return ephemeral(interaction, t.onlyHave(money(cfg, balance)));

    const entry = { userId: uid, name: nameOf(interaction), bet, auto: auto ? Math.round(auto * 100) / 100 : null, cashedAt: null, payout: 0 };
    if (round) {
        round.bets.set(uid, entry);
        await round.message?.edit({ embeds: [rocketEmbed(round, cfg)] }).catch(() => {});
        return ephemeral(interaction, t.aboard(money(cfg, bet)));
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
    const edit = () => round.message?.edit({ embeds: [rocketEmbed(round, cfg)], components: rocketButtons(round, cfg) }).catch(() => {});
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
    const t = botText(interaction).loyalty;
    const id = interaction.customId.slice('lp_rk_'.length);
    const round = [...rockets.values()].find(r => r.id === id);
    if (!round || round.phase !== 'flight') return ephemeral(interaction, t.tooLate);
    const cfg = withLang(store.getConfig(round.guildId), round.guildId);
    const bet = round.bets.get(interaction.user.id);
    if (!bet) return ephemeral(interaction, t.notAboard);
    if (bet.cashedAt) return ephemeral(interaction, t.alreadyCashed(fmtX(bet.cashedAt, cfg)));
    const m = multAt(round);
    if (m >= round.crash) return ephemeral(interaction, t.exploded);
    const payout = cashOut(round, bet, m, cfg);
    return ephemeral(interaction, t.cashedOut(fmtX(bet.cashedAt, cfg), money(cfg, payout)));
}

/* ── /duell ─────────────────────────────────────────────────────────────── */

const DUEL_MS = 60_000;
const duels = new Map(); // id -> Duell

async function handleDuell(interaction, cfg) {
    const { t } = cfg;
    const gid = interaction.guildId, uid = interaction.user.id;
    const opponent = interaction.options.getUser('gegner', true);
    if (opponent.bot) return ephemeral(interaction, t.noBots);
    if (opponent.id === uid) return ephemeral(interaction, t.notSelf);
    const balance = store.getUser(gid, uid).points;
    const bet = parseBet(interaction.options.getString('einsatz', true), balance);
    const err = betError(cfg, bet);
    if (err) return ephemeral(interaction, err);
    if (balance < bet) return ephemeral(interaction, t.onlyHave(money(cfg, balance)));

    const duel = { id: crypto.randomBytes(5).toString('hex'), guildId: gid, from: uid, to: opponent.id, bet, done: false, fromName: nameOf(interaction) };
    duels.set(duel.id, duel);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`lp_du_ok_${duel.id}`).setLabel(t.acceptButton).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`lp_du_no_${duel.id}`).setLabel(t.declineButton).setStyle(ButtonStyle.Secondary),
    );
    const embed = new EmbedBuilder().setColor(COLOR.info).setTitle(t.duelTitle)
        .setDescription(t.duelChallenge(`${interaction.user}`, `${opponent}`, money(cfg, bet), Math.floor((Date.now() + DUEL_MS) / 1000)));
    await interaction.reply({ content: `${opponent}`, embeds: [embed], components: [row], allowedMentions: { users: [opponent.id] } });

    setTimeout(async () => {
        if (duel.done) return;
        duel.done = true;
        duels.delete(duel.id);
        await interaction.editReply({ content: '', embeds: [embed.setColor(COLOR.idle).setDescription(t.duelExpired(`${interaction.user}`, `${opponent}`))], components: [] }).catch(() => {});
    }, DUEL_MS);
}

async function handleDuelButton(interaction) {
    const accept = interaction.customId.startsWith('lp_du_ok_');
    const duel = duels.get(interaction.customId.slice(9));
    const tFallback = botText(interaction).loyalty;
    if (!duel || duel.done) return ephemeral(interaction, tFallback.duelOver);
    if (interaction.user.id !== duel.to && !(interaction.user.id === duel.from && !accept)) {
        return ephemeral(interaction, tFallback.duelNotYours);
    }
    const cfg = withLang(store.getConfig(duel.guildId), duel.guildId);
    const { t } = cfg;
    const base = new EmbedBuilder().setTitle(t.duelTitle);

    if (!accept) {
        duel.done = true;
        duels.delete(duel.id);
        const text = interaction.user.id === duel.from ? t.duelWithdrawn : t.duelDeclined;
        return interaction.update({ content: '', embeds: [base.setColor(COLOR.idle).setDescription(text)], components: [] });
    }

    // Beide Einsätze sicher abbuchen — fehlt einem das Geld, bekommt der andere seins zurück
    if (!store.spend(duel.guildId, duel.to, duel.bet)) return ephemeral(interaction, t.noFunds(money(cfg, duel.bet)));
    if (!store.spend(duel.guildId, duel.from, duel.bet)) {
        store.addPoints(duel.guildId, duel.to, duel.bet);
        duel.done = true;
        duels.delete(duel.id);
        return interaction.update({ content: '', embeds: [base.setColor(COLOR.idle).setDescription(t.duelCancelled(duel.from, cfg.currency))], components: [] });
    }
    duel.done = true;
    duels.delete(duel.id);

    await interaction.update({ content: '', embeds: [base.setColor(COLOR.gold).setDescription(t.coinFlying(duel.from, duel.to, money(cfg, duel.bet * 2)))], components: [] });
    await sleep(1800);
    const winner = crypto.randomInt(0, 2) === 0 ? duel.from : duel.to;
    const loser = winner === duel.from ? duel.to : duel.from;
    store.addPoints(duel.guildId, winner, duel.bet * 2);
    store.recordGame(duel.guildId, winner, duel.bet);
    store.recordGame(duel.guildId, loser, -duel.bet);
    await interaction.editReply({
        embeds: [base.setColor(COLOR.win).setDescription(t.duelWon(duel.from, duel.to, winner, money(cfg, duel.bet * 2)))],
    }).catch(() => {});
}

/* ── /punkteadmin ───────────────────────────────────────────────────────── */

async function handleAdmin(interaction, cfg) {
    const { t } = cfg;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return ephemeral(interaction, t.needManageGuild);
    }
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user', true);
    if (target.bot) return ephemeral(interaction, t.botsNoAccount);
    const amount = interaction.options.getInteger('betrag', true);
    let now;
    if (sub === 'geben') now = store.addPoints(interaction.guildId, target.id, amount);
    else if (sub === 'nehmen') now = store.addPoints(interaction.guildId, target.id, -amount);
    else now = store.setPoints(interaction.guildId, target.id, amount);
    return ephemeral(interaction, t.nowHas(`${target}`, money(cfg, now)));
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
