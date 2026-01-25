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
          proj_poison: new Image(), proj_laser: new Image(), proj_web: new Image(), proj_poisonball: new Image(), proj_iceball: new Image(),
          fire_particle: new Image(), ice_block: new Image(), proj_block: new Image(), proj_feather: new Image (),

          // Umgebung
          floor_dungeon: new Image(), floor_desert: new Image(), floor_lava: new Image(), 
          floor_ice: new Image(), floor_cave: new Image(), floor_boss1: new Image(), floor_boss2: new Image(),
          tree: new Image(), rock: new Image(), cactus: new Image(), pillar: new Image(), decoy: new Image(),
          cactus2: new Image(), cactus3: new Image(), icebarrel: new Image (), icespikes: new Image(), vulkan: new Image(), vulkan2: new Image(),
          stone1: new Image(), stone2: new Image(),

          // BOSS BILDER (Müssen manuell bleiben, da spezielle Logik)
          boss1_idle: new Image(),
          boss1_charge1: new Image(), 
          boss1_charge2: new Image(), 
          boss1_slam: new Image(),    
          enemy_slime: new Image(),

          // BOSS BILDER 2
          boss2_fly1: new Image(), boss2_fly2: new Image(), 
          boss2_fly3: new Image(), boss2_fly4: new Image(), // NEU: 4 Flug-Frames
          
          boss2_walk1: new Image(), boss2_walk2: new Image(), // NEU: Lauf-Frames
          
          boss2_idle: new Image(), // Stand
          
          boss2_charge: new Image(), // NEU: Aufladen
          boss2_attack1: new Image(), boss2_attack2: new Image(), // NEU: Attacke/Beam
          
          warning_circle: new Image(), lightning_strike: new Image(), electric_ball: new Image(),



      };

      this.animSprites = {};

      const skinFile = skinFilename || "skins/player.png";
      this.playerProjectile = "proj_basic";
      if(skinFile.includes("ninja")) this.playerProjectile = "proj_shuriken";
      if(skinFile.includes("wizard")) this.playerProjectile = "proj_fireball";
      if(skinFile.includes("knight")) this.playerProjectile = "proj_arrow";
      if(skinFile.includes("cyber")) this.playerProjectile = "proj_laser";
      if(skinFile.includes("gh0stqq")) this.playerProjectile = "proj_block";
      if(skinFile.includes("bestmod")) this.playerProjectile = "proj_poisonball";

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
      set(this.sprites.proj_iceball, "projectiles/iceball.png");
      set(this.sprites.proj_block, "projectiles/block.png");
      set(this.sprites.proj_feather, "projectiles/feather.png");

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
      set(this.sprites.cactus2, "desert/cactus2.png");
      set(this.sprites.cactus3, "desert/cactus3.png");
      set(this.sprites.icebarrel, "ice/icebarrel.png");
      set(this.sprites.icespikes, "ice/icespikes.png");
      set(this.sprites.vulkan, "lava/vulkan.png");
      set(this.sprites.vulkan2, "lava/vulkan2.png");
      set(this.sprites.stone1, "cave/stone1.png");
      set(this.sprites.stone2, "cave/stone2.png");



      // --- Neue Sprites für Status Effekte ---
      this.sprites.ice_block = new Image(); set(this.sprites.ice_block, "projectiles/ice.png"); // Ein Eisblock Bild
      this.sprites.fire_particle = new Image(); set(this.sprites.fire_particle, "projectiles/fire.png"); // Kleine Flamme

      // Boss 1 (Manuell laden)
      set(this.sprites.boss1_idle, "boss1/boss1.png");
      set(this.sprites.boss1_charge1, "boss1/bossattack1.png");
      set(this.sprites.boss1_charge2, "boss1/bossattack2.png");
      set(this.sprites.boss1_slam, "boss1/bossattack3.png");

      // Boss 2 
      set(this.sprites.boss2_fly1, "boss2/dragon_fly1.png");
      set(this.sprites.boss2_fly2, "boss2/dragon_fly2.png");
      set(this.sprites.boss2_fly3, "boss2/dragon_fly3.png"); // NEU
      set(this.sprites.boss2_fly4, "boss2/dragon_fly4.png"); // NEU
      
      set(this.sprites.boss2_walk1, "boss2/dragon_walk1.png"); // NEU
      set(this.sprites.boss2_walk2, "boss2/dragon_walk2.png"); // NEU

      set(this.sprites.boss2_idle, "boss2/dragon_idle.png");
      set(this.sprites.boss2_charge, "boss2/dragon_charge.png"); // NEU
      
      set(this.sprites.boss2_attack1, "boss2/dragon_attack.png"); // NEU
      set(this.sprites.boss2_attack2, "boss2/dragon_attack2.png"); // NEU
      
      set(this.sprites.warning_circle, "boss2/warning_red.png");
      set(this.sprites.lightning_strike, "boss2/lightning.png");
      set(this.sprites.electric_ball, "boss2/electric_ball.png");

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
      loadAnim("nekromant", "dungeon/nekromant.png", true, 1, true);

      // Desert Enemies
      loadAnim("mummy", "desert/mummy.png", true, 1);
      loadAnim("scorpion", "desert/scorpion.png", true, 1);
      loadAnim("golem", "desert/golem.png", true, 2);
      loadAnim("shaman", "desert/shaman.png", true, 1, true);

      // Ice Enemies
      loadAnim("snowman", "ice/snowman.png", true, 1);
      loadAnim("penguin", "ice/penguin.png", true, 1);
      loadAnim("yeti", "ice/yeti.png", true, 1);
      loadAnim("icespirit", "ice/icespirit.png", true, 1)

      // Cave Enemies
      loadAnim("spider", "cave/spider.png", true, 1);
      loadAnim("troll", "cave/troll.png", true, 3);
      loadAnim("skeletonwarrior", "cave/skelettwarrior.png", true, 1);

      // Lava Enemies
      loadAnim("firespirit", "lava/firespirit.png", true, 1);
      loadAnim("firewizard", "lava/firewizard.png", true, 1);
      loadAnim("minotaur", "lava/minotaur.png", true, 2);
      loadAnim("firespewer", "lava/firespewer.png", true, 0, true)


      // Extra Enemies
      loadAnim("slime", "boss1/slime.png", true, 0, true);

      assetsRegistered = true;

      if(imagesToLoad === 0 && this.onAssetsLoaded) this.onAssetsLoaded();

      this.baseStats = initialData?.baseStats || { 
          damage: 1,  
          maxHp: 100, 
          speed: 1,
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
            speed: 3.5, 
            size: 24, 
            gold: initialData?.gold || 0,
            facingLeft: false, 
            shieldActive: false,
            shieldTimer: 0,
            poisonedTimer: 0,
            burnTimer: 0,    // NEU
            freezeTimer: 0,  // NEU
            webbedTimer: 0,
            stunTimer: 0,
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
    
    getZoomBase() {
        if (!this.state) return 1.5;
        // Prüfen ob Drachen Boss (Stage 20, 40, 60...)
        // Die Logik muss zur spawnStage Logik passen (bossCycle % 2 === 0)
        const bossCycle = Math.round(this.state.stage / 10);
        const isDragonBoss = (this.state.stage > 0 && this.state.stage % 10 === 0 && bossCycle % 2 === 0);

        // Wenn Drache: Zoom 1.0 (weit weg), Sonst: Zoom 1.5 (nah dran)
        return isDragonBoss ? 1.0 : 1.5;
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
            // STAGE 20, 40 etc -> ELECTRO DRAGON
            return {
                type: "electric_dragon",
                name: "THUNDERWING",
                sprite: this.sprites.boss2_idle, 
                theme: 6, // Ein dunkleres Theme passt gut zu Blitzen // Oder etwas passendes
                hpMulti: 3.5,
                introStyle: "fly_in", // Neue Intro Art
                color: "yellow"
            };
        }
    }

    // --- LEVEL GENERATION ---
    spawnStage() {
        const s = this.state;
        this.stageBaseStatsSnapshot = JSON.parse(JSON.stringify(this.baseStats));
        s.player.speed = 3.5 * (this.baseStats.speed || 1);
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

        s.isBossStage = (s.stage > 0 && s.stage % 10 === 0);
        s.bossMinionType = null;

        const minZoom = this.getZoomBase();
        this.zoom = Math.max(minZoom, Math.min(this.width / 1400, 3.0));

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


        if (s.isBossStage) {
            s.killsRequired = 99999; 
            
            const bossData = this.getBossData(s.stage);
            
            if (bossData.type === "electric_dragon") {
                // 1:1 Format, aber kleiner (z.B. 1400x1400)
                this.worldWidth = 1400;
                this.worldHeight = 1400;
                
                // SPIELER SPAWN: Oben Rechts
                s.player.x = 1280; 
                s.player.y = 370;
                
                // BOSS SPAWN ZIEL (Mitte)
                s.doorPos = { x: 690, y: 850 }; 
                
                // Kamera auf Spieler setzen
                s.camera.x = s.player.x - (this.width / this.zoom) / 2;
                s.camera.y = s.player.y - (this.height / this.zoom) / 2;

                s.cutscene = {
                    active: true,
                    phase: 0, 
                    timer: 0,
                    targetX: s.doorPos.x,
                    targetY: s.doorPos.y
                };


            } else {
                // ... (Code für Slime Boss / Standard Arena) ...
                this.worldWidth = 1200;
                this.worldHeight = 1200;
                s.player.x = 600; s.player.y = 1000;
                s.doorPos = { x: 600, y: 200 };

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
                }
            
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
    let attempts = 0; // Schutz vor Endlosschleife

    while(s.obstacles.length < count && attempts < 1000) {
        attempts++;
        
        // ÄNDERUNG: Padding von 150px zum Rand, damit nichts out-of-map ragt
        const x = 150 + Math.random() * (this.worldWidth - 300);
        const y = 150 + Math.random() * (this.worldHeight - 300);
        
        // Abstand zum Spawn (Mitte)
        if(Math.hypot(x - this.worldWidth/2, y - this.worldHeight/2) < 400) continue; 

        // ÄNDERUNG: Prüfen ob zu nah an anderen Hindernissen (min 150px Abstand)
        const tooClose = s.obstacles.some(o => Math.hypot(x - o.x, y - o.y) < 150);
        if (tooClose) continue;

        let type = "rock", color = "#555", sprite = this.sprites.rock, radius = 30 + Math.random() * 20;
            
            if (theme === 1) { // Desert
                 if (Math.random() < 0.4) { type = "cactus"; sprite = this.sprites.cactus; radius = 25; color="green"; }
                 else if (Math.random() < 0.7) { type = "cactus2"; sprite = this.sprites.cactus2; radius = 20; color="green"; }
                 else if (Math.random() > 0.7) { type = "cactus2"; sprite = this.sprites.cactus3; radius = 20; color="green"; }    
            } else if (theme === 2) { // Lava
                if (Math.random() < 0.5) { type = "vulkan"; sprite = this.sprites.vulkan; radius = 30 + Math.random() * 20; color="red"; }
                else if (Math.random() > 0.5) { type = "vulkan2"; sprite = this.sprites.vulkan2; radius = 25 + Math.random() * 20; color="red"; }
            } else if (theme === 3) { // Ice
                if (Math.random() < 0.5) { type = "icebarrel"; sprite = this.sprites.icebarrel; radius = 20; color="blue"; }
                else if (Math.random() > 0.5) { type = "icespikes"; sprite = this.sprites.icespikes; radius = 30 + Math.random() * 20; color="blue"; }
            } else if (theme === 4) { // Cave
                 if (Math.random() < 0.5) { type = "stone1"; sprite = this.sprites.stone1; radius = 30 + Math.random() * 20; color="blue"; }
                 else if (Math.random() > 0.5) { type = "stone2"; sprite = this.sprites.stone2; radius = 25 + Math.random() * 20; color="blue"; }
            } else if (theme === 5) { //Boss 1

            } else { // Dungeon
                if(Math.random() > 0.5) { type = "pillar"; sprite = this.sprites.pillar; radius = 30 + Math.random() * 20; color = "#444"; }
                else if (Math.random() < 0.5) { type = "tree"; sprite = this.sprites.tree; radius = 30 + Math.random() * 20; color="blue"; }
            }
            s.obstacles.push({ x, y, r: radius, type, sprite, color, theme });
        }
    }

    handleSpawning() {
        const s = this.state;
        if (s.stage === 0) return;

        if (s.isBossStage) {
            // Wir holen die Daten für die aktuelle Stage
            const bossData = this.getBossData(s.stage);

            // FALL A: Electric Dragon (Stage 20, 40...) -> KEINE MINIONS
            if (bossData.type === "electric_dragon") {
                return; // Keine Gegner spawnen lassen, nur der Boss ist da
            }
            
            // FALL B: Slime King (Stage 10, 30...) -> MINIONS ERLAUBT
            // Wir lassen den Code weiterlaufen, damit Slimes spawnen
            // Aber nur, wenn der Boss schon da ist (Cutscene vorbei)
            if (!s.bossSpawned) return; 
        }

        const now = Date.now();

        let currentInterval = s.spawnInterval;
        if (s.doorOpen) currentInterval = 800; // Sehr schnelles Spawnen (0.8s)
        
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

        const maxEnemies = s.doorOpen ? 80 : 10 + Math.floor(s.stage / 2); // Limit erhöhen im Rage Mode

        if (now - s.lastSpawnTime > currentInterval && s.enemies.length < maxEnemies) {
            this.spawnSingleEnemy();
            s.lastSpawnTime = now;
        }
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        
        // Nutzt jetzt die Logik von oben
        const minZoom = this.getZoomBase();
        
        // Wir nehmen den größeren Wert (minZoom) oder das was der Screen erlaubt
        this.zoom = Math.max(minZoom, Math.min(w / 1400, 3.0));
    }

    spawnBoss() {
        const s = this.state;
        const config = this.getBossData(s.stage);
        
        const hp = 1000 + (s.stage * 300); 
        const dmg = 20 + s.stage * 2;
        
        let startScaleY = 1;
        
        // --- KORREKTUR START ---
        // Wir definieren temporäre Variablen für die Positionen
        let startX = s.doorPos.x;
        let startY = s.doorPos.y;
        let targetY = s.doorPos.y;
        
        if (config.introStyle === "grow") {
            startScaleY = 0; 
        } 
        else if (config.introStyle === "fly_in") {
            // Startet weit oben außerhalb des Bildschirms (Mitte X)
            startX = s.doorPos.x;
            startY = -600; 
            targetY = s.doorPos.y; // Fliegt zur Mitte
        }
        // --- KORREKTUR ENDE ---

        const bossObj = {
            x: startX,      // Hier die Variablen nutzen
            y: startY, 
            targetY: targetY, 
            
            hp: hp * config.hpMulti, 
            maxHp: hp * config.hpMulti, 
            speed: (config.type === "electric_dragon" ? 3.5 : 2), 
            damage: dmg, 
            size: 100, 
            
            type: "boss", 
            bossType: config.type, 
            name: config.name, 
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
            minionType: config.minion,
            attackAngle: 0
        };
        
        s.enemies.push(bossObj);
        s.bossSpawned = true;
        return bossObj; 
    }

    spawnLightningWarning(x, y) {
        this.state.effects.push({
            type: "lightning_area",
            x: x, y: y,
            r: 60, 
            timer: 100, // ERHÖHT: Längeres Delay vor dem Einschlag
            stage: "warn" 
        });
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
        
        let hp = 20 + (s.stage * 8) + (difficultyTier * 70);
        let dmg = 8 + (s.stage * 1.5) + (difficultyTier * 7);
        let speed = 2.8 + (difficultyTier * 0.2); 
        speed = Math.min(4, speed);

        // ÄNDERUNG: RAGE MODE (Wenn Tür offen ist)
        if (s.doorOpen && !s.isBossStage) {
            speed *= 1.2;  // Viel schneller
            hp *= 2.0;     // Viel tankier
            dmg *= 1.5;
            // Optional: Farbe ändern oder Effekt
        }

        let type = "basic", sprite = null, ai = "chase", size = 22, color = "red", projectileSprite = "proj_basic";
        const rand = Math.random();
        let canPoison = false; 
        let causesBurn = false;
        let causesFreeze = false;
        let causesWeb = false;

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
                    else if (s.stage >= 5 && (rand >= 0.15 && rand < 0.3)) { 
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
                    } else if (s.stage >= 5 && (rand >= 0.15 && rand < 0.3)) {
                        type = "tank"; animSet = "minotaur"; size = 50; ai = "chase"; color = "#800";
                        hp *= 2.0; speed *= 0.85;
                    } else {
                        animSet = "firespirit"; color = "red";
                        speed *= 1.1; 
                    }
                    break;

                case 3: // Ice
                    if (s.stage > 10 && rand < 0.1) {
                        type = "shooter"; animSet = "icespirit"; ai = "range"; color = "black"; projectileSprite = "proj_iceball"; causesFreeze = true;
                    }
                    else if (rand > 0.7) {
                        type = "shooter"; animSet = "penguin"; ai = "range"; color = "black"; projectileSprite = "proj_basic";
                    } else if (s.stage >= 5 && (rand >= 0.15 && rand < 0.3)) {
                        type = "tank"; animSet = "yeti"; size = 50; ai = "chase"; color = "white";
                        hp *= 2.2; speed *= 0.75;
                    } else {
                        animSet = "snowman"; color = "cyan";
                    }
                    break;

                case 4: // Cave
                    if (rand > 0.65) {
                        type = "shooter"; animSet = "spider"; ai = "range"; color = "#220033"; projectileSprite = "proj_web";
                        if (s.stage >= 6) causesWeb = true; 
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
                    else if (s.stage >= 5 && (rand >= 0.15 && rand < 0.3)) { 
                        type = "tank"; animSet = "orc"; size = 50; ai = "chase"; color = "darkgreen"; 
                        hp *= 1.8; speed *= 0.85;
                    } 
                    else { animSet = "goblin"; color = "gray"; }
                    break;
                }
        }

        if (type === "shooter") { hp *= 0.6; dmg *= 1.2; }
        if (isMinion) { hp *= 0.5; size *= 0.8; }
        if (isMinion && animSet === "skeletonwarrior") {
            speed *= 1.5; // Sehr schnell -> Spieler muss Necro fokussen oder rennen
            hp *= 0.8;    // Aber nicht zu viel HP
        }
        

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
            causesWeb: causesWeb,
            isMinion: isMinion
        });
    }

    applyUpgrades(upgrades) {
        const p = this.state.player;
        if(upgrades.maxHp) { this.baseStats.maxHp += upgrades.maxHp; p.maxHp = this.baseStats.maxHp; p.hp += upgrades.maxHp; }
        if(upgrades.damage) this.baseStats.damage += upgrades.damage;
        if(upgrades.multishot) this.baseStats.multishot += upgrades.multishot;
        if(upgrades.lifesteal) this.baseStats.lifesteal += upgrades.lifesteal;
        if(upgrades.magnet) this.baseStats.magnet += upgrades.magnet; 
        if(upgrades.piercing) this.baseStats.piercing = (this.baseStats.piercing || 0) + upgrades.piercing;
        if(upgrades.fireRate) this.baseStats.fireRate = (this.baseStats.fireRate || 1) + upgrades.fireRate;
        if(upgrades.luck) this.baseStats.luck += upgrades.luck;
        this.baseStats.speed = 1;
        p.speed = 3.5 * this.baseStats.speed;
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
                s.player.shieldTimer = 180; 
                break;
            case 'spin':
                s.spinAttack.active = true;
                s.spinAttack.timer = 150; 
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

      let isMoving = false;
      if (s.player.freezeTimer <= 0 && !s.cutscene.active) {
          if (s.keys.w || s.keys.s || s.keys.a || s.keys.d) isMoving = true;
      }

      if (s.player.stunTimer > 0) {
            s.player.stunTimer--;
            // Optional: Visueller Effekt über dem Spieler
            if (s.player.stunTimer % 10 < 5) {
                this.showFloatingText(s.player.x, s.player.y - 50, "⚡", "yellow", 5);
            }
        }

      // 2. Sprite Update (JETZT HIER OBEN)
      const pAnim = this.animSprites["player"];
      if (pAnim) {
          let newSprite = pAnim.idle;
          if (isMoving && pAnim.run) {
              const tick = Math.floor(Date.now() / 150);
              if (tick % 2 === 0) newSprite = pAnim.run;
          }
          if ((s.mouse.down || s.keys[" "]) && pAnim.attack.length > 0 && !s.cutscene.active) {
             newSprite = pAnim.attack[0]; 
          }
          s.player.sprite = newSprite;
      } else {
          s.player.sprite = this.sprites.player;
      }
      
      // --- CUTSCENE LOGIC ---
      if (s.cutscene.active) {
          s.cutscene.timer++;
          const t = s.cutscene.timer;
          
          // Wir holen uns schonmal die Boss-Daten (falls gespawnt) oder generieren sie vorab zur Info
          // Da der Boss erst in Phase 1 spawnt, schauen wir auf 'getBossData' für die Planung
          const bossConfig = this.getBossData(s.stage);

          if (s.cutscene.phase === 0) {
               // Kurzes Warten bevor es losgeht
               if (t > 60) { s.cutscene.phase = 1; s.cutscene.timer = 0; }
          }
          else if (s.cutscene.phase === 1) {
               // --- KAMERA FAHRT ZUM STARTPUNKT ---
               const visibleW = this.width / this.zoom;
               const visibleH = this.height / this.zoom;
               
               let targetCamX = s.doorPos.x - (visibleW / 2);
               let targetCamY = s.doorPos.y - (visibleH / 2);

               // SPEZIAL DRACHE: Kamera guckt erst in den Himmel
               if (bossConfig.type === "electric_dragon") {
                   targetCamY = -400; 
               }

               s.camera.x += (targetCamX - s.camera.x) * 0.04;
               s.camera.y += (targetCamY - s.camera.y) * 0.04;
               
               // Wenn Zeit um ist -> Boss spawnen
               if (t > 120) { 
                   const newBoss = this.spawnBoss(); 
                   s.cutscene.phase = 2; 
                   s.cutscene.timer = 0; 
               }
          }
          else if (s.cutscene.phase === 2) {
               // --- INTRO ANIMATION (Geteilt) ---
               const boss = s.enemies.find(e => e.isBoss);
               const visibleH = this.height / this.zoom;

               if (boss) {
                   // === FALL A: DRACHE (Fliegt rein) ===
                   if (boss.introStyle === "fly_in") {
                        boss.visible = true;
                        
                        // 1. langsame Bewegung nach unten
                        boss.y += 5; 

                        // 2. Kamera folgt dem Drachen sanft nach unten
                        // Wir wollen den Drachen im oberen Drittel behalten
                        const desiredCamY = boss.y - (visibleH * 0.3);
                        s.camera.y += (desiredCamY - s.camera.y) * 0.08;
                        
                        // Animation
                        const tick = Math.floor(Date.now() / 150);
                        const frame = tick % 4;
                        if(frame === 0) boss.sprite = this.sprites.boss2_fly1;
                        else if(frame === 1) boss.sprite = this.sprites.boss2_fly2;
                        else if(frame === 2) boss.sprite = this.sprites.boss2_fly3;
                        else boss.sprite = this.sprites.boss2_fly4;

                        // Landung prüfen
                        if (boss.y >= boss.targetY) {
                            boss.y = boss.targetY;
                            boss.state = 'idle';
                            boss.sprite = this.sprites.boss2_idle; 
                            
                            // Warten (Delay nach Landung für Dramatik)
                            if (s.cutscene.timer > 200) { 
                                 s.cutscene.phase = 3; 
                                 s.cutscene.timer = 0;
                            }
                        }
                   } 
                   // === FALL B: SLIME (Wächst aus Boden) ===
                   else if (boss.introStyle === "grow") {
                       boss.visible = true;
                       boss.scaleY += 0.01;
                       if (boss.scaleY >= 1) { 
                           boss.scaleY = 1; 
                           // Slime geht sofort in Phase 3 über, keine Landepause nötig
                           s.cutscene.phase = 3; 
                           s.cutscene.timer = 0; 
                       }
                   }
               }
          }
          else if (s.cutscene.phase === 3) {
              // --- BOSS ACTION / SCHREI ---
              const boss = s.enemies.find(e => e.isBoss);
              
              if (boss) {
                  // === DRACHE ===
                  if (boss.bossType === "electric_dragon") {
                      // Kamera wackelt stark beim Schrei
                      s.camera.x += (Math.random()-0.5) * 6;
                      s.camera.y += (Math.random()-0.5) * 6;
                      
                      boss.sprite = this.sprites.boss2_attack1; // Mund offen
                      
                      if (t === 10) this.showFloatingText(boss.x, boss.y - 120, "ROAAAAR!!!", "red", 80);
                  } 
                  // === SLIME ===
                  else {
                      // Die alte Slime Animation (Charge -> Slam)
                      if (t < 20) boss.sprite = this.sprites.boss1_charge1;
                      else if (t < 40) boss.sprite = this.sprites.boss1_charge2;
                      else boss.sprite = this.sprites.boss1_slam;
                      
                      if (t === 10) this.showFloatingText(boss.x, boss.y - 100, "BLUBB!!", "lime", 60);
                  }
              }

              // Länge der Phase
              if (t > 100) { 
                  if(boss) boss.sprite = (boss.bossType === "electric_dragon") ? this.sprites.boss2_idle : this.sprites.boss1_idle; 
                  s.cutscene.phase = 4; 
                  s.cutscene.timer = 0;
                  this.onUpdateUI({ topMessage: null }); 
              }
          }
          else if (s.cutscene.phase === 4) {
              // --- ZURÜCK ZUM SPIELER ---
              // Das ist für beide gleich
              const visibleW = this.width / this.zoom;
              const visibleH = this.height / this.zoom;
              const targetCamX = s.player.x - visibleW / 2;
              const targetCamY = s.player.y - visibleH / 2;

              s.camera.x += (targetCamX - s.camera.x) * 0.05;
              s.camera.y += (targetCamY - s.camera.y) * 0.05;

              if (t > 60) {
                  s.cutscene.active = false;
                  // ... Kampf Start ...
                  const boss = s.enemies.find(e => e.isBoss);
                  if(boss) boss.state = 'idle'; 
                  
                  this.onUpdateUI({ topMessage: "FIGHT!" });
                  setTimeout(() => { if(this.state.running) this.onUpdateUI({ topMessage: null }); }, 2000);
              }
          }
          // === NEU: PHASE 2 CUTSCENE (Startet bei Phase 10) ===
          if (s.cutscene.phase === 10) {
               // CAM TO BOSS
               const boss = s.enemies.find(e => e.isBoss);
               if (!boss) { s.cutscene.active = false; return; }

               const visibleW = this.width / this.zoom;
               const visibleH = this.height / this.zoom;
               const targetCamX = boss.x - (visibleW / 2);
               const targetCamY = boss.y - (visibleH / 2);

               s.camera.x += (targetCamX - s.camera.x) * 0.1; // Schnellerer Schwenk
               s.camera.y += (targetCamY - s.camera.y) * 0.1;

               if (t > 40) { // Nach kurzem Schwenk
                   s.cutscene.phase = 11;
                   s.cutscene.timer = 0;
                   
                   // Animation setzen & Text
                   if (boss.bossType === "electric_dragon") boss.sprite = this.sprites.boss2_attack1;
                   else boss.sprite = this.sprites.boss1_slam;
                   
                   this.showFloatingText(boss.x, boss.y - 120, "☠️ RAGE MODE ☠️", "red", 100);
               }
          }
          else if (s.cutscene.phase === 11) {
               // HOLD / ANIMATION
               // Hier passiert nichts außer Warten, damit der Spieler den Text lesen kann
               if (t > 90) { // 1.5 Sekunden Pause
                   s.cutscene.phase = 12; 
                   s.cutscene.timer = 0;
                   const boss = s.enemies.find(e => e.isBoss);
                   if(boss) boss.sprite = (boss.bossType === "electric_dragon") ? this.sprites.boss2_idle : this.sprites.boss1_idle;
               }
          }
          else if (s.cutscene.phase === 12) {
               // CAM BACK TO PLAYER
               const visibleW = this.width / this.zoom;
               const visibleH = this.height / this.zoom;
               const targetCamX = s.player.x - visibleW / 2;
               const targetCamY = s.player.y - visibleH / 2;

               s.camera.x += (targetCamX - s.camera.x) * 0.1;
               s.camera.y += (targetCamY - s.camera.y) * 0.1;

               if (t > 30) {
                   s.cutscene.active = false; // Zurück zum Spiel
               }
          }
          return; 
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
      // Web
      if (s.player.webbedTimer > 0) {
            s.player.webbedTimer--;
            // Optional: Visual Feedback "WEB"
            if(s.player.webbedTimer % 20 === 0) this.showFloatingText(s.player.x, s.player.y-50, "WEBBED", "white", 10);
        }
        // Movement Speed Berechnung
    

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
      let currentSpeed = s.player.speed * (s.player.fastBootsTimer > 0 ? 2 : 1);
      if (s.player.webbedTimer > 0) currentSpeed *= 0.4;
      if (s.player.freezeTimer <= 0 && s.player.stunTimer <= 0) {
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

      if ((s.mouse.down || s.keys[" "]) && now - s.lastShot > fireDelay && s.player.stunTimer <= 0) {
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
                  if (b.hitList.includes(e)) return;
                  
                  if (e.invincible) return;
                  
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
                    if (e.web) s.player.webbedTimer = 120; 
                    if(s.player.hp <= 0) this.triggerGameOver();
                  }
              }
          }

          if (e.isBoss && !e.phase2Seen && e.hp < e.maxHp * 0.5) {
              e.phase2Seen = true; // Flag setzen damit es nur 1x passiert
              
              // Cutscene starten
              s.cutscene.active = true;
              s.cutscene.phase = 10; // Startet unsere neue Logik
              s.cutscene.timer = 0;
              
              // Sicherstellen, dass der Boss kurz stillsteht
              e.state = 'idle'; 
              e.stateTimer = 0;
              
              // Alle Projektile löschen für fairen Reset? (Optional, hier lassen wir sie mal)
              return; // Loop für diesen Frame abbrechen
          }

          if(s.decoy && s.decoy.hp <= 0) {
              s.decoy = null;
              this.showFloatingText(s.player.x, s.player.y, "DECOY DESTROYED", "gray");
          }
          

          // --- AI BEHAVIOR ---
          if (e.bossType === 'electric_dragon') {
    
            const isPhase2 = e.hp < e.maxHp * 0.5;

            // Speed: Etwas langsamer als Spieler
            e.speed = s.player.speed * 0.85; 

            if (!e.state) e.state = 'idle';
            if (!e.patternCount) e.patternCount = 0;

            if (typeof e.attacksSinceWall === 'undefined') e.attacksSinceWall = 3;

            // --- STATES ---
            
            if (e.state === 'idle') {
                e.stateTimer += isPhase2 ? 1.5 : 1;
                
                // Movement (Chase)
                const dist = Math.hypot(s.player.x - e.x, s.player.y - e.y);
                const angle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
                
                if (dist > 150) {
                    e.x += Math.cos(angle) * e.speed;
                    e.y += Math.sin(angle) * e.speed;
                    const tick = Math.floor(Date.now() / 150);
                    e.sprite = (tick % 2 === 0) ? this.sprites.boss2_walk1 : this.sprites.boss2_walk2;
                } else {
                    e.state = 'bite_attack'; e.stateTimer = 0;
                }

                // Attack Selection
                const attackThreshold = isPhase2 ? 70 : 100;

                if (e.stateTimer > attackThreshold) { 
                    e.stateTimer = 0;
                    e.patternCount++;
                    
                    if (e.patternCount % 6 === 0) {
                        e.state = 'fly_up_start'; 
                        e.attacksSinceWall++;
                    }
                    else {
                        let nextAttack = '';
                        const rand = Math.random();
                        if (rand < 0.33) nextAttack = 'triple_beam_charge';
                        else if (rand < 0.66) nextAttack = 'orb_summon';
                        else nextAttack = 'wall_sweep_start';

                        if (nextAttack === 'wall_sweep_start') {
                            if (e.attacksSinceWall < 3) { 
                                // Zu früh! Wähle stattdessen Orbs oder Beam
                                nextAttack = Math.random() > 0.5 ? 'orb_summon' : 'triple_beam_charge';
                                e.attacksSinceWall++;
                            } else {
                                // Erlaubt! Reset Counter.
                                e.attacksSinceWall = 0;
                            }
                        } else {
                            // Andere Attacke gewählt -> Counter hochzählen
                            e.attacksSinceWall++;
                        }

                        e.state = nextAttack;
                    }
                }
            }

            // A. NAHKAMPF BISS
            else if (e.state === 'bite_attack') {
                e.stateTimer++;
                if (e.stateTimer < 20) { e.sprite = this.sprites.boss2_charge; } 
                else {
                    e.sprite = this.sprites.boss2_attack1;
                    if (e.stateTimer === 25) {
                        if (Math.hypot(s.player.x - e.x, s.player.y - e.y) < e.size + s.player.size + 50) {
                             if (!s.player.shieldActive) {
                                s.player.hp -= 20; s.player.flashRedTimer = 10;
                                if(s.player.hp <= 0) this.triggerGameOver();
                            }
                        }
                    }
                    if (e.stateTimer > 40) e.state = 'idle';
                }
            }
            
            // B. TRIPLE BEAM
            else if (e.state === 'triple_beam_charge') {
                e.stateTimer++;
                e.sprite = this.sprites.boss2_charge; 
                
                const lockTime = isPhase2 ? 30 : 50; 
                const fireTime = isPhase2 ? 50 : 70; 

                if (e.stateTimer < lockTime) {
                    e.attackAngle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
                } else if (e.stateTimer === lockTime) {
                    this.showFloatingText(e.x, e.y - 80, "TRIPLE BEAM!", "cyan", 20);
                }
                
                if (e.stateTimer > fireTime) { 
                    e.state = 'triple_beam_fire';
                    e.stateTimer = 0;
                }
            }
            else if (e.state === 'triple_beam_fire') {
                e.stateTimer++;
                const tick = Math.floor(Date.now() / 100);
                e.sprite = (tick % 2 === 0) ? this.sprites.boss2_attack1 : this.sprites.boss2_attack2;

                if (e.stateTimer % 4 === 0) { 
                    const angles = [e.attackAngle, e.attackAngle - 0.35, e.attackAngle + 0.35];
                    let hit = false;
                    angles.forEach(ang => {
                        if (hit) return;
                        const dx = s.player.x - e.x; const dy = s.player.y - e.y;
                        const dist = Math.hypot(dx, dy);
                        const beamDx = Math.cos(ang); const beamDy = Math.sin(ang);
                        const dot = dx * beamDx + dy * beamDy;
                        const cross = Math.abs(dx * beamDy - dy * beamDx);

                        if (dot > 0 && dist < 1200 && cross < 40) hit = true;
                    });
                    
                    if (hit && !s.player.shieldActive) {
                        s.player.hp -= 5; s.player.flashRedTimer = 5;
                        if(s.player.hp <= 0) this.triggerGameOver();
                    }
                }
                if (e.stateTimer > 60) e.state = 'idle';
            }

            // C. ORBS (LANGSAMER!)
            else if (e.state === 'orb_summon') {
                e.stateTimer++;
                e.sprite = this.sprites.boss2_attack1; 
                if (e.stateTimer === 25) {
                    // SPEED CHANGE: 60% vom Spieler Speed (deutlich langsamer)
                    const ballSpeed = s.player.speed * 1;
                    
                    const orbCount = isPhase2 ? 8 : 5;
                    for(let i=0; i<orbCount; i++) {
                        const angle = (Math.PI * 2 / orbCount) * i;
                        s.enemyBullets.push({
                            x: e.x, y: e.y,
                            vx: Math.cos(angle) * ballSpeed, vy: Math.sin(angle) * ballSpeed,
                            damage: 15, size: 14, life: 300, 
                            type: "homing_orb", color: "cyan", 
                            sprite: this.sprites.electric_ball 
                        });
                    }
                }
                if (e.stateTimer > 50) e.state = 'idle';
            }

            // D. ELECTRIC WALL SWEEP (Optik angepasst)
            else if (e.state === 'wall_sweep_start') {
                e.stateTimer++;
                e.sprite = this.sprites.boss2_attack1;
                if (e.stateTimer === 1) this.showFloatingText(e.x, e.y - 80, "WALL SWEEP!", "purple", 30);
                
                if (e.stateTimer > 30) {
                    const isHorizontal = Math.random() > 0.5;
                    const wallSpeed = s.player.speed; 
                    
                    // OPTIK CHANGE: Engeres Spacing, kleinere Größe
                    const spacing = 30; // Bälle näher zusammen
                    const ballSize = 14; // Originalgröße, nicht verzerrt
                    
                    const gapSize = 250;
                    
                    if (isHorizontal) {
                        const fromLeft = s.player.x > this.worldWidth / 2;
                        const startX = fromLeft ? -100 : this.worldWidth + 100;
                        const velX = fromLeft ? wallSpeed : -wallSpeed;
                        const gapY = 100 + Math.random() * (this.worldHeight - 200 - gapSize);

                        for (let y = 0; y < this.worldHeight; y += spacing) {
                            if (y > gapY && y < gapY + gapSize) continue;
                            s.enemyBullets.push({
                                x: startX, y: y, vx: velX, vy: 0,
                                damage: 20, size: ballSize, life: 800,
                                type: "wall_segment", sprite: this.sprites.electric_ball 
                            });
                        }
                    } else {
                        const fromTop = Math.random() > 0.5;
                        const startY = fromTop ? -100 : this.worldHeight + 100;
                        const velY = fromTop ? wallSpeed : -wallSpeed;
                        const gapX = 100 + Math.random() * (this.worldWidth - 200 - gapSize);

                        for (let x = 0; x < this.worldWidth; x += spacing) {
                            if (x > gapX && x < gapX + gapSize) continue;
                            s.enemyBullets.push({
                                x: x, y: startY, vx: 0, vy: velY,
                                damage: 20, size: ballSize, life: 800,
                                type: "wall_segment", sprite: this.sprites.electric_ball
                            });
                        }
                    }
                    e.state = 'idle'; e.stateTimer = 0;
                }
            }

            // E. ULTIMATE: RAIN
            else if (e.state === 'fly_up_start') {
                e.stateTimer++;
                const tick = Math.floor(Date.now() / 150);
                e.sprite = [this.sprites.boss2_fly1, this.sprites.boss2_fly2, this.sprites.boss2_fly3, this.sprites.boss2_fly4][tick % 4];
                e.y -= 5; e.invincible = true; 
                if (e.stateTimer > 40) { e.state = 'raining'; e.stateTimer = 0; e.rainWaves = 0; }
            }
            else if (e.state === 'raining') {
                e.stateTimer++;
                const tick = Math.floor(Date.now() / 150);
                e.sprite = [this.sprites.boss2_fly1, this.sprites.boss2_fly2, this.sprites.boss2_fly3, this.sprites.boss2_fly4][tick % 4];
                e.x += Math.sin(Date.now() / 500) * 3;
                const waveDelay = isPhase2 ? 25 : 45;
                if (e.stateTimer % waveDelay === 0) { 
                    e.rainWaves++;
                    this.spawnLightningWarning(s.player.x, s.player.y); 
                    const bolts = isPhase2 ? 6 : 3;
                    for(let i=0; i<bolts; i++) {
                        const ang = Math.random()*6.28; const d = 100 + Math.random()*500;
                        this.spawnLightningWarning(s.player.x + Math.cos(ang)*d, s.player.y + Math.sin(ang)*d);
                    }
                }
                if (e.rainWaves >= (isPhase2?10:6)) { e.state = 'land'; e.stateTimer = 0; }
            }
            else if (e.state === 'land') {
                e.sprite = this.sprites.boss2_fly1; e.y += 9; 
                if (e.y >= s.doorPos.y) {
                    e.y = s.doorPos.y; this.showFloatingText(e.x, e.y, "BOOM!", "yellow", 40);
                    e.invincible = false; e.state = 'idle';
                }
            }
        }


          else if (e.bossType === 'slime_king') {
               // Boss AI Machine
               // Init State
               const isPhase2 = e.hp < e.maxHp * 0.5;
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
                        if (isPhase2 ? e.patternCount % 3 === 0 : e.patternCount % 4 === 0) e.state = 'charge_start';
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
                    this.showFloatingText(e.x, e.y-80, "!!!", "red", 20);
                    e.stateTimer++;
                    
                    const chargeTimeNeeded = isPhase2 ? 20 : 40; 
        
                    if (e.stateTimer < chargeTimeNeeded / 2) currentSprite = this.sprites.boss1_charge1;
                    else currentSprite = this.sprites.boss1_charge2;

                    if(e.stateTimer > chargeTimeNeeded) {
                        e.state = 'charge_attack';
                        e.stateTimer = 0;
                        e.chargeAngle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
                    }
               }
               else if (e.state === 'charge_attack') {
                    e.stateTimer++;
                    // Sehr schnelle Pfützen-Legung
                    const speed = isPhase2 ? 40 : 25; // Projektil/Legung sehr schnell
                    const dist = e.stateTimer * speed;
                    
                    const px = e.x + Math.cos(e.chargeAngle) * dist;
                    const py = e.y + Math.sin(e.chargeAngle) * dist;
                    
                    // Pfützen legen
                    if (px > 0 && px < this.worldWidth && py > 0 && py < this.worldHeight) {
                        s.acidPuddles.push({ 
                            x: px, y: py, r: 35, 
                            life: 800, 
                            lastDmg: 0 
                        });
                    }

                    // Bis weit hinter den Spieler (z.B. 1500px weit)
                    if (dist > 4000) e.state = 'idle';
                  
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
                      color: "#4B0082", sprite: this.sprites.proj_laser // Nutzt Gift-Sprite
                  });
                  e.lastAttack = now;
              }

              // 3. BESCHWÖRUNG (4 Skelette gleichzeitig)
              if (!e.lastSummon) e.lastSummon = now; // Init
              if (now - e.lastSummon > 10000) {
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
              let keepDist = 350; 
              let projectileSpeed = 5 + tier;
              let projectileLife = 100; // Wie weit fliegt es (Frames)

              // --- SPEZIAL LOGIK FÜR SNIPER ---
              // Ice Spirits und Fire Spewer bekommen mehr Reichweite und Speed
              if (e.animSet === "icespirit" || e.animSet === "firespewer") {
                  keepDist = 500;        // Halten viel mehr Abstand
                  projectileSpeed = 8 + tier;   // Projektile sind deutlich schneller
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
                      freeze: e.causesFreeze,
                      web: e.causesWeb
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
      
      s.enemyBullets.forEach(b => {
        if (b.type === "homing_orb") {
            // Zielwinkel berechnen
            const angle = Math.atan2(s.player.y - b.y, s.player.x - b.x);
            
            // Beschleunigung verringern (vorher 0.2, jetzt 0.05 für sanftere Kurven)
            b.vx += Math.cos(angle) * 0.05; 
            b.vy += Math.sin(angle) * 0.05;

            // Speed Cap setzen (Maximalgeschwindigkeit)
            const speed = Math.hypot(b.vx, b.vy);
            
            // WICHTIG: Das Cap auf ca. 3.5 setzen (Spieler hat Standard ~3 bis 4).
            // Vorher war es 6 (viel zu schnell).
            const maxSpeed = s.player.speed * 0.8 ; 
            
            if (speed > maxSpeed) { 
                // Vektor normalisieren und auf maxSpeed begrenzen
                const scale = maxSpeed / speed;
                b.vx *= scale; 
                b.vy *= scale; 
            }
        }
         b.x += b.vx; b.y += b.vy; b.life--;
      });
      s.enemyBullets = s.enemyBullets.filter(b => {
          if (b.life <= 0) return false;

          const dist = Math.hypot(b.x - s.player.x, b.y - s.player.y);
          
          // Wall Segmente haben eine etwas größere Hitbox, damit man nicht durchglitcht
          const hitSize = (b.type === 'wall_segment') ? b.size + 10 : b.size;

          // WICHTIG: Hier 'hitSize' nutzen statt b.size
          if(dist < s.player.size + hitSize) {
              if(!s.player.shieldActive) {
                  
                  // 1. Wall Segment Cooldown Check 
                  // (Verhindert, dass man 60x pro Sekunde Schaden bekommt, wenn die Wand durch einen fliegt)
                  const now = Date.now();
                  if (b.type === 'wall_segment' && (now - (s.player.lastWallHit || 0) < 500)) {
                      return true; // Wand existiert weiter, macht aber gerade keinen Schaden
                  }

                  // 2. Schaden & Effekte anwenden
                  s.player.hp -= b.damage;
                  s.player.flashRedTimer = 10;
                  
                  // Wenn es eine Wand war, Zeitstempel für Cooldown setzen
                  if (b.type === 'wall_segment') s.player.lastWallHit = now;

                  if (b.poison) s.player.poisonedTimer = 300;
                  if (b.burn) s.player.burnTimer = 180;
                  if (b.freeze) s.player.freezeTimer = 60;
                  if (b.web) s.player.webbedTimer = 120;
                  
                  // NEU: Stun Effekt (für Beam, Orbs und Walls)
                  if (b.stun) {
                      s.player.stunTimer = 20; 
                      // Optional: Text anzeigen
                      // this.showFloatingText(s.player.x, s.player.y - 40, "STUN", "yellow", 10);
                  }

                  if (s.player.hp <= 0) this.triggerGameOver();
              }
              
              // 3. Zerstörungs-Logik
              // Wall Segmente fliegen weiter durch den Spieler durch (return true)
              // Normale Kugeln gehen beim Treffer kaputt (return false)
              if (b.type === 'wall_segment') return true;
              
              return false;
          }
          return true;
      });

      s.effects.forEach((eff, i) => {
          if (eff.type === "beam") {
              eff.life--;
              if(eff.life <= 0) s.effects.splice(i, 1);
          }
          if (eff.type === "lightning_area") {
            eff.timer--;
            if (eff.timer <= 0 && eff.stage === "warn") {
                eff.stage = "damage";
                eff.timer = 10; 

                if (Math.hypot(s.player.x - eff.x, s.player.y - eff.y) < eff.r) {
                    if(!s.player.shieldActive) {
                        s.player.hp -= 25;
                        s.player.flashRedTimer = 10;
                        s.player.stunTimer = 60; 
                        
                        // FIX: Game Over prüfen, damit man nicht ins Minus geht
                        if (s.player.hp <= 0) this.triggerGameOver();
                    }
                }
            }
            if (eff.timer <= 0 && eff.stage === "damage") {
                s.effects.splice(i, 1); // Löschen
            }
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
            // 1. LIGHTNING AREA (Warnung & Blitz)
            if (eff.type === "lightning_area") {
                ctx.save();
                ctx.translate(eff.x, eff.y);
                
                ctx.shadowBlur = 0; 
                ctx.shadowColor = 'transparent';
                ctx.globalCompositeOperation = 'source-over';

                if (eff.stage === "warn") {
                    const pulse = 0.6 + Math.sin(Date.now() / 100) * 0.4; 
                    ctx.globalAlpha = pulse;
                    const size = eff.r * 2.8; 

                    if (this.sprites.warning_circle && this.sprites.warning_circle.complete && this.sprites.warning_circle.naturalWidth > 0) {
                        ctx.drawImage(this.sprites.warning_circle, -size/2, -size/2, size, size);
                    } else {
                        ctx.strokeStyle = "red"; ctx.lineWidth = 3;
                        ctx.beginPath(); ctx.arc(0,0, eff.r, 0, Math.PI*2); ctx.stroke();
                    }
                } 
                else {
                    // Damage
                    ctx.globalAlpha = 1.0;
                    ctx.fillStyle = "white"; ctx.shadowColor = "cyan"; ctx.shadowBlur = 40; 
                    ctx.beginPath(); ctx.arc(0,0, eff.r, 0, Math.PI*2); ctx.fill();
                    ctx.shadowBlur = 0; 

                    if (this.sprites.lightning_strike && this.sprites.lightning_strike.complete) {
                         const lWidth = 140; const lHeight = 800; 
                         ctx.drawImage(this.sprites.lightning_strike, -lWidth/2, -lHeight + 50, lWidth, lHeight);
                    }
                }
                ctx.restore();
                return; // <--- WICHTIG: Hier abbrechen, damit kein schwarzer Kreis drüber gemalt wird!
            }
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
        if (e.bossType === 'electric_dragon') {
            // Triple Beam Zeichnen
            if (e.state === 'triple_beam_charge' || e.state === 'triple_beam_fire') {
                ctx.save();
                ctx.translate(e.x, e.y);
                
                // Wir zeichnen 3 Linien
                const angles = [e.attackAngle, e.attackAngle - 0.35, e.attackAngle + 0.35];
                
                angles.forEach(ang => {
                    ctx.save();
                    ctx.rotate(ang);
                    if (e.state === 'triple_beam_charge') {
                        // Dünne Warnlinie
                        ctx.strokeStyle = "rgba(255, 0, 0, 0.5)"; ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
                        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(1200, 0); ctx.stroke();
                    } else {
                        // Dicker Strahl
                        ctx.strokeStyle = "cyan"; ctx.lineWidth = 30; ctx.shadowBlur = 20; ctx.shadowColor = "blue";
                        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(1200, 0); ctx.stroke();
                        ctx.strokeStyle = "white"; ctx.lineWidth = 8; ctx.shadowBlur = 0;
                        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(1200, 0); ctx.stroke();
                    }
                    ctx.restore();
                });
                ctx.restore();
            }
        }
          if (e.visible === false) return;
          this.drawCharacter(ctx, e.sprite, e.x, e.y, e.size*2, e.size*2, e.facingLeft, e.scaleY || 1);
          
          // FIX: Mini-HP Leiste nur zeichnen, wenn es NICHT der Boss ist
          if (!e.isBoss) {
              ctx.fillStyle = "red"; ctx.fillRect(e.x - 15, e.y - 30, 30, 3);
              ctx.fillStyle = "lime"; ctx.fillRect(e.x - 15, e.y - 30, 30 * (Math.max(0,e.hp)/e.maxHp), 3);
          }
      });

      s.bullets.forEach(b => { 
          if (b.type === 'grenade') {
               // Granaten sollen sich weiter drehen (keine Spiegelung nötig)
               const bAngle = Math.atan2(b.vy, b.vx);
               this.drawSprite(ctx, b.sprite, b.x, b.y, 16, 16, bAngle + (Date.now()/50), "green", "circle");
          } else {
              // --- NEUE LOGIK: SPIEGELN STATT ÜBER KOPF DREHEN ---
              
              const isMovingLeft = b.vx < 0;
              
              // Winkelberechnung:
              // Wenn wir nach links fliegen (gespiegelt), müssen wir vx für die Winkelberechnung
              // negieren, damit die Nase des Projektils relativ zur Spiegelung richtig zeigt.
              const rotation = isMovingLeft 
                  ? Math.atan2(b.vy, -b.vx) 
                  : Math.atan2(b.vy, b.vx);

              ctx.save();
              ctx.translate(b.x, b.y);

              if (isMovingLeft) {
                  ctx.scale(-1, 1); // Horizontal spiegeln (wie beim Spieler)
              }

              ctx.rotate(rotation);

              const w = b.size * 3;
              const h = b.size * 3;

              if (b.sprite && b.sprite.complete && b.sprite.naturalWidth > 0) {
                   ctx.drawImage(b.sprite, -w/2, -h/2, w, h);
              } else {
                   // Fallback (Gelber Kreis), falls Bild fehlt
                   ctx.fillStyle = "yellow";
                   ctx.beginPath(); ctx.arc(0, 0, b.size, 0, Math.PI*2); ctx.fill();
              }
              
              ctx.restore();
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