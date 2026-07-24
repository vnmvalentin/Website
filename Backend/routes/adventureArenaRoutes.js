// backend/adventureArenaRoutes.js
// PvPvE Arena für adVentures: Server-autoritative Simulation über Socket.io.
// Spieler farmen Monster für XP/Level (diep.io-Prinzip), PvP ist erlaubt,
// bestes erreichtes Level + Kills landen im persistenten Leaderboard.

const express = require("express");
const fs = require("fs");
const path = require("path");

const LEADERBOARD_PATH = path.join(__dirname, "../data/adventure-arena.json");

const WORLD = { w: 3000, h: 3000 };
const TICK_MS = 50;          // 20Hz Physik
const SNAPSHOT_MS = 100;     // 10Hz Broadcast (Client interpoliert)
const MAX_MONSTERS = 45;
const MONSTER_RESPAWN_MS = 1500;
const RESPAWN_MS = 4000;
const MAX_PLAYERS = 16;

// Monster-Tiers — nutzen vorhandene Sprites im Frontend (animSet-Namen)
const MONSTER_TYPES = [
    { type: "slime",  hp: 40,  dmg: 8,  speed: 1.4, size: 20, xp: 15,  weight: 40 },
    { type: "goblin", hp: 85,  dmg: 12, speed: 2.0, size: 22, xp: 32,  weight: 30 },
    { type: "orc",    hp: 180, dmg: 18, speed: 1.6, size: 30, xp: 70,  weight: 16 },
    { type: "golem",  hp: 400, dmg: 26, speed: 1.1, size: 40, xp: 150, weight: 10 },
    { type: "yeti",   hp: 950, dmg: 40, speed: 1.5, size: 48, xp: 450, weight: 4 },
];
const WEIGHT_SUM = MONSTER_TYPES.reduce((s, m) => s + m.weight, 0);

// XP, die von Level n auf n+1 benötigt wird
function xpToNext(level) {
    return Math.floor(30 * Math.pow(level, 1.55));
}

function statsForLevel(level) {
    return {
        maxHp: 100 + (level - 1) * 12,
        damage: 10 + (level - 1) * 1.6,
        speed: 3.2 + Math.min(1.2, level * 0.03),
        fireDelay: Math.max(170, 320 - level * 4),
    };
}

function loadLeaderboard() {
    try {
        if (!fs.existsSync(LEADERBOARD_PATH)) return {};
        return JSON.parse(fs.readFileSync(LEADERBOARD_PATH, "utf8"));
    } catch { return {}; }
}
function saveLeaderboard(db) {
    try { fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify(db, null, 2)); } catch { /* ignore */ }
}

// ─── Arena-State (ein globaler Raum) ─────────────────────────────────────────
const arena = {
    players: new Map(),   // socketId → player
    monsters: new Map(),  // id → monster
    bullets: [],
    nextMonsterId: 1,
    nextBulletId: 1,
    tickTimer: null,
    snapshotTimer: null,
    io: null,
    lbDirty: false,
    lbSaveTimer: null,
};

function randPos(margin = 100) {
    return {
        x: margin + Math.random() * (WORLD.w - margin * 2),
        y: margin + Math.random() * (WORLD.h - margin * 2),
    };
}

function spawnMonster() {
    let r = Math.random() * WEIGHT_SUM;
    let def = MONSTER_TYPES[0];
    for (const m of MONSTER_TYPES) { r -= m.weight; if (r <= 0) { def = m; break; } }
    const pos = randPos(150);
    const id = arena.nextMonsterId++;
    arena.monsters.set(id, {
        id, type: def.type,
        x: pos.x, y: pos.y,
        hp: def.hp, maxHp: def.hp,
        dmg: def.dmg, speed: def.speed, size: def.size, xp: def.xp,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderUntil: 0,
        lastHit: 0,
        diedAt: 0,
    });
}

function grantXp(player, amount) {
    player.xp += amount;
    let leveled = false;
    while (player.xp >= xpToNext(player.level)) {
        player.xp -= xpToNext(player.level);
        player.level++;
        leveled = true;
    }
    if (leveled) {
        const st = statsForLevel(player.level);
        const hpRatio = player.hp / player.maxHp;
        Object.assign(player, st);
        // Levelup heilt anteilig +25%
        player.hp = Math.min(player.maxHp, player.maxHp * Math.min(1, hpRatio + 0.25));
        arena.io.to("arena").emit("arena:event", { type: "levelup", id: player.id, level: player.level, name: player.name });
        touchLeaderboard(player);
    }
}

// Leaderboard einmalig in den Speicher laden, Schreiben debounced
let leaderboardDb = null;
function getLeaderboardDb() {
    if (!leaderboardDb) leaderboardDb = loadLeaderboard();
    return leaderboardDb;
}
function touchLeaderboard(player) {
    if (!player.twitchId) return;
    const db = getLeaderboardDb();
    const entry = db[player.twitchId] || { name: player.name, bestLevel: 1, kills: 0 };
    entry.name = player.name;
    // deathLevel: beim Tod wird das Level reduziert — das VOR dem Tod erreichte Level zählt
    const reached = Math.max(player.level, player.deathLevel || 1);
    if (reached > entry.bestLevel) entry.bestLevel = reached;
    entry.kills = (entry.kills || 0) + (player.pendingKills || 0);
    player.pendingKills = 0;
    db[player.twitchId] = entry;
    arena.lbDirty = true;
    if (!arena.lbSaveTimer) {
        arena.lbSaveTimer = setTimeout(() => {
            arena.lbSaveTimer = null;
            if (arena.lbDirty) { saveLeaderboard(getLeaderboardDb()); arena.lbDirty = false; }
        }, 2000);
    }
}

function killPlayer(victim, killerName) {
    victim.dead = true;
    victim.respawnAt = Date.now() + RESPAWN_MS;
    // Level-Verlust beim Tod (diep.io-artig), aber nie unter 1
    victim.deathLevel = victim.level;
    victim.level = Math.max(1, Math.floor(victim.level * 0.6));
    victim.xp = 0;
    arena.io.to("arena").emit("arena:event", { type: "kill", victim: victim.name, killer: killerName });
    touchLeaderboard(victim);
}

function respawnPlayer(player) {
    const st = statsForLevel(player.level);
    const pos = randPos(200);
    Object.assign(player, st, {
        x: pos.x, y: pos.y,
        hp: st.maxHp,
        dead: false,
        respawnAt: 0,
        lastShot: 0,
    });
}

function tick() {
    const now = Date.now();

    // Monster nachspawnen
    if (arena.monsters.size < MAX_MONSTERS) {
        spawnMonster();
    }

    // ── Spieler bewegen + schießen ──
    for (const p of arena.players.values()) {
        if (p.dead) {
            if (now >= p.respawnAt) respawnPlayer(p);
            continue;
        }
        const len = Math.hypot(p.input.dx, p.input.dy);
        if (len > 0.01) {
            const nx = p.input.dx / Math.max(1, len);
            const ny = p.input.dy / Math.max(1, len);
            p.x = Math.max(20, Math.min(WORLD.w - 20, p.x + nx * p.speed));
            p.y = Math.max(20, Math.min(WORLD.h - 20, p.y + ny * p.speed));
            p.facingLeft = nx < 0 ? true : nx > 0 ? false : p.facingLeft;
        }
        if (p.input.shooting && now - p.lastShot > p.fireDelay) {
            p.lastShot = now;
            arena.bullets.push({
                id: arena.nextBulletId++,
                x: p.x, y: p.y,
                vx: Math.cos(p.input.aim) * 11,
                vy: Math.sin(p.input.aim) * 11,
                damage: p.damage,
                owner: p.id,
                life: 70,
            });
        }
    }

    // ── Monster-KI: aggro auf nächsten Spieler in Reichweite, sonst wandern ──
    for (const m of arena.monsters.values()) {
        let target = null, best = 320;
        for (const p of arena.players.values()) {
            if (p.dead) continue;
            const d = Math.hypot(p.x - m.x, p.y - m.y);
            if (d < best) { best = d; target = p; }
        }
        if (target) {
            const ang = Math.atan2(target.y - m.y, target.x - m.x);
            m.x += Math.cos(ang) * m.speed;
            m.y += Math.sin(ang) * m.speed;
            // Kontakt-Schaden (1 Hit/Sekunde)
            if (best < m.size + 22 && now - m.lastHit > 1000) {
                m.lastHit = now;
                target.hp -= m.dmg;
                if (target.hp <= 0) killPlayer(target, m.type.toUpperCase());
            }
        } else {
            if (now > m.wanderUntil) {
                m.wanderAngle = Math.random() * Math.PI * 2;
                m.wanderUntil = now + 1500 + Math.random() * 2500;
            }
            m.x += Math.cos(m.wanderAngle) * m.speed * 0.4;
            m.y += Math.sin(m.wanderAngle) * m.speed * 0.4;
        }
        m.x = Math.max(30, Math.min(WORLD.w - 30, m.x));
        m.y = Math.max(30, Math.min(WORLD.h - 30, m.y));
    }

    // ── Bullets ──
    const deadMonsters = [];
    arena.bullets = arena.bullets.filter((b) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        if (b.life <= 0 || b.x < 0 || b.x > WORLD.w || b.y < 0 || b.y > WORLD.h) return false;

        // Monster-Treffer
        for (const m of arena.monsters.values()) {
            if (Math.hypot(b.x - m.x, b.y - m.y) < m.size + 6) {
                m.hp -= b.damage;
                if (m.hp <= 0) {
                    deadMonsters.push(m.id);
                    const shooter = arena.players.get(b.owner);
                    if (shooter && !shooter.dead) grantXp(shooter, m.xp);
                }
                return false;
            }
        }
        // Spieler-Treffer (PvP)
        for (const p of arena.players.values()) {
            if (p.dead || p.id === b.owner) continue;
            if (Math.hypot(b.x - p.x, b.y - p.y) < 22 + 6) {
                p.hp -= b.damage;
                if (p.hp <= 0) {
                    const shooter = arena.players.get(b.owner);
                    const killerName = shooter ? shooter.name : "???";
                    if (shooter && !shooter.dead) {
                        shooter.pendingKills = (shooter.pendingKills || 0) + 1;
                        grantXp(shooter, Math.floor(xpToNext(p.level) * 0.6) + 25);
                        touchLeaderboard(shooter);
                    }
                    killPlayer(p, killerName);
                }
                return false;
            }
        }
        return true;
    });
    for (const id of deadMonsters) arena.monsters.delete(id);
}

function broadcastSnapshot() {
    const players = [];
    for (const p of arena.players.values()) {
        players.push({
            id: p.id, name: p.name, skin: p.skin,
            x: Math.round(p.x), y: Math.round(p.y),
            hp: Math.round(p.hp), maxHp: p.maxHp,
            level: p.level, xp: p.xp, xpNext: xpToNext(p.level),
            dead: p.dead, respawnAt: p.respawnAt || 0,
            facingLeft: !!p.facingLeft,
        });
    }
    const monsters = [];
    for (const m of arena.monsters.values()) {
        monsters.push({
            id: m.id, type: m.type,
            x: Math.round(m.x), y: Math.round(m.y),
            hp: Math.round(m.hp), maxHp: m.maxHp, size: m.size,
        });
    }
    const bullets = arena.bullets.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), o: b.owner }));
    arena.io.to("arena").emit("arena:snapshot", { players, monsters, bullets, ts: Date.now() });
}

function ensureLoopRunning() {
    if (arena.tickTimer) return;
    arena.tickTimer = setInterval(tick, TICK_MS);
    arena.snapshotTimer = setInterval(broadcastSnapshot, SNAPSHOT_MS);
}
function stopLoopIfEmpty() {
    if (arena.players.size > 0) return;
    clearInterval(arena.tickTimer); arena.tickTimer = null;
    clearInterval(arena.snapshotTimer); arena.snapshotTimer = null;
    arena.monsters.clear();
    arena.bullets = [];
}

// ─── Socket-Registrierung (aus index.js aufgerufen) ──────────────────────────
function registerArenaSocket(socket, io, getSessionForSocket) {
    arena.io = io;

    socket.on("arena:join", (payload = {}) => {
        const session = getSessionForSocket(socket);
        if (!session) {
            socket.emit("arena:error", { error: "Bitte zuerst mit Twitch anmelden." });
            return;
        }
        if (arena.players.size >= MAX_PLAYERS) {
            socket.emit("arena:error", { error: "Arena ist voll (max. 16 Spieler)." });
            return;
        }
        // Doppel-Join desselben Sockets ignorieren
        if (arena.players.has(socket.id)) return;

        const st = statsForLevel(1);
        const pos = randPos(200);
        const player = {
            id: socket.id,
            twitchId: session.twitchId,
            name: session.twitchLogin || "Spieler",
            skin: typeof payload.skin === "string" ? payload.skin.slice(0, 64) : "skins/player.png",
            x: pos.x, y: pos.y,
            hp: st.maxHp,
            level: 1, xp: 0,
            ...st,
            dead: false, respawnAt: 0,
            lastShot: 0,
            facingLeft: false,
            pendingKills: 0,
            input: { dx: 0, dy: 0, shooting: false, aim: 0 },
        };
        arena.players.set(socket.id, player);
        socket.join("arena");
        ensureLoopRunning();
        socket.emit("arena:init", { selfId: socket.id, world: WORLD });
        io.to("arena").emit("arena:event", { type: "join", name: player.name });
    });

    socket.on("arena:input", (input = {}) => {
        const p = arena.players.get(socket.id);
        if (!p) return;
        p.input.dx = Math.max(-1, Math.min(1, Number(input.dx) || 0));
        p.input.dy = Math.max(-1, Math.min(1, Number(input.dy) || 0));
        p.input.shooting = !!input.shooting;
        p.input.aim = Number.isFinite(Number(input.aim)) ? Number(input.aim) : p.input.aim;
    });

    const leave = () => {
        const p = arena.players.get(socket.id);
        if (!p) return;
        touchLeaderboard(p);
        arena.players.delete(socket.id);
        socket.leave("arena");
        if (arena.io) arena.io.to("arena").emit("arena:event", { type: "leave", name: p.name });
        stopLoopIfEmpty();
    };
    socket.on("arena:leave", leave);
    socket.on("disconnect", leave);
}

// ─── HTTP-Router (Leaderboard) ───────────────────────────────────────────────
function createArenaRouter() {
    const router = express.Router();
    router.get("/arena-leaderboard", (req, res) => {
        const db = getLeaderboardDb();
        const sorted = Object.values(db)
            .filter((e) => (e.bestLevel || 0) > 1 || (e.kills || 0) > 0)
            .sort((a, b) => (b.bestLevel || 0) - (a.bestLevel || 0) || (b.kills || 0) - (a.kills || 0))
            .slice(0, 25)
            .map((e) => ({ name: e.name, bestLevel: e.bestLevel || 1, kills: e.kills || 0 }));
        res.json(sorted);
    });
    router.get("/arena-status", (req, res) => {
        res.json({ online: arena.players.size, max: MAX_PLAYERS });
    });
    return router;
}

module.exports = { registerArenaSocket, createArenaRouter };
