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
      this.zoom = Math.max(1.5, Math.min(canvas.width / 1400, 3.0));

      this.powerupDefs = powerupDefs;

      // Assets laden
      this.sprites = {
          // Statische Objekte & Projektile bleiben hier
          player: new Image(),
          door_closed: new Image(), door_open: new Image(), coin: new Image(), chest: new Image(),
          fastboots: new Image(), healpotion: new Image(), rapidfire: new Image(), shield: new Image(), spinattack: new Image(),
          
          // Projektile
          proj_basic: new Image(), proj_shuriken: new Image(), proj_fireball: new Image(),
          proj_arrow: new Image(), proj_sand: new Image(), proj_grenade: new Image(), 
          proj_poison: new Image(), proj_laser: new Image(), proj_web: new Image(), proj_poisonball: new Image(),

          // Umgebung
          floor_dungeon: new Image(), floor_desert: new Image(), floor_lava: new Image(), 
          floor_ice: new Image(), floor_cave: new Image(), floor_boss1: new Image(), floor_boss2: new Image(),
          tree: new Image(), rock: new Image(), cactus: new Image(), pillar: new Image(), decoy: new Image(),

          // BOSS BILDER (Müssen manuell bleiben, da spezielle Logik)
          boss1_idle: new Image(),
          boss1_charge1: new Image(), 
          boss1_charge2: new Image(), 
          boss1_slam: new Image(),    
          enemy_slime: new Image(),



      };

      this.animSprites = {};

      const skinFile = skinFilename || "skins/player.png";
      this.playerProjectile = "proj_basic";
      if(skinFile.includes("ninja")) this.playerProjectile = "proj_shuriken";
      if(skinFile.includes("wizard")) this.playerProjectile = "proj_fireball";
      if(skinFile.includes("knight")) this.playerProjectile = "proj_arrow";
      if(skinFile.includes("cyber")) this.playerProjectile = "proj_laser";
      if(skinFile.includes("gh0stqq")) this.playerProjectile = "proj_shuriken";
      if(skinFile.includes("bestmod")) this.playerProjectile = "proj_shuriken";

      this.onAssetsLoaded = callbacks.onAssetsLoaded; // Callback speichern

      // Status Tracking für Bilder
      let imagesToLoad = 0;
      let imagesLoaded = 0;
      let assetsRegistered = false;
      
      const checkLoad = () => {
          imagesLoaded++;
          if (assetsRegistered && imagesLoaded >= imagesToLoad && this.onAssetsLoaded) {
              this.onAssetsLoaded();
          }
      };

      const set = (img, file) => { 
          imagesToLoad++;
          img.onload = checkLoad;
          img.onerror = (e) => { 
              console.error("Fehler beim Laden von:", file); // Hilft beim Debuggen
              checkLoad(); 
          }; 
          img.src = `/assets/adventure/${file}`; 
      };
      
      // --- 1. Statische Bilder Laden ---
      set(this.sprites.door_closed, "world/door.png");
      set(this.sprites.door_open, "world/door_open.png");
      set(this.sprites.coin, "world/coin.png");
      set(this.sprites.chest, "world/chest.png");
      set(this.sprites.decoy, "powerups/decoy.png"); 
      set(this.sprites.fastboots, "powerups/fastboots.png");
      set(this.sprites.healpotion, "powerups/healpotion.png");
      set(this.sprites.rapidfire, "powerups/rapidfire.png");
      set(this.sprites.shield, "powerups/shield.png");
      set(this.sprites.spinattack, "powerups/spinattack.png");
      
      // Projektile
      set(this.sprites.proj_basic, "projectiles/projectile.png");
      set(this.sprites.proj_laser, "projectiles/laserball.png");
      set(this.sprites.proj_shuriken, "projectiles/shuriken.png");
      set(this.sprites.proj_fireball, "projectiles/fireball.png");
      set(this.sprites.proj_arrow, "projectiles/arrow.png");
      set(this.sprites.proj_sand, "projectiles/spike.png");
      set(this.sprites.proj_poison, "projectiles/spike.png"); 
      set(this.sprites.proj_grenade, "projectiles/grenade.png");
      set(this.sprites.proj_web, "projectiles/webball.png");
      set(this.sprites.proj_poisonball, "projectiles/poisonball.png");

      // Böden
      set(this.sprites.floor_dungeon, "stagetheme/floor_dungeon.png");
      set(this.sprites.floor_desert, "stagetheme/floor_desert.png");
      set(this.sprites.floor_ice, "stagetheme/floor_ice.png");
      set(this.sprites.floor_cave, "stagetheme/floor_cave.png");
      set(this.sprites.floor_lava, "stagetheme/floor_lava.png");
      set(this.sprites.floor_boss1, "stagetheme/floor_boss1.png");
      set(this.sprites.floor_boss2, "stagetheme/floor_boss2.png");

      // Environment
      set(this.sprites.tree, "world/tree.png");
      set(this.sprites.rock, "world/rock.png");
      set(this.sprites.cactus, "desert/cactus.png");
      set(this.sprites.pillar, "world/pillar.png");

      // --- Neue Sprites für Status Effekte ---
      this.sprites.ice_block = new Image(); set(this.sprites.ice_block, "effects/ice_block.png"); // Ein Eisblock Bild
      this.sprites.fire_particle = new Image(); set(this.sprites.fire_particle, "effects/fire.png"); // Kleine Flamme

      // Boss (Manuell laden)
      set(this.sprites.boss1_idle, "boss1/boss1.png");
      set(this.sprites.boss1_charge1, "boss1/bossattack1.png");
      set(this.sprites.boss1_charge2, "boss1/bossattack2.png");
      set(this.sprites.boss1_slam, "boss1/bossattack3.png");

      // --- 2. AUTOMATISIERTE GEGNER LADEN ---
      // name: Der Key für den Code. file: Die Basis-Datei. 
      // hasRun: sucht nach "file2.png". hasAttack: sucht nach "file_attack.png"
      const loadAnim = (name, file, hasRun = false, attackCount = 0, hasIdleFile = false) => {
          this.animSprites[name] = {
              idle: new Image(),
              run: hasRun ? new Image() : null,
              attack: [] // Attack ist jetzt immer eine Liste (Array)
          };
          
          if (hasIdleFile) set(this.animSprites[name].idle, file.replace(".png", "3.png"));
          else set(this.animSprites[name].idle, file);
          
          // Lauf-Animation (sucht immer nach "name2.png")
          if (hasRun) set(this.animSprites[name].run, file.replace(".png", "2.png"));
          
          // Attack-Animationen laden
          if (attackCount > 0) {
              for(let i = 1; i <= attackCount; i++) {
                  const img = new Image();
                  // Wir nutzen _attack für Angriffe oder Casts
                  set(img, file.replace(".png", attackCount === 1 ? "_attack.png" : `_attack${i}.png`));
                  this.animSprites[name].attack.push(img);
              }
          }
      };

      loadAnim("player", skinFile, true, 0, true);

      // Dungeon Enemies
      loadAnim("skeleton", "dungeon/skeleton.png", true, 2); // Beispiel: sucht skeleton2.png
      loadAnim("goblin", "dungeon/goblin.png", true, 1, true);
      loadAnim("orc", "dungeon/orc.png", true, 3, true);
      loadAnim("nekromant", "dungeon/nekromant.png");

      // Desert Enemies
      loadAnim("mummy", "desert/mummy.png", true, 1);
      loadAnim("scorpion", "desert/scorpion.png", true, 1);
      loadAnim("golem", "desert/golem.png", true, 2);
      loadAnim("shaman", "desert/shaman.png");

      // Ice Enemies
      loadAnim("snowman", "ice/snowman.png", true, 1);
      loadAnim("penguin", "ice/penguin.png", true, 1);
      loadAnim("yeti", "ice/yeti.png", true, 1);
      loadAnim("icespirit", "ice/icespirit.png")

      // Cave Enemies
      loadAnim("spider", "cave/spider.png", true, 1);
      loadAnim("troll", "cave/troll.png", true, 3);
      loadAnim("skeletonwarrior", "cave/skelettwarrior.png", true, 1);

      // Lava Enemies
      loadAnim("firespirit", "lava/firespirit.png", true, 1);
      loadAnim("firewizard", "lava/firewizard.png", true, 1);
      loadAnim("minotaur", "lava/minotaur.png", true, 2);
      loadAnim("firespewer", "lava/firespewer.png")


      // Extra Enemies
      loadAnim("slime", "boss1/slime.png");

      assetsRegistered = true;

      if(imagesToLoad === 0 && this.onAssetsLoaded) this.onAssetsLoaded();

      this.baseStats = initialData?.baseStats || { 
          damage: 1, 
          speed: 1, 
          maxHp: 100, 
          multishot: 0, 
          lifesteal: 0, 
          luck: 1, 
          magnet: 0,
          piercing: 0,
          fireRate: 1.0
      };
      
      this.pendingTheme = initialData?.currentTheme;

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
        stage: (initialData && initialData.stage !== undefined) ? initialData.stage : 1,
        paused: false,
        inShop: false,
        shopVisited: initialData?.shopVisited || false,
        
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
            burnTimer: 0,    // NEU
            freezeTimer: 0,  // NEU
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
        
        keys: { w: false, a: false, s: false, d: false, " ": false, "1": false, "2": false, "3": false, "4": false },
        prevKeys: { "1": false, "2": false, "3": false, "4": false }, 
        mouse: { x: 0, y: 0, down: false },
        lastShot: 0
      };

      this.lastTime = 0;
      this.accumulatedTime = 0;
      this.targetFPS = 60;
      this.step = 1000 / this.targetFPS;
  
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
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            // FIX: Durch Zoom teilen, damit Mausposition zur vergrößerten Welt passt
            this.state.mouse.x = ((e.clientX - rect.left) * scaleX) / this.zoom;
            this.state.mouse.y = ((e.clientY - rect.top) * scaleY) / this.zoom;
        };
        this.handleMouseDown = () => { this.state.mouse.down = true; };
        this.handleMouseUp = () => { this.state.mouse.down = false; };

        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("mousemove", this.handleMouseMove);
        window.addEventListener("mousedown", this.handleMouseDown);
        window.addEventListener("mouseup", this.handleMouseUp);
    }
    
    start() { 
        this.state.running = true; 
        this.lastTime = 0; // Reset Timer
        this.accumulatedTime = 0;
        this.spawnStage(); 
        requestAnimationFrame((t) => this.loop(t)); // Wichtig: (t) übergeben
    }
    stop() { 
        this.state.running = false; 
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        window.removeEventListener("mousemove", this.handleMouseMove);
        window.removeEventListener("mousedown", this.handleMouseDown);
        window.removeEventListener("mouseup", this.handleMouseUp);
    }

    exportState(saveCurrentProgress = false) {
        // saveCurrentProgress = true  -> Speichert IST-Zustand (z.B. nach Stage-Abschluss)
        // saveCurrentProgress = false -> Speichert START-Zustand (Reset auf Anfang der Stage)

        const useCurrent = saveCurrentProgress || !this.stageStartData;
        const p = this.state.player;
        const s = this.stageStartData; // Das wurde in spawnStage() gesetzt

        return {
            // Wenn useCurrent true ist, nimm Player-HP, sonst die Start-HP
            hp: useCurrent ? p.hp : s.hp,
            
            maxHp: this.baseStats.maxHp,
            
            // Auch Gold zurücksetzen, falls man welches gesammelt hat
            gold: useCurrent ? p.gold : s.gold,
            
            stage: this.state.stage,
            
            // WICHTIG: Kills auch zurücksetzen!
            // Vorher stand hier nur 'this.state.kills'
            kills: useCurrent ? this.state.kills : s.kills, 
            
            baseStats: saveCurrentProgress ? this.baseStats : (this.stageBaseStatsSnapshot || this.baseStats),
            currentTheme: this.state.currentTheme,
        };
    }

    getBossData(stage) {
        // Stage 10, 30, 50... -> Slime Boss (Puddle Intro)
        // Wir prüfen: Ist (Stage / 10) ungerade? -> Boss 1. Gerade? -> Boss 2.
        const bossCycle = Math.round(stage / 10);
        
        if (bossCycle % 2 !== 0) { 
            return {
                type: "slime_king",
                name: "KING SLIME",
                sprite: this.sprites.boss1_idle, 
                theme: 5, // Cave Theme als Arena (Säure passt hier gut)
                minion: "slime", // Spezifischer Minion (oder 'glob'/'blob')
                hpMulti: 1.0,
                introStyle: "grow", // Akkordeon Animation
                color: "lime"
            };
        }
        else {
            // Stage 20, 40, 60... -> Dark Knight (Skyfall Intro)
            return {
                type: "dark_knight",
                name: "DARK KNIGHT",
                sprite: this.sprites.player, // Placeholder: Nutzt Player-Sprite oder lade ein eigenes
                theme: 6, // Lava Theme als Arena
                minion: "skeletonwarrior",
                hpMulti: 1.5,
                introStyle: "drop", // Fällt vom Himmel
                color: "red"
            };
        }
    }

    // --- LEVEL GENERATION ---
    spawnStage() {
        const s = this.state;
        this.stageBaseStatsSnapshot = JSON.parse(JSON.stringify(this.baseStats));
        s.player.speed = 3 * this.baseStats.speed;
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

        s.isBossStage = (s.stage > 0 && s.stage % 10 === 0);
        s.bossMinionType = null;

        // Prüfen, ob wir ein Theme aus einem Savegame laden müssen
        if (s.isBossStage) {
            // Boss Arena Theme setzen (z.B. Lava für Ritter, Cave für Slime)
            const bossData = this.getBossData(s.stage);
            s.currentTheme = bossData.theme;
            s.bossMinionType = bossData.minion;
        } 
        else if (this.pendingTheme !== undefined && this.pendingTheme !== null) {
            // Theme aus Savegame laden
             s.currentTheme = this.pendingTheme;
             this.pendingTheme = null; 
        } else {
             // Zufall für normale Stages
             s.currentTheme = Math.floor(Math.random() * 5); 
        }

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
                type: 'dummy', ai: 'dummy', animSet: "goblin", color: "gray"
            });
            s.enemies.push({
                x: 800, y: 500, hp: 9999, maxHp: 9999, speed: 0, damage: 0, size: 30, 
                type: 'dummy', ai: 'dummy', animSet: "orc", color: "gray"
            });
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

            // FIX: Kamera SOFORT auf Spieler zentrieren
            // Sonst startet sie bei den Koordinaten des vorherigen Levels (z.B. unten rechts)
            const visibleW = this.width / this.zoom;
            const visibleH = this.height / this.zoom;
            s.camera.x = s.player.x - visibleW / 2;
            s.camera.y = s.player.y - visibleH / 2

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
            } else if (theme === 5) { //Boss 1

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

    resize(w, h) {
        this.width = w;
        this.height = h;
        
        // NEU: Zoom dynamisch anpassen
        // Wenn das Fenster breiter wird, zoomen wir rein, damit die Figuren nicht winzig werden.
        // Der Wert '800' ist ein Referenzwert. Kleiner = stärkerer Zoom.
        this.zoom = Math.max(1.5, Math.min(w / 1400, 3.0));
    }

    spawnBoss() {
        const s = this.state;
        const config = this.getBossData(s.stage);
        
        const hp = 1000 + (s.stage * 300); 
        const dmg = 20 + s.stage * 2;
        
        let startScaleY = 1;
        let startY = s.doorPos.y;
        
        if (config.introStyle === "grow") {
            startScaleY = 0; 
        } else if (config.introStyle === "drop") {
            startY = -400; 
        }

        const bossObj = {
            x: s.doorPos.x, 
            y: startY, 
            targetY: s.doorPos.y, 
            
            hp: hp * config.hpMulti, 
            maxHp: hp * config.hpMulti, 
            speed: (config.type === "dark_knight" ? 3.5 : 2), 
            damage: dmg, 
            size: 100, 
            
            type: "boss", 
            bossType: config.type, 
            name: config.name, // FIX: Name muss hier rein, damit UI ihn findet!
            ai: "boss", 
            
            sprite: config.sprite, 
            color: config.color, 
            
            introStyle: config.introStyle,
            scaleY: startScaleY, 

            visible: config.introStyle !== "grow",
            
            facingLeft: false, 
            isBoss: true,
            
            state: 'intro', 
            stateTimer: 0,
            patternCount: 0,
            minionType: config.minion 
        };
        
        s.enemies.push(bossObj);
        s.bossSpawned = true;
        return bossObj; // Return für sofortige Verwendung
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

    spawnSingleEnemy(isMinion = false, forceX = null, forceY = null, isGuard = false, forceAnim= null) {
        const s = this.state;
        if (s.enemies.length >= 50) return;

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
        let causesBurn = false;
        let causesFreeze = false;

        // --- ENEMY SELECTION BY THEME ---
        let animSet = "goblin"; 
        if (forceAnim) {
            animSet = forceAnim;
        } 
        // FIX: Wenn Boss Stage und Minions spawnen, erzwingen wir den Typ
        else if (s.isBossStage && s.bossMinionType) {
            animSet = s.bossMinionType;
            // Optional: Stats anpassen für Boss-Minions
            if (animSet === "slime") {
                 // Slimes sind etwas schwächer aber viele
                 // Hier keine Theme-Farben setzen, damit das Standard-Sprite genommen wird
            }
        } else {
            switch (s.currentTheme) {
                case 1: // Desert
                    if (s.stage > 10 && rand < 0.1) {
                        type = "healer"; animSet = "shaman"; ai = "healer"; color = "lime";
                        hp *= 0.8; // Weniger HP, da Support
                    }
                    else if (rand > 0.7) { 
                        type = "shooter"; animSet = "scorpion"; ai = "range"; color = "purple"; projectileSprite = "proj_sand"; 
                        if (s.stage >= 10) canPoison = true; 
                    } 
                    else if (s.stage >= 5 && rand < 0.1) { 
                        type = "tank"; animSet = "golem"; size = 50; ai = "chase"; color = "brown"; 
                        hp *= 1.8; speed *= 0.8; 
                    } 
                    else { animSet = "mummy"; color = "yellow"; }
                    break;

                case 2: // Lava
                    if (s.stage > 10 && rand < 0.1) {
                        type = "shooter"; animSet = "firespewer"; ai = "range"; color = "orange"; projectileSprite = "proj_fireball"; causesBurn = true;
                    }
                    else if (rand > 0.75) {
                        type = "shooter"; animSet = "firewizard"; ai = "range"; color = "orange"; projectileSprite = "proj_fireball";
                        dmg *= 1.2;
                    } else if (s.stage >= 5 && rand < 0.1) {
                        type = "tank"; animSet = "minotaur"; size = 50; ai = "chase"; color = "#800";
                        hp *= 2.0; speed *= 0.85;
                    } else {
                        animSet = "firespirit"; color = "red";
                        speed *= 1.1; 
                    }
                    break;

                case 3: // Ice
                    if (s.stage > 10 && rand < 0.1) {
                        type = "shooter"; animSet = "icespirit"; ai = "range"; color = "black"; projectileSprite = "proj_basic"; causesFreeze = true;
                    }
                    else if (rand > 0.7) {
                        type = "shooter"; animSet = "penguin"; ai = "range"; color = "black"; projectileSprite = "proj_basic";
                    } else if (s.stage >= 5 && rand < 0.1) {
                        type = "tank"; animSet = "yeti"; size = 50; ai = "chase"; color = "white";
                        hp *= 2.2; speed *= 0.75;
                    } else {
                        animSet = "snowman"; color = "cyan";
                    }
                    break;

                case 4: // Cave
                    if (rand > 0.65) {
                        type = "shooter"; animSet = "spider"; ai = "range"; color = "#220033"; projectileSprite = "proj_web";
                        if (s.stage >= 6) canPoison = true; 
                    } else if (s.stage >= 5 && rand < 0.1) {
                        type = "tank"; animSet = "troll"; size = 50; ai = "chase"; color = "green";
                        hp *= 1.9; 
                    } else {
                        animSet = "skeletonwarrior"; color = "gray";
                        hp *= 1.2; 
                    }
                    break;

                default: // Dungeon (0)
                    if (s.stage >= 10 && rand < 0.1) {
                        type = "summoner"; animSet = "nekromant"; color = "#4B0082"; size=30; hp *= 1.2; ai="summoner";
                    }
                    else if (rand > 0.75) { 
                        type = "shooter"; animSet = "skeleton"; ai = "range"; color = "green"; projectileSprite = "proj_arrow"; 
                    } 
                    else if (s.stage >= 5 && rand < 0.1) { 
                        type = "tank"; animSet = "orc"; size = 50; ai = "chase"; color = "darkgreen"; 
                        hp *= 1.8; speed *= 0.85;
                    } 
                    else { animSet = "goblin"; color = "gray"; }
                    break;
                }
        }

        if (type === "shooter") { hp *= 0.6; dmg *= 1.2; }
        if (isMinion) { hp *= 0.5; size *= 0.8; }
        if (isGuard) { hp *= 1.5; dmg *= 1.5; size *= 1.2; color = "black"; }
        

        // Wir übergeben 'animSet' statt 'sprite'
        s.enemies.push({
            x, y, hp, maxHp: hp, speed, damage: dmg, size, 
            type,   
            ai,     
            animSet: animSet, // WICHTIG: Das Set speichern
            sprite: null,     // Das wird gleich im Update Loop gefüllt
            projectileSprite,
            lastAttack: 0,
            lastHeal: 0,
            facingLeft: false, 
            summonTimer: 0, 
            poison: canPoison, 
            causesBurn: causesBurn,
            causesFreeze: causesFreeze,
            isMinion: isMinion
        });
    }

    applyUpgrades(upgrades) {
        const p = this.state.player;
        if(upgrades.maxHp) { this.baseStats.maxHp += upgrades.maxHp; p.maxHp = this.baseStats.maxHp; p.hp += upgrades.maxHp; }
        if(upgrades.damage) this.baseStats.damage += upgrades.damage;
        if(upgrades.speed) {
             this.baseStats.speed += upgrades.speed;
             // FIX: Sofort auf den Spieler anwenden, damit man im Shop-Screen schon den Effekt hat/sieht
             p.speed = 3 * this.baseStats.speed;
        }
        if(upgrades.multishot) this.baseStats.multishot += upgrades.multishot;
        if(upgrades.lifesteal) this.baseStats.lifesteal += upgrades.lifesteal;
        if(upgrades.magnet) this.baseStats.magnet += upgrades.magnet; 
        if(upgrades.piercing) this.baseStats.piercing = (this.baseStats.piercing || 0) + upgrades.piercing;
        if(upgrades.fireRate) this.baseStats.fireRate = (this.baseStats.fireRate || 1) + upgrades.fireRate;
        if(upgrades.luck) this.baseStats.luck += upgrades.luck;
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
               if (t > 30) { s.cutscene.phase = 1; s.cutscene.timer = 0; }
          }
          else if (s.cutscene.phase === 1) {
               // FIX: Ziel ist Boss-Position MINUS halbe Bildschirmgröße (durch Zoom geteilt)
               const visibleW = this.width / this.zoom;
               const visibleH = this.height / this.zoom;
               
               const targetCamX = s.cutscene.targetX - (visibleW / 2);
               const targetCamY = s.cutscene.targetY - (visibleH / 2);

               s.camera.x += (targetCamX - s.camera.x) * 0.05;
               s.camera.y += (targetCamY - s.camera.y) * 0.05;
               
               if (t > 100) { 
                   // FIX: Spawn Boss returns object with NAME
                   const newBoss = this.spawnBoss(); 
                   s.cutscene.phase = 2; 
                   s.cutscene.timer = 0; 
                   
                   // FIX: Direkt den Namen verwenden
                   this.onUpdateUI({ topMessage: newBoss.name + " ERSCHEINT!" });
                   setTimeout(() => { if(this.state.running) this.onUpdateUI({topMessage: null}); }, 1500);
               }
          }
          else if (s.cutscene.phase === 2) {
               // --- BOSS INTRO ANIMATION ---
               const boss = s.enemies.find(e => e.isBoss);
               if (boss) {
                   if (boss.introStyle === "grow") {
                       boss.visible = true;
                       boss.scaleY += 0.005; 
                       if (boss.scaleY >= 1) { boss.scaleY = 1; boss.state = 'idle'; }
                   } 
                   else if (boss.introStyle === "drop") {
                       boss.y += (boss.targetY - boss.y) * 0.1;
                       if (Math.abs(boss.y - boss.targetY) < 5) { boss.y = boss.targetY; boss.state = 'idle'; }
                   }
               }
               if (boss && boss.introStyle === "grow" && boss.scaleY < 1) {
                   // Warten...
               } else if (t > 120) { 
                   if(boss) { boss.scaleY = 1; boss.y = boss.targetY; boss.visible = true; }
                   s.cutscene.phase = 3; 
                   s.cutscene.timer = 0; 
               }
          }
          else if (s.cutscene.phase === 3) {
              const boss = s.enemies.find(e => e.isBoss);
              if (boss) {
                  if (t < 20) boss.sprite = this.sprites.boss1_charge1;
                  else if (t < 40) boss.sprite = this.sprites.boss1_charge2;
                  else boss.sprite = this.sprites.boss1_slam;
                  if (t === 10) this.showFloatingText(boss.x, boss.y - 100, "ROAAAAR!!!", "red", 60);
              }
              if (t > 80) {
                  if(boss) boss.sprite = this.sprites.boss1_idle; 
                  s.cutscene.phase = 4; 
                  s.cutscene.timer = 0;
              }
          }
          else if (s.cutscene.phase === 4) {
              const visibleW = this.width / this.zoom;
              const visibleH = this.height / this.zoom;
              
              const targetCamX = s.player.x - visibleW / 2;
              const targetCamY = s.player.y - visibleH / 2;

              // Weiche Fahrt zum Spieler
              s.camera.x += (targetCamX - s.camera.x) * 0.08;
              s.camera.y += (targetCamY - s.camera.y) * 0.08;

              if (t > 60) {
                  s.cutscene.active = false;
                  const boss = s.enemies.find(e => e.isBoss);
                  if(boss) boss.state = 'idle'; 
                  
                  // START ÄNDERUNG
                  this.onUpdateUI({ topMessage: "FIGHT!" });
                  
                  // Nach 2 Sekunden (2000ms) die Nachricht wieder löschen
                  setTimeout(() => {
                      // Wir prüfen kurz, ob das Spiel noch läuft, um Fehler zu vermeiden
                      if(this.state.running) {
                          this.onUpdateUI({ topMessage: null });
                      }
                  }, 2000);
                  // ENDE ÄNDERUNG
              }
          }
          return; // UPDATE HIER ABBRECHEN WÄHREND CUTSCENE
      }

      const now = Date.now();
      
      // Normales Spiel-Update
      this.handleSpawning();

      // Powerups Inputs
      ["1", "2", "3", "4"].forEach((k, i) => { if(s.keys[k] && !s.prevKeys[k]) { this.triggerPowerup(i); } s.prevKeys[k] = s.keys[k]; });
      s.loadout.forEach(slot => { if(slot && slot.cooldownTimer > 0) slot.cooldownTimer -= 16.6; });
      if (s.player.flashRedTimer > 0) s.player.flashRedTimer--;
      if (s.player.poisonedTimer > 0) {
          s.player.poisonedTimer--;
          // Schaden alle 60 Frames (1 Sekunde)
          if (s.player.poisonedTimer % 60 === 0) {
              s.player.hp -= 2;
              this.showFloatingText(s.player.x, s.player.y - 20, "2", "purple");
              if (s.player.hp <= 0) this.triggerGameOver();
          }
      }

      // 2. Burn
      if (s.player.burnTimer > 0) {
          s.player.burnTimer--;
          if (s.player.burnTimer % 30 === 0) { // Schnellerer Tick als Gift
              s.player.hp -= 1;
              this.showFloatingText(s.player.x, s.player.y - 20, "1", "orange");
              if (s.player.hp <= 0) this.triggerGameOver();
          }
      }

      // 3. Freeze (Timer runterzählen)
      if (s.player.freezeTimer > 0) s.player.freezeTimer--;
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
      let isMoving = false;
      if (s.player.freezeTimer <= 0) {
          if (s.keys.w) { s.player.y -= currentSpeed; isMoving = true; }
          if (s.keys.s) { s.player.y += currentSpeed; isMoving = true; }
          if (s.keys.a) { s.player.x -= currentSpeed; isMoving = true; }
          if (s.keys.d) { s.player.x += currentSpeed; isMoving = true; }
      }
      
      s.player.x = Math.max(s.player.size, Math.min(this.worldWidth - s.player.size, s.player.x));
      s.player.y = Math.max(s.player.size, Math.min(this.worldHeight - s.player.size, s.player.y));
      
      const pad = 150;

      // --- KAMERA FIX ---
      const visibleWidth = this.width / this.zoom;
      const visibleHeight = this.height / this.zoom;
    
      // X-Achse
      if (this.worldWidth < visibleWidth) {
          // Map kleiner als Screen -> Zentrieren
          s.camera.x = -((visibleWidth - this.worldWidth) / 2);
      } else {
          // Normales Folgen mit Padding an den Rändern (-pad bis worldWidth+pad)
          // Wir erlauben der Kamera, ins Negative zu gehen (Math.max(-pad, ...))
          const minX = -pad;
          const maxX = (this.worldWidth - visibleWidth) + pad;
          
          let targetX = s.player.x - visibleWidth / 2;
          s.camera.x = Math.max(minX, Math.min(maxX, targetX));
      }

      // Y-Achse
      if (this.worldHeight < visibleHeight) {
          // Map kleiner als Screen -> Zentrieren
          s.camera.y = -((visibleHeight - this.worldHeight) / 2);
      } else {
          // Y-Achse auch mit Padding für UI oben/unten
          const minY = -pad;
          const maxY = (this.worldHeight - visibleHeight) + pad;
          
          let targetY = s.player.y - visibleHeight / 2;
          s.camera.y = Math.max(minY, Math.min(maxY, targetY));
      }

      // NEU: Player Sprite Update
      const pAnim = this.animSprites["player"];
      if (pAnim) {
          // Standard: Idle
          let newSprite = pAnim.idle;

          // Wenn wir laufen und ein Lauf-Bild haben (player2.png)
          if (isMoving && pAnim.run) {
              // Wackeln alle 150ms
              const tick = Math.floor(Date.now() / 150);
              if (tick % 2 === 0) newSprite = pAnim.run;
          }
          
          // (Optional) Wenn wir schießen (kurz Attack-Frame zeigen, falls geladen)
          if ((s.mouse.down || s.keys[" "]) && pAnim.attack.length > 0) {
             newSprite = pAnim.attack[0]; 
          }

          s.player.sprite = newSprite;
      } else {
          // Fallback falls Animationen nicht geladen wurden
          s.player.sprite = this.sprites.player;
      }

      // Mouse Update korrigieren (bleibt gleich, aber wichtig für Verständnis)
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
      let fireDelay = (300 / (this.baseStats.fireRate || 1)); 
      
      // Multishot Bonus leicht verringern
      fireDelay = fireDelay / (1 + this.baseStats.multishot * 0.05);

      if (s.player.fastShotTimer > 0) fireDelay /= 2.5;

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
                      const isCrit = Math.random() < ((this.baseStats.luck || 1) * 0.05);
                      let dmg = b.damage;
                      
                      if (isCrit) {
                          dmg *= 2; // Doppelter Schaden
                          this.showFloatingText(e.x, e.y - 30, "CRIT!", "yellow", 30);
                      }
                      
                      e.hp -= dmg;
                      
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
          const prevX = e.x;
          const prevY = e.y;
          const target = s.decoy || s.player;
          const distToTarget = Math.hypot(target.x - e.x, target.y - e.y);
          const angle = Math.atan2(target.y - e.y, target.x - e.x);

          e.facingLeft = target.x < e.x;
          
          s.obstacles.forEach(o => {
              const odist = Math.hypot(e.x - o.x, e.y - o.y);
              if (odist < e.size + o.r) {
                  const oAngle = Math.atan2(e.y - o.y, e.x - o.x);
                  
                  // A) Hard Resolve (Rausdrücken wie bisher)
                  e.x = o.x + Math.cos(oAngle) * (o.r + e.size);
                  e.y = o.y + Math.sin(oAngle) * (o.r + e.size);
                  
                  // B) NEU: SLIDE MECHANIK
                  // Wir addieren eine kleine Bewegung im 90° Winkel zum Hindernis.
                  // Dadurch "rutschen" sie am Stein entlang, statt stecken zu bleiben.
                  // Wir berechnen grob, ob links oder rechts rum kürzer zum Spieler ist.
                  const angleToPlayer = Math.atan2(s.player.y - e.y, s.player.x - e.x);
                  const angleDiff = angleToPlayer - oAngle;
                  
                  // Einfache Logik: Rutsche in die Richtung, in die man eh will
                  const slideDir = (angleDiff > 0 && angleDiff < Math.PI) ? 1 : -1;
                  const slideAngle = oAngle + (Math.PI / 2 * slideDir);
                  
                  e.x += Math.cos(slideAngle) * 2; // Slide Speed
                  e.y += Math.sin(slideAngle) * 2;
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
                    if (e.poison) s.player.poisonedTimer = 300;
                    if (e.causesBurn) s.player.burnTimer = 180; 
                    if (e.causesFreeze) s.player.freezeTimer = 60; 
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
               let currentSprite = this.sprites.boss1_idle;
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
                    currentSprite = this.sprites.boss1_idle;
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
                    // AUFLADE PHASE (Verbesserte Animation)
                    this.showFloatingText(e.x, e.y-80, "ROAR!!!", "red", 20);
                    e.stateTimer++;
                    
                    // Animation: Langsames Ausholen statt Flackern
                    // Erste Hälfte (0-20 Frames): Ausholen (Hände halb hoch)
                    if (e.stateTimer < 20) {
                        currentSprite = this.sprites.boss1_charge1;
                    } 
                    // Zweite Hälfte (20-40 Frames): Bereit zum Schlag (Hände ganz hoch)
                    else {
                        currentSprite = this.sprites.boss1_charge2;
                    }

                    if(e.stateTimer > 40) {
                        e.state = 'charge_attack';
                        e.stateTimer = 0;
                        e.chargeAngle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
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
                    if (px > 50 && px < this.worldWidth - 50 && py > 50 && py < this.worldHeight - 50) {
                        s.acidPuddles.push({ 
                            x: px, y: py, r: 35, 
                            life: 800, 
                            lastDmg: 0 
                        });
                    }

                    // Bis weit hinter den Spieler (z.B. 1500px weit)
                    if (dist > 1500) e.state = 'idle';
                  
                    currentSprite = this.sprites.boss1_slam;
                }

                e.sprite = currentSprite;
          }
          else if (e.ai === 'healer') {
               // --- 1. BEWEGUNG: Sweet Spot finden ---
               // Ziel: Nicht zu nah (Selbstschutz), aber nah genug am Kampf (um zu heilen)
               const desiredDist = 450; 
               const retreatDist = 250;

               if (distToTarget > desiredDist) {
                   // Zu weit weg? Hinlaufen! (Damit er wieder in Heil-Range kommt)
                   e.x += Math.cos(angle) * e.speed;
                   e.y += Math.sin(angle) * e.speed;
               } 
               else if (distToTarget < retreatDist) {
                   // Zu nah dran? Weglaufen!
                   e.x -= Math.cos(angle) * e.speed;
                   e.y -= Math.sin(angle) * e.speed;
               }
               
               // --- 2. HEILEN ---
               if (now - e.lastHeal > 3000) { // Alle 3 Sekunden
                   // Suche Freund in Reichweite (Radius erhöht auf 400)
                   const friend = s.enemies.find(f => 
                        f !== e &&                  // Nicht sich selbst
                        !f.dead &&                  // Keinen Toten
                        f.hp < f.maxHp &&           // Nur Verletzte
                        Math.hypot(f.x - e.x, f.y - e.y) < 400 // Reichweite
                   );

                   if (friend) {
                       // Cast Animation Frame erzwingen
                       e.isCasting = true; 
                       setTimeout(() => { e.isCasting = false; }, 500);
                       
                       // Heilung
                       friend.hp = Math.min(friend.maxHp, friend.hp + 80); // Etwas mehr Heilung (+80)
                       this.showFloatingText(friend.x, friend.y - 30, "+80", "lime");
                       
                       // Visueller Strahl (Beam)
                       s.effects.push({
                           type: "beam", 
                           startX: e.x, startY: e.y, 
                           endX: friend.x, endY: friend.y, 
                           life: 30, // Strahl bleibt etwas länger sichtbar
                           color: "lime"
                       });
                       
                       e.lastHeal = now;
                   }
               }
          }
          else if (e.ai === 'summoner') {
              // 1. BEWEGUNG: Auf Spieler ZU laufen (statt weg), aber Abstand halten
              const desiredDist = 250; 
              
              if (distToTarget > desiredDist) { 
                  // Hinlaufen
                  e.x += Math.cos(angle) * (e.speed * 0.8); 
                  e.y += Math.sin(angle) * (e.speed * 0.8);
              } else if (distToTarget < desiredDist - 50) {
                  // Leicht zurückweichen, wenn zu nah
                  e.x -= Math.cos(angle) * (e.speed * 0.5); 
                  e.y -= Math.sin(angle) * (e.speed * 0.5);
              }

              // 2. FERNKAMPF ANGRIFF (Kleiner grüner Ball)
              if (now - e.lastAttack > 2000) { // Alle 2 Sekunden schießen
                   s.enemyBullets.push({
                      x: e.x, y: e.y,
                      vx: Math.cos(angle) * 6, 
                      vy: Math.sin(angle) * 6,
                      damage: e.damage, size: 6, life: 60, 
                      color: "#4B0082", sprite: this.sprites.proj_poison // Nutzt Gift-Sprite
                  });
                  e.lastAttack = now;
              }

              // 3. BESCHWÖRUNG (4 Skelette gleichzeitig)
              if (!e.lastSummon) e.lastSummon = now; // Init
              if (now - e.lastSummon > 6000) {
                   e.isCasting = true; 
                   setTimeout(() => { e.isCasting = false; }, 800);
                   
                   this.showFloatingText(e.x, e.y-40, "RISE, MY MINIONS!", "purple", 40);
                   
                   // 4 Skelette im Kreis um den Nekromanten beschwören
                   for(let i=0; i<4; i++) {
                       const spawnAngle = (Math.PI * 2 / 4) * i; // 0, 90, 180, 270 Grad
                       const spawnDist = 40;
                       const sx = e.x + Math.cos(spawnAngle) * spawnDist;
                       const sy = e.y + Math.sin(spawnAngle) * spawnDist;
                       
                       // Ruft unsere angepasste Funktion auf mit "skeletonwarrior"
                       this.spawnSingleEnemy(true, sx, sy, false, "skeletonwarrior");
                   }
                   e.lastSummon = now;
              }
          }
          else if (e.ai === 'range') {
              const tier = Math.floor(s.stage / 5);
              
              // Standard Werte
              let keepDist = 350 + (tier * 20); 
              let projectileSpeed = 5 + tier;
              let projectileLife = 80; // Wie weit fliegt es (Frames)

              // --- SPEZIAL LOGIK FÜR SNIPER ---
              // Ice Spirits und Fire Spewer bekommen mehr Reichweite und Speed
              if (e.animSet === "icespirit" || e.animSet === "firespewer") {
                  keepDist = 700;        // Halten viel mehr Abstand
                  projectileSpeed = 9;   // Projektile sind deutlich schneller
                  projectileLife = 140;  // Fliegen doppelt so weit
              }

              // Bewegung: Abstand halten oder näher kommen
              if (distToTarget > keepDist) { 
                  e.x += Math.cos(angle) * e.speed; 
                  e.y += Math.sin(angle) * e.speed; 
              } 
              else if (distToTarget < keepDist - 100) { // Kleiner Puffer, damit sie nicht zittern
                  e.x -= Math.cos(angle) * e.speed; 
                  e.y -= Math.sin(angle) * e.speed; 
              }
              
              // Schießen
              // Wir prüfen: Ist Cooldown durch? UND ist Spieler in Reichweite (keepDist + Puffer)?
              if (now - e.lastAttack > 2000 && distToTarget < keepDist + 300) { 
                  s.enemyBullets.push({
                      x: e.x, y: e.y,
                      vx: Math.cos(angle) * projectileSpeed, 
                      vy: Math.sin(angle) * projectileSpeed,
                      damage: Math.max(5, s.stage * 2), 
                      size: 6, 
                      life: projectileLife, // Hier nutzen wir die neue Lebensdauer
                      color: "red", 
                      sprite: this.sprites[e.projectileSprite],
                      poison: e.poison,
                      burn: e.causesBurn,       // <--- NEU: Eigenschaft übertragen
                      freeze: e.causesFreeze
                  });
                  e.lastAttack = now;
              }
          } 
          else {
              e.x += Math.cos(angle) * e.speed;
              e.y += Math.sin(angle) * e.speed;
          }
          e.x = Math.max(e.size, Math.min(this.worldWidth - e.size, e.x));
          e.y = Math.max(e.size, Math.min(this.worldHeight - e.size, e.y));

          // --- ANIMATION UPDATE SYSTEM FÜR NORMALE GEGNER ---
          // Hier wird basierend auf 'animSet' das richtige Bild gewählt
          if (!e.isBoss && e.animSet) {
              const anim = this.animSprites[e.animSet];
              if (anim) {
                  let finalSprite = anim.idle;

                  // Priority 1: Casting (Healer/Summoner) -> Nutzt Attack Sprite
                  if (e.isCasting && anim.attack.length > 0) {
                       finalSprite = anim.attack[0]; 
                  }

                  // 1. Attack Check (Hat Vorrang vor Laufen)
                  else if ((Date.now() - e.lastAttack) < 500 && anim.attack.length > 0) {
    
                        // --- FIX START ---
                        const attackDuration = 500; // Dauer der Attacke in ms (muss < 500 oben passen)
                        const timeSinceAttack = Date.now() - e.lastAttack;
                        // --- FIX ENDE ---

                        // Berechne, welcher Frame dran ist
                        const frameDuration = attackDuration / anim.attack.length;
                        const frameIndex = Math.floor(timeSinceAttack / frameDuration);
                        
                        // Sicherstellen, dass wir nicht außerhalb des Arrays greifen
                        if (frameIndex < anim.attack.length) {
                            finalSprite = anim.attack[frameIndex];
                        } else {
                            finalSprite = anim.attack[anim.attack.length - 1]; // Letzter Frame
                        }
                    }
                  // 2. Move Check (Nur wenn nicht angegriffen wird)
                  else if (anim.run) {
                      // Distanz berechnen, die wir uns in diesem Frame bewegt haben
                      const distMoved = Math.hypot(e.x - prevX, e.y - prevY);
                      
                      // Nur wenn Bewegung > 0.1 Pixel
                      if (distMoved > 0.1) {
                          const tick = Math.floor(Date.now() / 200);
                          if (tick % 2 === 0) finalSprite = anim.run;
                      }
                  }
                  
                  e.sprite = finalSprite;
              }
          }

          
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
                  if (b.poison) s.player.poisonedTimer = 300;
                  if (b.burn) s.player.burnTimer = 180;     // <--- NEU
                  if (b.freeze) s.player.freezeTimer = 60;
                  if (s.player.hp <= 0) this.triggerGameOver();
              }
              return false;
          }
          return true;
      });

      s.effects.forEach((eff, i) => {
          if (eff.type === "beam") {
              eff.life--;
              if(eff.life <= 0) s.effects.splice(i, 1);
          } else {
              // Bestehender Puddle/Grenade Effect Code
              eff.r += 5;
              eff.alpha -= 0.05;
              if(eff.alpha <= 0) s.effects.splice(i, 1);
          }
      });

       s.drops = s.drops.filter(d => {
          const dist = Math.hypot(s.player.x - d.x, s.player.y - d.y);
          const magnetRadius = 100 + (this.baseStats.magnet || 0) * 50;

          if(dist < magnetRadius) { 
              d.x += (s.player.x - d.x) * 0.3; 
              d.y += (s.player.y - d.y) * 0.3; 
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
          this.onUpdateUI({ topMessage: "Ausgang geöffnet!" });
          setTimeout(() => {
              // Sicherheitscheck, ob Spiel noch läuft
              if(this.state.running) this.onUpdateUI({ topMessage: null });
          }, 1000);
          this.spawnExitGuards();
      }

      if(s.doorOpen && Math.hypot(s.player.x - s.doorPos.x, s.player.y - s.doorPos.y) < s.player.size + 30) { 
          this.handleNextStageTrigger(); 
      }

      s.floatingTexts.forEach(t => { t.y -= 0.5; t.life--; });
      s.floatingTexts = s.floatingTexts.filter(t => t.life > 0);
      
      const boss = s.enemies.find(e => e.isBoss);
      const bossData = boss ? { hp: boss.hp, maxHp: boss.maxHp, name: boss.name } : null;

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
        
        // NEU: Nur zählen, wenn es KEIN Minion (beschworenes Monster) ist
        if (!e.isMinion) {
            s.kills++;
            s.stageKills++;
        }
        
        // Boss Death trigger
        if (e.isBoss) {
            s.doorOpen = true; 
            this.onUpdateUI({ topMessage: "VICTORY!" });
            setTimeout(() => {
              // Sicherheitscheck, ob Spiel noch läuft
              if(this.state.running) this.onUpdateUI({ topMessage: null });
          }, 1000);
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

      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-s.camera.x, -s.camera.y);

      this.drawBackground(ctx, s.currentTheme);

      if (s.stage === 0) {
          ctx.save();
          ctx.font = "bold 60px Arial";
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.textAlign = "center";
          ctx.fillText("WASD to Move", 500, 900);
          ctx.fillText("SPACE to Shoot", 500, 980);
          ctx.font = "bold 30px Arial";
          ctx.fillText("Gehe durch die Tür um zu starten", 500, 300);
          ctx.restore();
      }

      // Draw Acid Puddles
      s.acidPuddles.forEach(p => {
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = "#8732cd"; 
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
          // Bubbles effect
          const bubbleChance = Math.random();
          if(bubbleChance > 0.7) { 
              ctx.fillStyle="rgba(200, 255, 200, 0.8)"; 
              const bx = p.x + (Math.random()-0.5) * p.r;
              const by = p.y + (Math.random()-0.5) * p.r;
              const bSize = Math.random() * 5 + 2; 
              ctx.beginPath(); ctx.arc(bx, by, bSize, 0, Math.PI*2); ctx.fill();
          }
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
          if (eff.type === "beam") {
              ctx.strokeStyle = eff.color;
              ctx.lineWidth = 3;
              ctx.globalAlpha = eff.life / 20;
              ctx.beginPath();
              ctx.moveTo(eff.startX, eff.startY);
              ctx.lineTo(eff.endX, eff.endY);
              ctx.stroke();
              ctx.globalAlpha = 1;
          }
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
      
      this.drawCharacter(
          ctx,
          s.player.sprite || this.sprites.player,
          s.player.x, 
          s.player.y, 
          s.player.size*2, 
          s.player.size*2, 
          s.player.facingLeft);
      
      if (s.doorOpen) {
          // Winkel zur Tür berechnen
          const dx = s.doorPos.x - s.player.x;
          const dy = s.doorPos.y - s.player.y;
          const dist = Math.hypot(dx, dy);

          // Nur anzeigen, wenn wir weiter als 200px weg sind (sonst sieht man die Tür ja)
          if (dist > 200) {
              const angle = Math.atan2(dy, dx);
              
              ctx.save();
              ctx.translate(s.player.x, s.player.y);
              ctx.rotate(angle);
              
              // Pfeil bewegt sich leicht vor und zurück (Pulsieren)
              const offset = 60 + Math.sin(Date.now() / 100) * 5; 
              ctx.translate(offset, 0);

              // Pfeil zeichnen
              ctx.fillStyle = "lime";
              ctx.shadowColor = "lime";
              ctx.shadowBlur = 10;
              
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(-15, -10); // Linke Ecke
              ctx.lineTo(-15, 10);  // Rechte Ecke
              ctx.fill();
              
              ctx.restore();
          }
      }

      if (s.player.flashRedTimer > 0) {
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = "rgba(255,0,0,0.5)";
          ctx.beginPath(); ctx.arc(s.player.x, s.player.y, s.player.size, 0, Math.PI*2); ctx.fill();
          ctx.globalCompositeOperation = "source-over";
      }

      if (s.player.freezeTimer > 0) {
           this.drawSprite(ctx, this.sprites.ice_block, s.player.x, s.player.y + 10, 40, 20, 0, "cyan", "rect");
      }

      // 2. BURN (Flammen Partikel)
      if (s.player.burnTimer > 0) {
           // Zufällige kleine Flammen um den Spieler
           const fx = s.player.x + (Math.random() - 0.5) * 30;
           const fy = s.player.y + (Math.random() - 0.5) * 40;
           this.drawSprite(ctx, this.sprites.fire_particle, fx, fy, 15, 15, 0, "orange", "circle");
      }

      // 3. POISON (Lila Blinken Overlay)
      if (s.player.poisonedTimer > 0) {
          // Nur alle paar Frames zeichnen (Blinken)
          if (Math.floor(Date.now() / 100) % 2 === 0) {
              ctx.save();
              ctx.globalCompositeOperation = "source-atop"; // Nur auf dem Spieler malen wenn möglich, sonst circle overlay
              ctx.fillStyle = "rgba(128, 0, 128, 0.4)";
              ctx.beginPath(); ctx.arc(s.player.x, s.player.y, s.player.size, 0, Math.PI*2); ctx.fill();
              ctx.restore();
          }
          // Totenkopf Icon
          ctx.font="12px Arial"; ctx.fillText("☠️", s.player.x, s.player.y - 40);
      }
      
      s.enemies.forEach(e => {
          if (e.visible === false) return;
          this.drawCharacter(ctx, e.sprite, e.x, e.y, e.size*2, e.size*2, e.facingLeft, e.scaleY || 1);
          
          // FIX: Mini-HP Leiste nur zeichnen, wenn es NICHT der Boss ist
          if (!e.isBoss) {
              ctx.fillStyle = "red"; ctx.fillRect(e.x - 15, e.y - 30, 30, 3);
              ctx.fillStyle = "lime"; ctx.fillRect(e.x - 15, e.y - 30, 30 * (Math.max(0,e.hp)/e.maxHp), 3);
          }
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
    drawCharacter(ctx, img, x, y, w, h, facingLeft, scaleY = 1) {
        if(img && img.complete && img.naturalWidth > 0) {
            ctx.save(); 
            ctx.translate(x, y); 
            if(facingLeft) ctx.scale(-1, 1); 

            if (scaleY !== 1) {
                // 1. Zum Fußpunkt verschieben (Halbe Höhe nach unten)
                ctx.translate(0, h/2); 
                // 2. Skalieren (Y-Achse stauchen/strecken)
                ctx.scale(1, scaleY);  
                // 3. Zurückschieben
                ctx.translate(0, -h/2); 
            }
            
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

        if (theme === 1) bgImg = this.sprites.floor_desert;
        else if (theme === 2) { bgImg = this.sprites.floor_lava; } 
        else if (theme === 3) { bgImg = this.sprites.floor_ice; } 
        else if (theme === 4) { bgImg = this.sprites.floor_cave; } 
        else if (theme === 5) { bgImg = this.sprites.floor_boss1; }
        else if (theme === 6) { bgImg = this.sprites.floor_boss2; }
        
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            // FIX: Statt createPattern (was kachelt) nutzen wir drawImage.
            // Wir zeichnen das Bild exakt so groß wie die Welt ist.
            // Da die Welt bei (0,0) anfängt, passt das 1:1 Bild perfekt auf die Map.
            
            ctx.drawImage(bgImg, 0, 0, this.worldWidth, this.worldHeight);
            
            if(overlayColor) { 
                ctx.fillStyle = overlayColor; 
                ctx.fillRect(0, 0, this.worldWidth, this.worldHeight); 
            }
        } else {
            // Fallback
            ctx.fillStyle = "#1a1a1a"; 
            ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
        }
        
        // Welt-Grenze zeichnen
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; 
        ctx.lineWidth = 5; 
        ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);
    }
    loop(timestamp) {
        if (!this.state.running) return;

        // Initialer Timestamp beim ersten Start
        if (!this.lastTime) this.lastTime = timestamp;

        // Zeit seit dem letzten Frame berechnen
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.accumulatedTime += deltaTime;

        // UPDATE LOGIK (Fixed Time Step)
        // Solange wir genug Zeit "angesammelt" haben für einen 60FPS-Schritt,
        // führen wir update() aus. Das hält das Spiel konstant schnell.
        while (this.accumulatedTime >= this.step) {
            this.update(); 
            this.accumulatedTime -= this.step;
        }

        // DRAW LOGIK
        // Zeichnen tun wir so oft der Monitor es erlaubt (für flüssige 165hz Animationen)
        this.draw(); 
        
        requestAnimationFrame((t) => this.loop(t));
    }
    triggerGameOver() {
         this.state.gameOver = true;
          this.state.running = false;
           this.onUpdateUI({ 
            gameOver: true,
            kills: this.state.kills,
            stage: this.state.stage 
        }
        ); 
    }
}