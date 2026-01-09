// src/components/Adventure/AdventureEngine.js

export default class AdventureEngine {
    constructor(canvas, callbacks, skinFilename, loadout = [], powerupDefs = {}, initialData = null) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      
      this.onUpdateUI = callbacks.onUpdateUI; 
      this.onShopOpen = callbacks.onShopOpen;
      this.onStageComplete = callbacks.onStageComplete;

      this.width = canvas.width;
      this.height = canvas.height;
      
      this.powerupDefs = powerupDefs;

      // Assets laden
      this.sprites = {
          player: new Image(),
          door_closed: new Image(),
          door_open: new Image(),
          coin: new Image(),
          chest: new Image(),
          proj_basic: new Image(),
          proj_shuriken: new Image(),
          proj_fireball: new Image(),
          proj_arrow: new Image(),
          proj_sand: new Image(),
          proj_grenade: new Image(), 
          proj_poison: new Image(),
          proj_laser: new Image(),
          proj_web: new Image(),
          proj_poisonball: new Image(),

          //Dungeon
          floor_dungeon: new Image(),
          enemy_skeleton: new Image(),
          enemy_goblin: new Image(),
          enemy_orc: new Image(),
          enemy_nekromant: new Image(),

          //Desert
          floor_desert: new Image(),
          enemy_mummy: new Image(),
          enemy_scorpion: new Image(),
          enemy_golem: new Image(),

          //Lava
          floor_lava: new Image(),
          enemy_firespirit: new Image(),
          enemy_firewizard: new Image(),
          enemy_minotaur: new Image(),

          //Ice
          floor_ice: new Image(),
          enemy_penguin: new Image(),
          enemy_snowman: new Image(),
          enemy_yeti: new Image(),

          //Cave
          floor_cave: new Image(),
          enemy_spider: new Image(),
          enemy_troll: new Image(),
          enemy_skeletonwarrior: new Image(),
        
          enemy_boss1: new Image(),
        
          tree: new Image(),
          rock: new Image(),
          cactus: new Image(),
          pillar: new Image(),
          decoy: new Image(),

      };

      const skinFile = skinFilename || "Skins/player.png";
      this.playerProjectile = "proj_basic";
      if(skinFile.includes("ninja")) this.playerProjectile = "proj_shuriken";
      if(skinFile.includes("wizard")) this.playerProjectile = "proj_fireball";
      if(skinFile.includes("knight")) this.playerProjectile = "proj_arrow";
      if(skinFile.includes("cyber")) this.playProjectile = "proj_laser";

      const set = (img, file) => { img.src = `/assets/adventure/${file}`; };
      
      set(this.sprites.player, skinFile);
      set(this.sprites.door_closed, "World/door.png");
      set(this.sprites.door_open, "World/door_open.png");
      set(this.sprites.coin, "World/coin.png");
      set(this.sprites.chest, "World/chest.png");
      set(this.sprites.proj_basic, "Projectiles/projectile.png");
      set(this.sprites.proj_laser, "Projectiles/laserball.png");
      set(this.sprites.proj_shuriken, "Projectiles/shuriken.png");
      set(this.sprites.proj_fireball, "Projectiles/fireball.png");
      set(this.sprites.proj_arrow, "Projectiles/arrow.png");
      set(this.sprites.proj_sand, "Projectiles/spike.png");
      set(this.sprites.proj_poison, "Projectiles/spike.png"); 
      set(this.sprites.proj_grenade, "Projectiles/grenade.png");
      set(this.sprites.proj_web, "Projectiles/webball.png");
      set(this.sprites.proj_poisonball, "Projectiles/poisonball.png");
      set(this.sprites.decoy, "decoy.png"); 

      //Dungeon
      set(this.sprites.floor_dungeon, "StageTheme/floor_dungeon.png");
      set(this.sprites.enemy_skeleton, "Dungeon/skeleton.png");
      set(this.sprites.enemy_goblin, "Dungeon/goblin.png");
      set(this.sprites.enemy_orc, "Dungeon/orc.png");
      set(this.sprites.enemy_nekromant, "Dungeon/nekromant.png");

      //Desert
      set(this.sprites.floor_desert, "StageTheme/floor_desert.png");
      set(this.sprites.enemy_mummy, "Desert/mummy.png");
      set(this.sprites.enemy_scorpion, "Desert/scorpion.png");
      set(this.sprites.enemy_golem, "Desert/golem.png");

      //Ice
      set(this.sprites.floor_ice, "StageTheme/floor_ice.png");
      set(this.sprites.enemy_snowman, "Ice/snowman.png");
      set(this.sprites.enemy_penguin, "Ice/penguin.png");
      set(this.sprites.enemy_yeti, "Ice/yeti.png");

      // Cave
      set(this.sprites.floor_cave, "StageTheme/floor_cave.png");
      set(this.sprites.enemy_spider, "Cave/spider.png");
      set(this.sprites.enemy_troll, "Cave/troll.png");
      set(this.sprites.enemy_skeletonwarrior, "Cave/skelettwarrior.png");

      //Lava
      set(this.sprites.floor_lava, "StageTheme/floor_lava.png");
      set(this.sprites.enemy_firespirit, "Lava/firespirit.png");
      set(this.sprites.enemy_firewizard, "Lava/firewizard.png");
      set(this.sprites.enemy_minotaur, "Lava/minotaur.png");

      //Boss
      set(this.sprites.enemy_boss1, "boss1.png");

      set(this.sprites.tree, "World/tree.png");
      set(this.sprites.rock, "World/rock.png");
      set(this.sprites.cactus, "Desert/cactus.png");
      set(this.sprites.pillar, "World/pillar.png");

      this.baseStats = initialData?.baseStats || { 
          damage: 1, speed: 1, maxHp: 100, multishot: 0, lifesteal: 0, luck: 1, magnet: 0 
      };
      
      this.worldWidth = 2000;
      this.worldHeight = 2000;

      // Init Loadout
      const powerupState = loadout.map(id => {
          if(!id) return null;
          return { id, cooldownTimer: 0, maxCooldown: this.powerupDefs[id]?.cooldown || 10000 };
      });

      this.state = {
        running: false,
        gameOver: false,
        paused: false,
        inShop: false,
        
        loadout: powerupState, 
        
        camera: { x: 0, y: 0 },
        player: { 
            x: 1000, y: 1000, 
            hp: initialData?.hp || this.baseStats.maxHp, 
            maxHp: this.baseStats.maxHp, 
            speed: 3, 
            size: 24, 
            gold: initialData?.gold || 0,
            facingLeft: false, 
            shieldActive: false,
            shieldTimer: 0,
            poisonedTimer: 0,
            flashRedTimer: 0,
            fastShotTimer: 0,
            fastBootsTimer: 0
        },
        
        // BOSS CUTSCENE STATE
        cutscene: {
            active: false,
            phase: 0,
            timer: 0,
            targetX: 0,
            targetY: 0
        },

        decoy: null,
        spinAttack: { active: false, timer: 0, angle: 0 },

        bullets: [],
        enemyBullets: [],
        enemies: [],
        drops: [],
        chests: [],
        obstacles: [],
        acidPuddles: [], 
        floatingTexts: [],
        effects: [], 
        
        stage: initialData?.stage || 1,
        kills: initialData?.kills || 0,
        
        killsRequired: 10,
        stageKills: 0,
        isBossStage: false,
        bossSpawned: false,
        currentTheme: 0, 

        doorOpen: false,
        doorPos: { x: 0, y: 0 },
        
        lastSpawnTime: 0,
        spawnInterval: 1000,
        
        keys: { w: false, a: false, s: false, d: false, " ": false, "1": false, "2": false, "3": false },
        prevKeys: { "1": false, "2": false, "3": false }, 
        mouse: { x: 0, y: 0, down: false },
        lastShot: 0
      };
  
      this.bindEvents();
    }

    bindEvents() {
        this.handleKeyDown = (e) => { 
            if(this.state.keys.hasOwnProperty(e.key)) this.state.keys[e.key] = true; 
            if(e.key === " ") this.state.keys[" "] = true; 
        };
        this.handleKeyUp = (e) => { 
            if(this.state.keys.hasOwnProperty(e.key)) this.state.keys[e.key] = false; 
            if(e.key === " ") this.state.keys[" "] = false; 
        };
        this.handleMouseMove = (e) => { 
            const rect = this.canvas.getBoundingClientRect();
            // Skalierung für Canvas
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            this.state.mouse.x = (e.clientX - rect.left) * scaleX;
            this.state.mouse.y = (e.clientY - rect.top) * scaleY;
        };
        this.handleMouseDown = () => { this.state.mouse.down = true; };
        this.handleMouseUp = () => { this.state.mouse.down = false; };

        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("mousemove", this.handleMouseMove);
        window.addEventListener("mousedown", this.handleMouseDown);
        window.addEventListener("mouseup", this.handleMouseUp);
    }
    
    start() { this.state.running = true; this.spawnStage(); this.loop(); }
    stop() { 
        this.state.running = false; 
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        window.removeEventListener("mousemove", this.handleMouseMove);
        window.removeEventListener("mousedown", this.handleMouseDown);
        window.removeEventListener("mouseup", this.handleMouseUp);
    }

    exportState(saveCurrentProgress = false) {
        // Wenn saveCurrentProgress = true: Wir speichern aktuellen Stand (z.B. nach Stage-Ende).
        // Wenn saveCurrentProgress = false: Wir speichern den Stand vom STAGE-ANFANG (z.B. bei Rage-Quit/Disconnect mitten im Level).
        
        const data = (saveCurrentProgress || !this.stageStartData) ? this.state.player : this.stageStartData;

        return {
            hp: data.hp,
            maxHp: this.baseStats.maxHp,
            gold: data.gold,
            stage: this.state.stage,
            kills: this.state.kills, // Kills nehmen wir global (oder data.kills wenn man Kills auch resetten will)
            baseStats: this.baseStats
        };
    }

    // --- LEVEL GENERATION ---
    spawnStage() {
        const s = this.state;
        s.bullets = []; s.enemyBullets = []; s.enemies = []; 
        s.drops = []; s.obstacles = []; s.acidPuddles = []; 

        this.stageStartData = {
            hp: s.player.hp,
            gold: s.player.gold,
            kills: s.kills 
        };

        s.doorOpen = false;
        s.decoy = null; s.effects = [];
        s.stageKills = 0;
        s.bossSpawned = false;
       
        // Reset Top Message
        this.onUpdateUI({ topMessage: null });

        s.isBossStage = (s.stage % 10 === 0);
        s.currentTheme = Math.floor(Math.random() * 5); 

        if (s.stage === 0) {
            this.worldWidth = 1000;
            this.worldHeight = 1000;
            s.player.x = 500; s.player.y = 800;
            s.doorPos = { x: 500, y: 200 };
            s.doorOpen = true; // Sofort offen
            s.killsRequired = 0; 
            
            // Dummy Gegner (bewegen sich nicht, greifen nicht an)
            s.enemies.push({
                x: 200, y: 500, hp: 9999, maxHp: 9999, speed: 0, damage: 0, size: 30, 
                type: 'dummy', ai: 'dummy', sprite: this.sprites.enemy_goblin, color: "gray"
            });
            s.enemies.push({
                x: 800, y: 500, hp: 9999, maxHp: 9999, speed: 0, damage: 0, size: 30, 
                type: 'dummy', ai: 'dummy', sprite: this.sprites.enemy_orc, color: "gray"
            });
            
            this.onUpdateUI({ topMessage: "TUTORIAL: WASD to Move, SPACE to Shoot" });
            return; // Keine weitere Generierung
        }

        if (s.isBossStage) {
            // BOSS SETUP
            // Kills Required hoch setzen, damit Tür erst beim Boss-Tod aufgeht
            s.killsRequired = 99999; 
            
            // Kleinere Map für Bossfight (Arena)
            this.worldWidth = 1200;
            this.worldHeight = 1200;

            // Feste Positionen für Arena-Feeling
            s.player.x = 600; 
            s.player.y = 1000;
            
            s.doorPos = { x: 600, y: 200 }; // Boss Thron / Exit Position

            // Cutscene initialisieren
            s.cutscene = {
                active: true,
                phase: 0, // 0: Start delay, 1: Move Cam to Boss, 2: Boss Spawn, 3: Move Cam Back, 4: Fight
                timer: 0,
                targetX: s.doorPos.x,
                targetY: s.doorPos.y
            };
            
        } else {
            // NORMAL STAGE
            s.cutscene.active = false;
            s.killsRequired = 12 + Math.floor(s.stage * 3);
            this.worldWidth = 2000 + (Math.min(10, s.stage) * 100);
            this.worldHeight = 2000 + (Math.min(10, s.stage) * 100);
            
            s.player.x = this.worldWidth / 2; s.player.y = this.worldHeight / 2;
            
            this.generateObstacles(s.currentTheme);
            s.doorPos = this.getRandomPos(800);

            s.spawnInterval = Math.max(600, 1200 - (s.stage * 30)); 
            
            // Kisten
            s.chests = [];
            for(let i=0; i < 2; i++) {
                const pos = this.getRandomPos(500);
                s.chests.push({ x: pos.x, y: pos.y, opened: false, size: 20 });
            }
        }
    }

    getRandomPos(minDist) {
        let x, y, dist, tries=0;
        const s = this.state;
        const isFree = (x, y, r) => !s.obstacles.some(o => Math.hypot(x - o.x, y - o.y) < r + o.r);
        do {
            x = 100 + Math.random() * (this.worldWidth-200);
            y = 100 + Math.random() * (this.worldHeight-200);
            dist = Math.hypot(x - s.player.x, y - s.player.y);
            tries++;
        } while((dist < minDist || !isFree(x,y,40)) && tries < 100);
        return { x, y };
    }

    generateObstacles(theme) {
        const s = this.state;
        const count = 20 + Math.min(20, s.stage);
        for(let i=0; i<count; i++) {
            const x = Math.random() * this.worldWidth;
            const y = Math.random() * this.worldHeight;
            if(Math.hypot(x - this.worldWidth/2, y - this.worldHeight/2) < 400) continue; 

            let type = "rock", color = "#555", sprite = this.sprites.rock, radius = 30 + Math.random() * 20;
            
            if (theme === 1) { // Desert
                 if (Math.random() > 0.6) { type = "cactus"; sprite = this.sprites.cactus; radius = 20; color="green"; } 
                 else { color="#8B4513"; }
            } else if (theme === 2) { // Lava
                color = "#500"; 
            } else if (theme === 3) { // Ice
                color = "#A5F2F3"; 
            } else if (theme === 4) { // Cave
                 if(Math.random() > 0.5) { type = "pillar"; sprite = this.sprites.pillar; radius = 25; color = "#444"; }
                 else { sprite = this.sprites.rock; color = "#222"; }
            } else { // Dungeon
                if(Math.random() > 0.5) { type = "pillar"; sprite = this.sprites.pillar; radius = 25; color = "#444"; }
            }
            s.obstacles.push({ x, y, r: radius, type, sprite, color, theme });
        }
    }

    handleSpawning() {
        const s = this.state;
        const now = Date.now();
        
        if (s.isBossStage) {
            // Minions nur spawnen, WENN Boss da ist.
            if (s.bossSpawned) {
                if (now - s.lastSpawnTime > 4000 && s.enemies.length < 5) {
                    this.spawnSingleEnemy(true);
                    s.lastSpawnTime = now;
                }
            }
            return;
        }

        const maxEnemies = 10 + Math.floor(s.stage / 2); 
        if (now - s.lastSpawnTime > s.spawnInterval && s.enemies.length < maxEnemies) {
            this.spawnSingleEnemy();
            s.lastSpawnTime = now;
        }
    }

    spawnBoss() {
        const s = this.state;
        const hp = 1000 + (s.stage * 250); 
        const dmg = 20 + s.stage * 2;
        
        // Boss Spawn mit initialem State für Special Attacks
        s.enemies.push({
            x: s.doorPos.x, 
            y: s.doorPos.y, 
            hp: hp * 1.5, maxHp: hp *1.5, speed: 2.5, 
            damage: dmg, size: 120, type: "boss", ai: "boss", 
            sprite: this.sprites.enemy_boss1, 
            color: "red", projectileSprite: "proj_poisonball",
            lastAttack: 0, facingLeft: false, isBoss: true,
            
            // Special Attack States
            state: 'idle', // idle, charge, attack
            stateTimer: 0
        });
        
        s.bossSpawned = true;
    }

    spawnExitGuards() {
        for(let i=0; i<3; i++) {
            const angle = (Math.PI * 2 / 5) * i;
            const dist = 80;
            const ex = this.state.doorPos.x + Math.cos(angle) * dist;
            const ey = this.state.doorPos.y + Math.sin(angle) * dist;
            this.spawnSingleEnemy(false, ex, ey, true);
        }
    }

    spawnSingleEnemy(isMinion = false, forceX = null, forceY = null, isGuard = false) {
        const s = this.state;
        const angle = Math.random() * Math.PI * 2;
        const dist = (Math.max(this.width, this.height) / 2) + 50; 
        
        let x = forceX !== null ? forceX : s.player.x + Math.cos(angle) * dist;
        let y = forceY !== null ? forceY : s.player.y + Math.sin(angle) * dist;
        
        if (forceX === null) {
            let tries = 0;
            let spawnDist = 0;
            do {
               x = Math.max(50, Math.min(this.worldWidth-50, s.player.x + Math.cos(Math.random()*6.28) * dist));
               y = Math.max(50, Math.min(this.worldHeight-50, s.player.y + Math.sin(Math.random()*6.28) * dist));
               spawnDist = Math.hypot(x - s.player.x, y - s.player.y);
               tries++;
            } while (spawnDist < 400 && tries < 10);
        }

        const difficultyTier = Math.floor((s.stage - 1) / 5);
        
        let hp = 20 + (s.stage * 8) + (difficultyTier * 60);
        let dmg = 8 + (s.stage * 1.5) + (difficultyTier * 5);
        let speed = 2.8 + (difficultyTier * 0.4); 
        speed = Math.min(7, speed);

        let type = "basic", sprite = null, ai = "chase", size = 22, color = "red", projectileSprite = "proj_basic";
        const rand = Math.random();
        let canPoison = false; 

        // --- ENEMY SELECTION BY THEME ---
        switch (s.currentTheme) {
            case 1: // Desert
                if (rand > 0.7) { 
                    type = "shooter"; sprite = this.sprites.enemy_scorpion; ai = "range"; color = "purple"; projectileSprite = "proj_sand"; 
                    if (s.stage >= 10) canPoison = true; 
                } 
                else if (s.stage >= 5 && rand < 0.2) { 
                    type = "tank"; sprite = this.sprites.enemy_golem; size = 65; ai = "chase"; color = "brown"; 
                    hp *= 1.8; speed *= 0.8; 
                } 
                else { sprite = this.sprites.enemy_mummy; color = "yellow"; }
                break;

            case 2: // Lava
                if (rand > 0.75) {
                    type = "shooter"; sprite = this.sprites.enemy_firewizard; ai = "range"; color = "orange"; projectileSprite = "proj_fireball";
                    dmg *= 1.2;
                } else if (s.stage >= 5 && rand < 0.2) {
                    type = "tank"; sprite = this.sprites.enemy_minotaur; size = 70; ai = "chase"; color = "#800";
                    hp *= 2.0; speed *= 0.85;
                } else {
                    sprite = this.sprites.enemy_firespirit; color = "red";
                    speed *= 1.1; 
                }
                break;

            case 3: // Ice
                if (rand > 0.7) {
                    type = "shooter"; sprite = this.sprites.enemy_penguin; ai = "range"; color = "black"; projectileSprite = "proj_basic";
                } else if (s.stage >= 5 && rand < 0.15) {
                    type = "tank"; sprite = this.sprites.enemy_yeti; size = 70; ai = "chase"; color = "white";
                    hp *= 2.2; speed *= 0.75;
                } else {
                    sprite = this.sprites.enemy_snowman; color = "cyan";
                }
                break;

            case 4: // Cave
                if (rand > 0.65) {
                    type = "shooter"; sprite = this.sprites.enemy_spider; ai = "range"; color = "#220033"; projectileSprite = "proj_web";
                    if (s.stage >= 6) canPoison = true; 
                } else if (s.stage >= 5 && rand < 0.2) {
                    type = "tank"; sprite = this.sprites.enemy_troll; size = 65; ai = "chase"; color = "green";
                    hp *= 1.9; 
                } else {
                    sprite = this.sprites.enemy_skeletonwarrior; color = "gray";
                    hp *= 1.2; 
                }
                break;

            default: // Dungeon (0)
                if (s.stage >= 10 && rand < 0.1) {
                    type = "summoner"; sprite = this.sprites.enemy_mummy; color = "#4B0082"; size=30; hp *= 1.2; ai="summoner";
                }
                else if (rand > 0.75) { 
                    type = "shooter"; sprite = this.sprites.enemy_skeleton; ai = "range"; color = "green"; projectileSprite = "proj_arrow"; 
                } 
                else if (s.stage >= 5 && rand < 0.2) { 
                    // Tank Size erhöht
                    type = "tank"; sprite = this.sprites.enemy_orc; size = 65; ai = "chase"; color = "darkgreen"; 
                    hp *= 1.8; speed *= 0.85;
                } 
                else { sprite = this.sprites.enemy_goblin; color = "gray"; }
                break;
        }

        if (type === "shooter") {
            hp *= 0.6; 
            dmg *= 1.2; 
        }

        if (isMinion) { hp *= 0.5; size *= 0.8; }
        if (isGuard) { hp *= 1.5; dmg *= 1.5; size *= 1.2; color = "black"; }

        s.enemies.push({
            x, y, hp, maxHp: hp, speed, damage: dmg, size, 
            type,   
            ai,     
            sprite, 
            projectileSprite,
            lastAttack: 0, facingLeft: false, summonTimer: 0, poison: canPoison
        });
    }

    applyUpgrades(upgrades) {
        const p = this.state.player;
        if(upgrades.maxHp) { this.baseStats.maxHp += upgrades.maxHp; p.maxHp = this.baseStats.maxHp; p.hp += upgrades.maxHp; }
        if(upgrades.damage) this.baseStats.damage += upgrades.damage;
        if(upgrades.speed) this.baseStats.speed += upgrades.speed;
        if(upgrades.multishot) this.baseStats.multishot += upgrades.multishot;
        if(upgrades.lifesteal) this.baseStats.lifesteal += upgrades.lifesteal;
        if(upgrades.magnet) this.baseStats.magnet += upgrades.magnet; 
        if(upgrades.piercing) this.baseStats.piercing = (this.baseStats.piercing || 0) + upgrades.piercing;
        p.speed = 3 * this.baseStats.speed;
    }

    triggerPowerup(index) {
        const s = this.state;
        const slot = s.loadout[index];
        if(!slot) return;
        if(slot.cooldownTimer > 0) return;

        switch(slot.id) {
            case 'potion':
                s.player.hp = Math.min(s.player.maxHp, s.player.hp + 50);
                this.showFloatingText(s.player.x, s.player.y-30, "+50 HP", "lime");
                break;
            case 'shield':
                s.player.shieldActive = true;
                s.player.shieldTimer = 300; 
                break;
            case 'spin':
                s.spinAttack.active = true;
                s.spinAttack.timer = 60; 
                s.spinAttack.angle = 0;
                break;
            case 'fastshot':
                s.player.fastShotTimer = 300; // 5 Sek
                this.showFloatingText(s.player.x, s.player.y-40, "RAPID FIRE!", "yellow");
                break;
            case 'fastboots':
                s.player.fastBootsTimer = 300; // 5 Sek
                this.showFloatingText(s.player.x, s.player.y-40, "SPEED!", "cyan");
                break;
            case 'decoy':
                const decoyHp = 100 + (50 * this.baseStats.damage);
                s.decoy = { x: s.player.x, y: s.player.y, hp: decoyHp, maxHp: decoyHp, size: 25 };
                this.showFloatingText(s.player.x, s.player.y-40, "DECOY!", "cyan");
                break;
            case 'grenade':
                const worldMouseX = s.mouse.x + s.camera.x;
                const worldMouseY = s.mouse.y + s.camera.y;
                const angle = Math.atan2(worldMouseY - s.player.y, worldMouseX - s.player.x);
                const dist = Math.hypot(worldMouseY - s.player.y, worldMouseX - s.player.x);
                
                s.bullets.push({
                    x: s.player.x, y: s.player.y,
                    startX: s.player.x, startY: s.player.y,
                    targetDist: Math.min(dist, 350), 
                    distTraveled: 0,
                    vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12,
                    damage: 60 * this.baseStats.damage, 
                    size: 8, life: 100, type: 'grenade',
                    sprite: this.sprites.proj_grenade
                });
                break;
        }

        slot.cooldownTimer = slot.maxCooldown;
    }

    showFloatingText(x, y, text, color, life=40) {
        this.state.floatingTexts.push({x, y, text, color, life});
    }

    update() {
      if (this.state.paused || this.state.gameOver || this.state.inShop) return;
      const s = this.state;
      
      // --- CUTSCENE LOGIC ---
      if (s.cutscene.active) {
          s.cutscene.timer++;
          const t = s.cutscene.timer;
          
          if (s.cutscene.phase === 0) {
               // Warten kurz
               if (t > 30) { s.cutscene.phase = 1; s.cutscene.timer = 0; }
          }
          else if (s.cutscene.phase === 1) {
               // Kamera zum Boss fliegen (Lerp)
               s.camera.x += (s.cutscene.targetX - this.width/2 - s.camera.x) * 0.05;
               s.camera.y += (s.cutscene.targetY - this.height/2 - s.camera.y) * 0.05;
               if (t > 100) { 
                   this.spawnBoss(); 
                   s.cutscene.phase = 2; s.cutscene.timer = 0; 
                   this.onUpdateUI({ topMessage: "BOSS APPEARS!" });
               }
          }
          else if (s.cutscene.phase === 2) {
               // Boss Drop Animation & Pause
               if (t > 120) { s.cutscene.phase = 3; s.cutscene.timer = 0; this.onUpdateUI({ topMessage: "FIGHT!" }); }
          }
          else if (s.cutscene.phase === 3) {
               // Kamera zurück zum Player
               const targetCamX = Math.max(0, Math.min(this.worldWidth - this.width, s.player.x - this.width / 2));
               const targetCamY = Math.max(0, Math.min(this.worldHeight - this.height, s.player.y - this.height / 2));
               
               s.camera.x += (targetCamX - s.camera.x) * 0.1;
               s.camera.y += (targetCamY - s.camera.y) * 0.1;
               
               if (Math.abs(s.camera.x - targetCamX) < 10 && Math.abs(s.camera.y - targetCamY) < 10) {
                   s.cutscene.active = false; // ENDE
                   this.onUpdateUI({ topMessage: null }); // Text weg
               }
          }
          return; 
      }

      const now = Date.now();
      
      // Normales Spiel-Update
      this.handleSpawning();

      // Powerups Inputs
      ["1", "2", "3"].forEach((k, i) => { if(s.keys[k] && !s.prevKeys[k]) { this.triggerPowerup(i); } s.prevKeys[k] = s.keys[k]; });
      s.loadout.forEach(slot => { if(slot && slot.cooldownTimer > 0) slot.cooldownTimer -= 16.6; });
      if (s.player.flashRedTimer > 0) s.player.flashRedTimer--;
      if (s.player.poisonedTimer > 0) s.player.poisonedTimer--;
      if (s.player.shieldTimer > 0) s.player.shieldTimer--;
      if (s.player.shieldTimer <= 0) s.player.shieldActive = false; // FIX: Schild läuft ab

      if (s.player.fastShotTimer > 0) s.player.fastShotTimer--;
      if (s.player.fastBootsTimer > 0) s.player.fastBootsTimer--;

      // Spin Attack Logic FIX
      if (s.spinAttack.active) {
          s.spinAttack.timer--;
          s.spinAttack.angle += 0.3; // Animation dreht sich
          if (s.spinAttack.timer <= 0) s.spinAttack.active = false;
            
          // Schaden verursachen (alle 10 frames ticken)
          if (s.spinAttack.timer % 10 === 0) {
              s.enemies.forEach(e => {
                  if (Math.hypot(e.x - s.player.x, e.y - s.player.y) < 150) { // Radius 150
                      e.hp -= (this.baseStats.damage * 10);
                      this.showFloatingText(e.x, e.y - 20, Math.floor(this.baseStats.damage * 10), "cyan");
                      if(e.hp <= 0) this.handleEnemyDeath(e);
                    }
                });
            }
        }

      // Player Movement
      const currentSpeed = s.player.speed * (s.player.fastBootsTimer > 0 ? 2 : 1);
      if (s.keys.w) s.player.y -= currentSpeed;
      if (s.keys.s) s.player.y += currentSpeed;
      if (s.keys.a) s.player.x -= currentSpeed;
      if (s.keys.d) s.player.x += currentSpeed;
      
      s.player.x = Math.max(s.player.size, Math.min(this.worldWidth - s.player.size, s.player.x));
      s.player.y = Math.max(s.player.size, Math.min(this.worldHeight - s.player.size, s.player.y));
      
      // Camera Follow
      s.camera.x = Math.max(0, Math.min(this.worldWidth - this.width, s.player.x - this.width / 2));
      s.camera.y = Math.max(0, Math.min(this.worldHeight - this.height, s.player.y - this.height / 2));

      const worldMouseX = s.mouse.x + s.camera.x;
      s.player.facingLeft = worldMouseX < s.player.x;

      // Obstacle Collision
      s.obstacles.forEach(o => {
          const dist = Math.hypot(s.player.x - o.x, s.player.y - o.y);
          if (dist < s.player.size + o.r) {
              const angle = Math.atan2(s.player.y - o.y, s.player.x - o.x);
              s.player.x = o.x + Math.cos(angle) * (o.r + s.player.size);
              s.player.y = o.y + Math.sin(angle) * (o.r + s.player.size);
          }
      });
      
      // ACID PUDDLES Logic
      s.acidPuddles = s.acidPuddles.filter(p => {
          p.life--;
          if (Math.hypot(s.player.x - p.x, s.player.y - p.y) < p.r) {
             if (now - p.lastDmg > 500 && !s.player.shieldActive) {
                 s.player.hp -= 5;
                 s.player.flashRedTimer = 10;
                 p.lastDmg = now;
                 if (s.player.hp <= 0) this.triggerGameOver();
             }
          }
          return p.life > 0;
      });

      // Shooting
      // Cooldown Berechnung:
      let fireDelay = (300 / (1 + this.baseStats.multishot * 0.1));
      if (s.player.fastShotTimer > 0) fireDelay /= 2.5; // Wesentlich schneller

      if ((s.mouse.down || s.keys[" "]) && now - s.lastShot > fireDelay) { 
        const worldMouseY = s.mouse.y + s.camera.y;
        const angle = Math.atan2(worldMouseY - s.player.y, worldMouseX - s.player.x);
        const amount = 1 + Math.floor(this.baseStats.multishot);
        const spread = 0.15; 
        
        for(let i=0; i<amount; i++) {
            const finalAngle = angle + ((i - (amount-1)/2) * spread);
            s.bullets.push({
                x: s.player.x, y: s.player.y, 
                vx: Math.cos(finalAngle) * 9, vy: Math.sin(finalAngle) * 9,
                damage: 10 * this.baseStats.damage,
                size: 6, life: 100, type: 'normal',
                pierce: this.baseStats.piercing || 0,
                hitList: [],
                sprite: this.sprites[this.playerProjectile] 
            });
        }
        s.lastShot = now;
      }
      
      // Bullet Updates
      s.bullets.forEach((b, bIdx) => {
          if (b.type === 'grenade') {
              const speed = Math.hypot(b.vx, b.vy);
              b.x += b.vx; b.y += b.vy;
              b.distTraveled += speed;
              if (b.distTraveled >= b.targetDist) b.life = 0; 
          } else {
              b.x += b.vx; b.y += b.vy; b.life--; 
          }
          
          if(b.type !== 'grenade') {
             s.enemies.forEach(e => {
                  // FIX: Sicherstellen, dass hitList existiert
                  if (!b.hitList) b.hitList = []; 
                  if (b.hitList.includes(e)) return; // Schon getroffen?
                  
                  if(Math.hypot(b.x - e.x, b.y - e.y) < e.size + b.size) {
                      e.hp -= b.damage;
                      
                      // PIERCING FIX LOGIK
                      // Wir fügen den Gegner IMMER zur Hitlist hinzu, damit er nicht im nächsten Frame nochmal getroffen wird
                      b.hitList.push(e); 

                      if (b.pierce > 0) { 
                          b.pierce--; 
                          // Projektil lebt weiter (wird nicht auf 0 gesetzt)
                      } else { 
                          b.life = 0; // Keine Durchschläge mehr übrig -> Kugel zerstören
                      }

                      if(e.hp <= 0) this.handleEnemyDeath(e);
                  }
              });
          }
          
          if (b.type === 'grenade' && b.life <= 0) {
              s.effects.push({x: b.x, y: b.y, r: 10, maxR: 120, alpha: 1, color: "orange"});
              s.enemies.forEach(e => {
                  if(Math.hypot(e.x - b.x, e.y - b.y) < 120) {
                      e.hp -= b.damage;
                      this.showFloatingText(e.x, e.y, Math.floor(b.damage), "orange");
                      if(e.hp <= 0) this.handleEnemyDeath(e);
                  }
              });
          }
      });
      s.bullets = s.bullets.filter(b => b.life > 0 && b.x > 0 && b.x < this.worldWidth && b.y > 0 && b.y < this.worldHeight);

      // Enemy Physics
       for (let i = 0; i < s.enemies.length; i++) {
        for (let j = i + 1; j < s.enemies.length; j++) {
            const e1 = s.enemies[i];
            const e2 = s.enemies[j];
            const dx = e1.x - e2.x;
            const dy = e1.y - e2.y;
            const dist = Math.hypot(dx, dy);
            if (dist < e1.size + e2.size && dist > 0) {
                const pushX = (dx / dist) * 0.4; 
                const pushY = (dy / dist) * 0.4;
                e1.x += pushX; e1.y += pushY; e2.x -= pushX; e2.y -= pushY;
            }
        }
      }

      s.enemies.forEach(e => {
          const target = s.decoy || s.player;
          const distToTarget = Math.hypot(target.x - e.x, target.y - e.y);
          const angle = Math.atan2(target.y - e.y, target.x - e.x);

          e.facingLeft = target.x < e.x;
          
          s.obstacles.forEach(o => {
              const odist = Math.hypot(e.x - o.x, e.y - o.y);
              if (odist < e.size + o.r) {
                  const oAngle = Math.atan2(e.y - o.y, e.x - o.x);
                  e.x = o.x + Math.cos(oAngle) * (o.r + e.size);
                  e.y = o.y + Math.sin(oAngle) * (o.r + e.size);
              }
          });

          // Decoy Damage
          if (s.decoy && distToTarget < s.decoy.size + e.size) {
              if (now - e.lastAttack > 1000) {
                  s.decoy.hp -= e.damage;
                  this.showFloatingText(s.decoy.x, s.decoy.y - 30, "HIT", "orange");
                  e.lastAttack = now;
              }
          }

          // Player Damage
          if(!s.decoy && distToTarget < s.player.size + e.size) {
            const pushAngle = Math.atan2(e.y - s.player.y, e.x - s.player.x);
            e.x = s.player.x + Math.cos(pushAngle) * (s.player.size + e.size + 1);
            e.y = s.player.y + Math.sin(pushAngle) * (s.player.size + e.size + 1);

            if(!s.player.shieldActive) {
                if (now - e.lastAttack > 1000) {
                    s.player.hp -= e.damage; 
                    s.player.flashRedTimer = 10; 
                    e.lastAttack = now; 
                    if (e.poison) s.player.poisonedTimer = 180; 
                    if(s.player.hp <= 0) this.triggerGameOver();
                  }
              }
          }

          if(s.decoy && s.decoy.hp <= 0) {
              s.decoy = null;
              this.showFloatingText(s.player.x, s.player.y, "DECOY DESTROYED", "gray");
          }
          
          // --- AI BEHAVIOR ---
          else if (e.ai === 'boss') {
               // Boss AI Machine
               // Init State
               if(!e.patternCount) e.patternCount = 0;
               if(!e.state) e.state = 'idle';

               if (e.state === 'idle') {
                    // Bewegt sich langsam auf Spieler zu
                    if (distToTarget > 200) { e.x += Math.cos(angle) * e.speed; e.y += Math.sin(angle) * e.speed; }
                    e.stateTimer++;
                    
                    // Entscheidet Attacke
                    if (e.stateTimer > 100) { // Schneller Rhythmus Entscheidung
                        e.stateTimer = 0;
                        e.patternCount++;

                        // Jedes 4. mal Charge sonst Shoot
                        if (e.patternCount % 4 === 0) e.state = 'charge_start';
                        else e.state = 'shoot';
                    }
               }
               else if (e.state === 'shoot') {
                    // Dauerfeuer in alle Richtungen
                    for(let i=0; i<12; i++) { // 12 Projektile im Kreis
                        const rAngle = (Math.PI*2 / 12) * i + (Date.now()/1000); // Rotiert leicht
                        s.enemyBullets.push({
                            x: e.x, y: e.y,
                            vx: Math.cos(rAngle) * 5, vy: Math.sin(rAngle) * 5,
                            damage: e.damage, size: 8, life: 100, color: "orange", sprite: this.sprites.proj_poisonball
                        });
                    }
                    e.state = 'idle';
               }
               else if (e.state === 'charge_start') {
                    this.showFloatingText(e.x, e.y-80, "ROAR!!!", "red", 20);
                    e.stateTimer++;
                    if(e.stateTimer > 40) { // Kürzeres Aufladen
                        e.state = 'charge_attack';
                        e.stateTimer = 0;
                        // Ziel hinter dem Spieler berechnen
                        const angleToPlayer = Math.atan2(s.player.y - e.y, s.player.x - e.x);
                        e.chargeAngle = angleToPlayer;
                    }
               }
               else if (e.state === 'charge_attack') {
                    e.stateTimer++;
                    // Sehr schnelle Pfützen-Legung
                    const speed = 25; // Projektil/Legung sehr schnell
                    const dist = e.stateTimer * speed;
                    
                    const px = e.x + Math.cos(e.chargeAngle) * dist;
                    const py = e.y + Math.sin(e.chargeAngle) * dist;
                    
                    // Pfützen legen
                    s.acidPuddles.push({ 
                        x: px, y: py, r: 35, // Größere Pfützen
                        life: 800, // FIX: Bleiben doppelt so lange (ca 13 sek)
                        lastDmg: 0 
                    });

                    // Bis weit hinter den Spieler (z.B. 1500px weit)
                    if (dist > 1500) e.state = 'idle';
                }
          }
          else if (e.ai === 'summoner') {
              if (distToTarget > 400) { 
                  e.x -= Math.cos(angle) * (e.speed * 0.5); 
                  e.y -= Math.sin(angle) * (e.speed * 0.5);
              } else if (distToTarget > 200) {
                  e.x += Math.cos(angle) * 0.5; 
                  e.y += Math.sin(angle) * 0.5;
              }
              
              if (now - e.lastAttack > 3000) {
                   this.spawnSingleEnemy(true, e.x + 40, e.y);
                   this.showFloatingText(e.x, e.y-30, "ARISE!", "purple");
                   e.lastAttack = now;
              }
          }
          else if (e.ai === 'range') {
              const tier = Math.floor(s.stage / 5);
              const keepDist = 350 + (tier * 20); 

              if (distToTarget > keepDist) { e.x += Math.cos(angle) * e.speed; e.y += Math.sin(angle) * e.speed; } 
              else if (distToTarget < 200) { e.x -= Math.cos(angle) * e.speed; e.y -= Math.sin(angle) * e.speed; }
              
              if (now - e.lastAttack > 2000 && distToTarget < keepDist + 200) { 
                  s.enemyBullets.push({
                      x: e.x, y: e.y,
                      vx: Math.cos(angle) * (5 + tier), 
                      vy: Math.sin(angle) * (5 + tier),
                      damage: Math.max(5, s.stage * 2), size: 6, life: 70, 
                      color: "red", sprite: this.sprites[e.projectileSprite],
                      poison: e.poison
                  });
                  e.lastAttack = now;
              }
          } else {
              e.x += Math.cos(angle) * e.speed;
              e.y += Math.sin(angle) * e.speed;
          }

          s.bullets.forEach((b, bIdx) => {
              if(b.type === 'grenade') return; 
              if(Math.hypot(b.x - e.x, b.y - e.y) < e.size + b.size) {
                  e.hp -= b.damage;
                  this.showFloatingText(e.x, e.y - 20, Math.floor(b.damage), "white", 20);
                  s.bullets.splice(bIdx, 1);
                  if(e.hp <= 0) this.handleEnemyDeath(e);
              }
          });
      });
      s.enemies = s.enemies.filter(e => !e.dead);
      
      s.enemyBullets.forEach(b => { b.x += b.vx; b.y += b.vy; b.life--; });
      s.enemyBullets = s.enemyBullets.filter(b => {
          if (b.life <= 0) return false;
          const dist = Math.hypot(b.x - s.player.x, b.y - s.player.y);
          if(dist < s.player.size + b.size) {
              if(!s.player.shieldActive) {
                  s.player.hp -= b.damage;
                  s.player.flashRedTimer = 10;
                  if (b.poison) s.player.poisonedTimer = 180;
                  if (s.player.hp <= 0) this.triggerGameOver();
              }
              return false;
          }
          return true;
      });

      s.effects.forEach((eff, i) => {
          eff.r += 5;
          eff.alpha -= 0.05;
          if(eff.alpha <= 0) s.effects.splice(i, 1);
      });

       s.drops = s.drops.filter(d => {
          const dist = Math.hypot(s.player.x - d.x, s.player.y - d.y);
          const magnetRadius = 100 + (this.baseStats.magnet || 0) * 50;

          if(dist < magnetRadius) { 
              d.x += (s.player.x - d.x) * 0.15; 
              d.y += (s.player.y - d.y) * 0.15; 
          }

          if(dist < s.player.size) {
              if(d.type === "coin") { s.player.gold += d.val; this.showFloatingText(s.player.x, s.player.y-30, `+${d.val}`, "gold", 20); }
              return false; 
          }
          return true;
      });
      s.chests.forEach(c => {
          if(!c.opened && Math.hypot(s.player.x - c.x, s.player.y - c.y) < s.player.size + c.size) {
              c.opened = true; const bonus = 100 * s.stage; s.player.gold += bonus; this.showFloatingText(c.x, c.y-20, `+${bonus} GOLD`, "orange", 60);
          }
      });
      
      // Exit Logic
      if (s.stageKills >= s.killsRequired && !s.doorOpen) {
          s.doorOpen = true;
          this.onUpdateUI({ topMessage: "EXIT OPEN!" });
          this.spawnExitGuards();
      }

      if(s.doorOpen && Math.hypot(s.player.x - s.doorPos.x, s.player.y - s.doorPos.y) < s.player.size + 30) { 
          this.handleNextStageTrigger(); 
      }

      s.floatingTexts.forEach(t => { t.y -= 0.5; t.life--; });
      s.floatingTexts = s.floatingTexts.filter(t => t.life > 0);
      
      const boss = s.enemies.find(e => e.isBoss);
      const bossData = boss ? { hp: boss.hp, maxHp: boss.maxHp, name: "BOSS" } : null;

      this.onUpdateUI({ 
          hp: s.player.hp, maxHp: s.player.maxHp, 
          kills: s.kills, stage: s.stage, 
          gold: s.player.gold, 
          
          killsRequired: s.killsRequired,
          stageKills: s.stageKills,
          doorOpen: s.doorOpen,

          boss: bossData,
          
          stats: this.baseStats,
          loadout: s.loadout 
      });
    }

    handleEnemyDeath(e) {
        if (e.dead) return;
        e.dead = true;
        const s = this.state;
        s.kills++;
        s.stageKills++;
        
        // Boss Death trigger
        if (e.isBoss) {
            s.doorOpen = true; 
            this.onUpdateUI({ topMessage: "VICTORY!" });
        }
        
        if(this.baseStats.lifesteal > 0) {
             const healAmount = e.maxHp * this.baseStats.lifesteal; 
             if (healAmount >= 1) {
                 s.player.hp = Math.min(s.player.maxHp, s.player.hp + healAmount);
                 this.showFloatingText(s.player.x, s.player.y, `+${Math.floor(healAmount)} HP`, "green");
             }
        }

        const baseGold = 10 + (s.stage * 5); 
        const goldAmount = Math.floor((Math.random() * baseGold + 5) * this.baseStats.luck);
        s.drops.push({ x: e.x, y: e.y, type: "coin", val: goldAmount, size: 10 });
    }

    handleNextStageTrigger() { this.state.inShop = true; this.onStageComplete(this.state.stage); }
    continueNextStage() { this.state.inShop = false; this.state.stage++; this.spawnStage(); }

    draw() {
      const ctx = this.ctx;
      const s = this.state;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.translate(-s.camera.x, -s.camera.y);

      this.drawBackground(ctx, s.currentTheme);
      
      // Draw Acid Puddles
      s.acidPuddles.forEach(p => {
          ctx.save();
          ctx.globalAlpha = p.life / 100;
          ctx.fillStyle = "#32CD32"; // Lime Green
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
          // Bubbles effect
          if(Math.random() > 0.9) { ctx.fillStyle="white"; ctx.fillRect(p.x+(Math.random()-0.5)*20, p.y+(Math.random()-0.5)*20, 2, 2); }
          ctx.restore();
      });

      const doorSprite = s.doorOpen ? this.sprites.door_open : this.sprites.door_closed;
      ctx.shadowBlur = 20;
      ctx.shadowColor = s.doorOpen ? "lime" : "red";
      this.drawSprite(ctx, doorSprite, s.doorPos.x, s.doorPos.y, 64, 64, 0, s.doorOpen?"lime":"gray", "rect");
      ctx.shadowBlur = 0;

      s.chests.forEach(c => { if(!c.opened) this.drawSprite(ctx, this.sprites.chest, c.x, c.y, 40, 40, 0, "brown", "rect", true); });

      s.drops.forEach(d => {
          if(d.type === "coin") this.drawSprite(ctx, this.sprites.coin, d.x, d.y, 16, 16, 0, "yellow", "circle");
      });

      if(s.decoy) {
          this.drawSprite(ctx, this.sprites.decoy, s.decoy.x, s.decoy.y, 40, 40, 0, "pink", "rect");
          ctx.fillStyle = "red"; ctx.fillRect(s.decoy.x - 20, s.decoy.y - 35, 40, 4);
          ctx.fillStyle = "lime"; ctx.fillRect(s.decoy.x - 20, s.decoy.y - 35, 40 * (s.decoy.hp/s.decoy.maxHp), 4);
      }

      s.obstacles.forEach(o => { this.drawSprite(ctx, o.sprite, o.x, o.y, o.r*2.5, o.r*2.5, 0, o.color, "circle", true); });

      s.effects.forEach(eff => {
          ctx.save();
          ctx.globalAlpha = eff.alpha;
          ctx.fillStyle = eff.color;
          ctx.beginPath(); ctx.arc(eff.x, eff.y, eff.r, 0, Math.PI*2); ctx.fill();
          ctx.restore();
      });

      if(s.spinAttack.active) {
          ctx.save();
          ctx.translate(s.player.x, s.player.y);
          ctx.rotate(s.spinAttack.angle);
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = "cyan";
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(130, -20); ctx.lineTo(130, 20); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(-130, -20); ctx.lineTo(-130, 20); ctx.fill();
          ctx.strokeStyle = "white"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0, 120, 0, Math.PI*2); ctx.stroke();
          ctx.restore();
      }
      if(s.player.shieldActive) {
          ctx.strokeStyle = "blue"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.player.x, s.player.y, s.player.size + 10, 0, Math.PI*2); ctx.stroke();
      }
      
      this.drawCharacter(ctx, this.sprites.player, s.player.x, s.player.y, s.player.size*2, s.player.size*2, s.player.facingLeft);
      
      if (s.player.flashRedTimer > 0) {
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = "rgba(255,0,0,0.5)";
          ctx.beginPath(); ctx.arc(s.player.x, s.player.y, s.player.size, 0, Math.PI*2); ctx.fill();
          ctx.globalCompositeOperation = "source-over";
      }

      if(s.player.poisonedTimer > 0) {
          ctx.fillStyle = "purple"; ctx.font="10px Arial"; ctx.fillText("☠️", s.player.x-5, s.player.y-30);
      }
      
      s.enemies.forEach(e => {
          this.drawCharacter(ctx, e.sprite, e.x, e.y, e.size*2, e.size*2, e.facingLeft);
          
          // FIX: Mini-HP Leiste nur zeichnen, wenn es NICHT der Boss ist
          if (!e.isBoss) {
              ctx.fillStyle = "red"; ctx.fillRect(e.x - 15, e.y - 30, 30, 3);
              ctx.fillStyle = "lime"; ctx.fillRect(e.x - 15, e.y - 30, 30 * (Math.max(0,e.hp)/e.maxHp), 3);
          }
          
          if(e.poison) { ctx.fillStyle = "purple"; ctx.beginPath(); ctx.arc(e.x+10, e.y-25, 3, 0, Math.PI*2); ctx.fill(); }
      });

      s.bullets.forEach(b => { 
          const bAngle = Math.atan2(b.vy, b.vx);
          if (b.type === 'grenade') {
               this.drawSprite(ctx, b.sprite, b.x, b.y, 16, 16, bAngle + (Date.now()/50), "green", "circle");
          } else {
              this.drawSprite(ctx, b.sprite, b.x, b.y, b.size*3, b.size*3, bAngle, "yellow", "circle");
          }
      });
      s.enemyBullets.forEach(b => {
          const bAngle = Math.atan2(b.vy, b.vx);
          const col = b.poison ? "purple" : "red";
          this.drawSprite(ctx, b.sprite, b.x, b.y, b.size*3, b.size*3, bAngle, col, "circle");
      });

      s.floatingTexts.forEach(t => { ctx.fillStyle = t.color; ctx.font = "bold 14px Arial"; ctx.fillText(t.text, t.x, t.y); });
      ctx.restore();
    }
    
    // Aspect Ratio Support
    drawCharacter(ctx, img, x, y, w, h, facingLeft) {
        if(img && img.complete && img.naturalWidth > 0) {
            ctx.save(); 
            ctx.translate(x, y); 
            if(facingLeft) ctx.scale(-1, 1); 
            
            // Berechne Aspect Ratio
            const ratio = img.naturalWidth / img.naturalHeight;
            let finalW = w;
            let finalH = h;
            
            // Wenn Bild breiter als hoch ist
            if (ratio > 1) {
                finalH = w / ratio;
            } else {
                finalW = h * ratio;
            }

            ctx.drawImage(img, -finalW/2, -finalH/2, finalW, finalH); 
            ctx.restore();
        } else {
            ctx.fillStyle = "magenta"; ctx.fillRect(x-w/2, y-h/2, w, h);
        }
    }

    drawSprite(ctx, img, x, y, w, h, r=0, fallbackColor="magenta", fallbackShape="rect", keepRatio=false) {
        if(img && img.complete && img.naturalWidth > 0) {
            ctx.save(); ctx.translate(x, y); ctx.rotate(r); 
            let finalW = w, finalH = h;
            if (keepRatio) {
                const ratio = img.naturalWidth / img.naturalHeight;
                if (ratio > 1) finalH = w / ratio; else finalW = h * ratio;
            }
            ctx.drawImage(img, -finalW/2, -finalH/2, finalW, finalH); 
            ctx.restore();
        } else {
            ctx.fillStyle = fallbackColor; ctx.save(); ctx.translate(x, y); ctx.rotate(r);
            if(fallbackShape === "circle") { ctx.beginPath(); ctx.arc(0, 0, w/2, 0, Math.PI*2); ctx.fill(); } 
            else { ctx.fillRect(-w/2, -h/2, w, h); }
            ctx.restore();
        }
    }

    drawBackground(ctx, theme) {
        let bgImg = this.sprites.floor_dungeon;
        let overlayColor = null;

        // 0:Dungeon, 1:Desert, 2:Lava, 3:Ice, 4:Cave
        if (theme === 1) bgImg = this.sprites.floor_desert;
        else if (theme === 2) { bgImg = this.sprites.floor_lava; } 
        else if (theme === 3) { bgImg = this.sprites.floor_ice; } 
        else if (theme === 4) { bgImg = this.sprites.floor_cave; } 
        
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            const ptrn = ctx.createPattern(bgImg, 'repeat'); 
            ctx.fillStyle = ptrn; 
            ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
            
            if(overlayColor) {
                ctx.fillStyle = overlayColor;
                ctx.fillRect(0,0,this.worldWidth, this.worldHeight);
            }
        } else {
            ctx.fillStyle = "#1a1a1a"; ctx.fillRect(0,0,this.worldWidth,this.worldHeight);
        }
        
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth=5; ctx.strokeRect(0,0,this.worldWidth, this.worldHeight);
    }

    loop() { if(this.state.running) { this.update(); this.draw(); requestAnimationFrame(()=>this.loop()); } }
    triggerGameOver() { this.state.gameOver = true; this.state.running = false; this.onUpdateUI({ gameOver: true, kills: this.state.kills, stage: this.state.stage }); }
}