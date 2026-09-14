// src/pages/Adventure/ArenaEngine.js
// Client für den PvPvE Arena-Modus: sendet Inputs an den Server,
// interpoliert Server-Snapshots und rendert die Welt auf ein Canvas.
// Die Simulation läuft komplett server-autoritativ (adventureArenaRoutes.js).

const ASSET_BASE = "/assets/adventure/";

// Monster-Typ → Sprite-Datei (idle) — nutzt vorhandene Assets
const MONSTER_SPRITES = {
    slime: "boss1/slime.png",
    goblin: "dungeon/goblin3.png",
    orc: "dungeon/orc3.png",
    golem: "desert/golem.png",
    yeti: "ice/yeti.png",
};

export default class ArenaEngine {
    constructor(canvas, socket, { skinFile, onHud }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.socket = socket;
        this.onHud = onHud;
        this.skinFile = skinFile || "skins/player.png";

        this.selfId = null;
        this.world = { w: 3000, h: 3000 };
        this.snapshots = []; // die letzten 2 Snapshots für Interpolation
        this.running = false;
        this.zoom = Math.max(1.1, Math.min(canvas.width / 1600, 2));

        this.keys = { w: false, a: false, s: false, d: false };
        this.mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };

        this.images = new Map();
        this.floor = this._img("stagetheme/floor_cave.png");
        this.projectile = this._img("projectiles/projectile.png");
        Object.values(MONSTER_SPRITES).forEach((f) => this._img(f));
        this._img(this.skinFile);

        this._lastHudPush = 0;
        this._bindEvents();
        this._bindSocket();
    }

    _img(file) {
        if (this.images.has(file)) return this.images.get(file);
        const img = new Image();
        img.src = ASSET_BASE + file;
        this.images.set(file, img);
        return img;
    }

    _bindEvents() {
        this._onKeyDown = (e) => {
            const k = e.key.toLowerCase();
            if (k in this.keys) this.keys[k] = true;
        };
        this._onKeyUp = (e) => {
            const k = e.key.toLowerCase();
            if (k in this.keys) this.keys[k] = false;
        };
        this._onMouseMove = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            this.mouse.y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        };
        this._onMouseDown = () => { this.mouse.down = true; };
        this._onMouseUp = () => { this.mouse.down = false; };
        window.addEventListener("keydown", this._onKeyDown);
        window.addEventListener("keyup", this._onKeyUp);
        window.addEventListener("mousemove", this._onMouseMove);
        window.addEventListener("mousedown", this._onMouseDown);
        window.addEventListener("mouseup", this._onMouseUp);
    }

    _bindSocket() {
        this._onInit = (data) => {
            this.selfId = data.selfId;
            this.world = data.world || this.world;
        };
        this._onSnapshot = (snap) => {
            this.snapshots.push(snap);
            if (this.snapshots.length > 3) this.snapshots.shift();
            // Sprites für fremde Skins nachladen
            for (const p of snap.players) if (p.skin) this._img(p.skin);
        };
        this.socket.on("arena:init", this._onInit);
        this.socket.on("arena:snapshot", this._onSnapshot);
    }

    start() {
        this.running = true;
        this.socket.emit("arena:join", { skin: this.skinFile });
        // Inputs mit 20Hz senden
        this._inputTimer = setInterval(() => this._sendInput(), 50);
        requestAnimationFrame(() => this._loop());
    }

    stop() {
        this.running = false;
        clearInterval(this._inputTimer);
        this.socket.emit("arena:leave");
        this.socket.off("arena:init", this._onInit);
        this.socket.off("arena:snapshot", this._onSnapshot);
        window.removeEventListener("keydown", this._onKeyDown);
        window.removeEventListener("keyup", this._onKeyUp);
        window.removeEventListener("mousemove", this._onMouseMove);
        window.removeEventListener("mousedown", this._onMouseDown);
        window.removeEventListener("mouseup", this._onMouseUp);
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.zoom = Math.max(1.1, Math.min(w / 1600, 2));
    }

    _self(snap) {
        return snap?.players.find((p) => p.id === this.selfId) || null;
    }

    _sendInput() {
        const snap = this.snapshots[this.snapshots.length - 1];
        const self = this._self(snap);
        let aim = 0;
        if (self) {
            const cam = this._cameraFor(self);
            const worldMx = cam.x + this.mouse.x / this.zoom;
            const worldMy = cam.y + this.mouse.y / this.zoom;
            aim = Math.atan2(worldMy - self.y, worldMx - self.x);
        }
        this.socket.emit("arena:input", {
            dx: (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0),
            dy: (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0),
            shooting: this.mouse.down,
            aim,
        });
    }

    _cameraFor(self) {
        const visW = this.canvas.width / this.zoom;
        const visH = this.canvas.height / this.zoom;
        return {
            x: Math.max(-100, Math.min(this.world.w - visW + 100, self.x - visW / 2)),
            y: Math.max(-100, Math.min(this.world.h - visH + 100, self.y - visH / 2)),
        };
    }

    /** Interpolierte Sicht: rendert ~120ms in der Vergangenheit zwischen den letzten Snapshots. */
    _interpolated() {
        if (this.snapshots.length === 0) return null;
        if (this.snapshots.length === 1) return this.snapshots[0];
        const [a, b] = this.snapshots.slice(-2);
        const renderTs = Date.now() - 120;
        const span = Math.max(1, b.ts - a.ts);
        const t = Math.max(0, Math.min(1, (renderTs - a.ts) / span));

        const lerpList = (listA, listB, key) => {
            const mapA = new Map(listA.map((e) => [e[key], e]));
            return listB.map((eb) => {
                const ea = mapA.get(eb[key]);
                if (!ea) return eb;
                return { ...eb, x: ea.x + (eb.x - ea.x) * t, y: ea.y + (eb.y - ea.y) * t };
            });
        };
        return {
            ...b,
            players: lerpList(a.players, b.players, "id"),
            monsters: lerpList(a.monsters, b.monsters, "id"),
        };
    }

    _loop() {
        if (!this.running) return;
        const snap = this._interpolated();
        if (snap) this._draw(snap);
        this._pushHud(snap);
        requestAnimationFrame(() => this._loop());
    }

    _pushHud(snap) {
        if (!this.onHud || !snap) return;
        const now = performance.now();
        if (now - this._lastHudPush < 150) return;
        this._lastHudPush = now;
        const self = this._self(snap);
        const ranking = [...snap.players]
            .sort((a, b) => b.level - a.level || b.xp - a.xp)
            .slice(0, 5)
            .map((p) => ({ name: p.name, level: p.level, isSelf: p.id === this.selfId }));
        this.onHud({
            self: self ? { hp: self.hp, maxHp: self.maxHp, level: self.level, xp: self.xp, xpNext: self.xpNext, dead: self.dead, respawnAt: self.respawnAt } : null,
            ranking,
            online: snap.players.length,
        });
    }

    _drawSpriteCentered(img, x, y, size, flip = false) {
        const ctx = this.ctx;
        if (img && img.complete && img.naturalWidth > 0) {
            const ratio = img.naturalWidth / img.naturalHeight;
            let w = size, h = size;
            if (ratio > 1) h = size / ratio; else w = size * ratio;
            ctx.save();
            ctx.translate(x, y);
            if (flip) ctx.scale(-1, 1);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
        } else {
            ctx.fillStyle = "#a78bfa";
            ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
        }
    }

    _draw(snap) {
        const ctx = this.ctx;
        const self = this._self(snap);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!self) return;

        const cam = this._cameraFor(self);
        ctx.save();
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-cam.x, -cam.y);

        // Boden + Weltgrenze
        if (this.floor.complete && this.floor.naturalWidth > 0) {
            ctx.drawImage(this.floor, 0, 0, this.world.w, this.world.h);
        } else {
            ctx.fillStyle = "#151520";
            ctx.fillRect(0, 0, this.world.w, this.world.h);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, this.world.w, this.world.h);

        // Monster
        for (const m of snap.monsters) {
            const img = this.images.get(MONSTER_SPRITES[m.type]);
            this._drawSpriteCentered(img, m.x, m.y, m.size * 2.2);
            const bw = m.size * 1.6;
            ctx.fillStyle = "rgba(127,29,29,0.9)";
            ctx.fillRect(m.x - bw / 2, m.y - m.size - 12, bw, 4);
            ctx.fillStyle = "#4ade80";
            ctx.fillRect(m.x - bw / 2, m.y - m.size - 12, bw * Math.max(0, m.hp / m.maxHp), 4);
        }

        // Bullets
        for (const b of snap.bullets) {
            const own = b.o === this.selfId;
            if (this.projectile.complete && this.projectile.naturalWidth > 0) {
                ctx.drawImage(this.projectile, b.x - 9, b.y - 9, 18, 18);
            } else {
                ctx.fillStyle = own ? "#fbbf24" : "#f87171";
                ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2); ctx.fill();
            }
        }

        // Spieler
        for (const p of snap.players) {
            if (p.dead) continue;
            const img = this.images.get(p.skin) || this._img(p.skin);
            this._drawSpriteCentered(img, p.x, p.y, 52, p.facingLeft);

            const isSelf = p.id === this.selfId;
            ctx.font = "bold 13px 'Space Grotesk', Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = isSelf ? "#c4b5fd" : "#e2e8f0";
            ctx.fillText(`${p.name} · Lv ${p.level}`, p.x, p.y - 42);

            const bw = 46;
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(p.x - bw / 2, p.y - 36, bw, 5);
            ctx.fillStyle = isSelf ? "#a78bfa" : "#f87171";
            ctx.fillRect(p.x - bw / 2, p.y - 36, bw * Math.max(0, p.hp / p.maxHp), 5);
        }

        ctx.restore();

        // Minimap (unten rechts)
        const mmSize = 150;
        const mmX = this.canvas.width - mmSize - 16;
        const mmY = this.canvas.height - mmSize - 16;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "rgba(10,10,18,0.8)";
        ctx.fillRect(mmX, mmY, mmSize, mmSize);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mmX, mmY, mmSize, mmSize);
        for (const m of snap.monsters) {
            ctx.fillStyle = "rgba(248,113,113,0.6)";
            ctx.fillRect(mmX + (m.x / this.world.w) * mmSize - 1, mmY + (m.y / this.world.h) * mmSize - 1, 2, 2);
        }
        for (const p of snap.players) {
            if (p.dead) continue;
            ctx.fillStyle = p.id === this.selfId ? "#a78bfa" : "#e2e8f0";
            ctx.fillRect(mmX + (p.x / this.world.w) * mmSize - 2, mmY + (p.y / this.world.h) * mmSize - 2, 4, 4);
        }
        ctx.restore();
    }
}
