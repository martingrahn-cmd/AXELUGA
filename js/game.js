import {
    GAME_W, GAME_H, PLAYER_SPEED, PLAYER_BULLET_SPEED, PLAYER_FIRE_RATE,
    PLAYER_MAX_HP, PLAYER_INVULN_TIME, ENEMY_BULLET_SPEED,
    SPRITES, WAVE_CONFIG, ENEMY_DEFS, BOSS_DEF, WORLDS,
    DYL_ENEMIES, MINI_BOSS_DEFS, DYL_BACKGROUNDS
} from './config.js';
import { Input } from './input.js';
import { Audio } from './audio.js';

// ─── Asset Loader ───
class Assets {
    constructor() {
        this.images = {};
        this.loaded = 0;
        this.total = 0;
    }

    load(manifest) {
        return new Promise((resolve) => {
            const files = manifest;
            this.total = files.length;
            if (this.total === 0) { resolve(); return; }

            files.forEach(f => {
                const img = new Image();
                img.onload = () => {
                    this.loaded++;
                    const bar = document.getElementById('loadBar');
                    if (bar) bar.style.width = (this.loaded / this.total * 100) + '%';
                    if (this.loaded >= this.total) resolve();
                };
                img.onerror = () => {
                    console.warn('Failed to load:', f);
                    this.loaded++;
                    if (this.loaded >= this.total) resolve();
                };
                img.src = 'assets/' + f;
                this.images[f] = img;
            });
        });
    }

    get(name) { return this.images[name]; }
}

// ─── Particle System ───
class Particles {
    constructor() {
        this.particles = [];
    }

    emit(x, y, count, color, speed = 3, life = 30) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = (0.5 + Math.random()) * speed;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                life,
                maxLife: life,
                color,
                size: 1 + Math.random() * 2,
            });
        }
    }

    emitTrail(x, y, color = '#4af') {
        this.particles.push({
            x: x + (Math.random() - 0.5) * 6,
            y: y + 4,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 1 + Math.random() * 2,
            life: 15,
            maxLife: 15,
            color,
            size: 1 + Math.random(),
        });
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.life--;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    }
}

// ─── Background Parallax ───
class Background {
    constructor(assets) {
        this.assets = assets;
        // Keep old layers as fallback
        this.layers = SPRITES.backgrounds.map(bg => ({
            img: assets.get(bg.file),
            baseSpeed: bg.speed,
            speed: bg.speed,
            y: 0,
        }));
        this.tint = null;
        this.speedMult = 1.0;

        // DyLEStorm layers
        this.baseImg = assets.get('dyl_bg_purple.png');
        this.starsImg1 = assets.get('dyl_stars1.png');
        this.starsImg2 = assets.get('dyl_stars2.png');
        this.baseY = 0;
        this.stars1Y = 0;
        this.stars2Y = 0;

        // Floating decorations (nebulae + planets)
        this.decorations = [];
        // Side blocks
        this.blocks = { active: false, y: 0, speed: 0.6, pattern: [] };
        // Buildings on blocks
        this.buildingDecs = [];
        // Ground pieces
        this.groundDecs = [];
        this.hasGround = false;
        this.groundScrollY = 0;
        this.groundSpeed = 0;
        this.useDylBg = false;
    }

    setWorld(world) {
        this.tint = world.tint;
        this.speedMult = world.bgSpeedMult;
        for (const layer of this.layers) {
            layer.speed = layer.baseSpeed * this.speedMult;
        }

        // Use DyLEStorm bg if world has nebulae defined
        this.useDylBg = !!(world.nebulae && world.nebulae.length > 0);
        if (!this.useDylBg) return;

        // Setup floating nebulae
        this.decorations = [];
        for (const nFile of (world.nebulae || [])) {
            const img = this.assets.get(nFile);
            if (!img) continue;
            this.decorations.push({
                img, type: 'nebula',
                x: Math.random() * (GAME_W - img.width * 0.8),
                y: Math.random() * GAME_H,
                speed: 0.15 + Math.random() * 0.15,
                alpha: 0.35 + Math.random() * 0.2,
                scale: 0.8 + Math.random() * 0.4,
            });
        }
        // Setup floating planets — spawn multiple if world has many
        for (const pFile of (world.planets || [])) {
            const img = this.assets.get(pFile);
            if (!img) continue;
            this.decorations.push({
                img, type: 'planet',
                x: 30 + Math.random() * (GAME_W - 120),
                y: -50 - Math.random() * 500,
                speed: 0.18 + Math.random() * 0.15,
                alpha: 0.9,
                scale: 0.6 + Math.random() * 0.6,
            });
        }

        // Side blocks
        this.blocks.active = !!world.blocks;
        if (this.blocks.active) {
            this.blocks.speed = 0.6 * this.speedMult;
            this.blocks.pattern = [];
            for (let i = 0; i < 12; i++) {
                this.blocks.pattern.push(Math.floor(Math.random() * 3) + 1);
            }
        }

        // Buildings
        this.buildingDecs = [];
        if (world.buildings) {
            for (let i = 0; i < 5; i++) {
                const side = i % 2 === 0 ? 'left' : 'right';
                const bIdx = (i % 3) + 1;
                const img = this.assets.get(`dyl_buildings_0${bIdx}.png`);
                if (!img) continue;
                this.buildingDecs.push({
                    img, side,
                    y: i * 180 + Math.random() * 80,
                    speed: 0.5 * this.speedMult,
                });
            }
        }

        // Ground pieces (floor panels between walls)
        this.groundDecs = [];
        this.hasGround = !!world.ground;
        this.groundScrollY = 0;
        if (this.hasGround) {
            this.groundSpeed = 0.55 * this.speedMult;
        }
    }

    update() {
        // Timberlate fallback
        for (const layer of this.layers) {
            layer.y += layer.speed;
            if (layer.y >= 320) layer.y -= 320;
        }

        if (!this.useDylBg) return;

        // DyLEStorm layers
        const spd = this.speedMult;
        this.baseY += 0.3 * spd;
        this.stars1Y += 0.5 * spd;
        this.stars2Y += 0.8 * spd;
        if (this.baseImg) { if (this.baseY >= this.baseImg.height) this.baseY -= this.baseImg.height; }
        if (this.starsImg1) { if (this.stars1Y >= this.starsImg1.height) this.stars1Y -= this.starsImg1.height; }
        if (this.starsImg2) { if (this.stars2Y >= this.starsImg2.height) this.stars2Y -= this.starsImg2.height; }

        // Floating decorations
        for (const d of this.decorations) {
            d.y += d.speed * spd;
            const h = d.img.height * d.scale;
            if (d.y > GAME_H + h) {
                d.y = -h - Math.random() * 200;
                if (d.type === 'planet') {
                    d.x = 30 + Math.random() * (GAME_W - 100);
                } else {
                    d.x = -50 + Math.random() * (GAME_W - 50);
                }
            }
        }

        // Side blocks
        if (this.blocks.active) {
            this.blocks.y += this.blocks.speed;
            if (this.blocks.y >= 80) this.blocks.y -= 80;
        }

        // Buildings
        for (const b of this.buildingDecs) {
            b.y += b.speed;
            if (b.y > GAME_H + 100) {
                b.y = -100 - Math.random() * 200;
            }
        }

        // Ground scroll
        if (this.hasGround) {
            this.groundScrollY += this.groundSpeed;
        }
    }

    draw(ctx) {
        if (!this.useDylBg) {
            // Fallback: Timberlate parallax
            for (const layer of this.layers) {
                if (!layer.img) continue;
                const y = Math.floor(layer.y);
                for (let ty = y - 320; ty < GAME_H; ty += 320) {
                    ctx.drawImage(layer.img, 0, 0, 320, 320, 0, ty, GAME_W, 320);
                }
            }
            if (this.tint) {
                ctx.fillStyle = `rgba(${this.tint.r},${this.tint.g},${this.tint.b},${this.tint.a})`;
                ctx.fillRect(0, 0, GAME_W, GAME_H);
            }
            return;
        }

        // === DyLEStorm layered background ===

        // Layer 1: Purple base
        if (this.baseImg) {
            this._tileY(ctx, this.baseImg, this.baseY, GAME_W);
        }

        // Layer 2: Stars (both layers, alpha blended)
        if (this.starsImg1) {
            this._tileY(ctx, this.starsImg1, this.stars1Y, GAME_W);
        }
        if (this.starsImg2) {
            ctx.globalAlpha = 0.7;
            this._tileY(ctx, this.starsImg2, this.stars2Y, GAME_W);
            ctx.globalAlpha = 1;
        }

        // Layer 3: Nebulae (behind everything else)
        for (const d of this.decorations) {
            if (d.type !== 'nebula') continue;
            ctx.globalAlpha = d.alpha;
            const w = d.img.width * d.scale;
            const h = d.img.height * d.scale;
            ctx.drawImage(d.img, d.x, d.y, w, h);
        }
        ctx.globalAlpha = 1;

        // Layer 4: Planets
        for (const d of this.decorations) {
            if (d.type !== 'planet') continue;
            ctx.globalAlpha = d.alpha;
            const w = d.img.width * d.scale;
            const h = d.img.height * d.scale;
            ctx.drawImage(d.img, d.x, d.y, w, h);
        }
        ctx.globalAlpha = 1;

        // Layer 5: Ground floor (L+R pairs tiled seamlessly)
        if (this.hasGround) {
            const gh = 112; // height of one ground tile
            const gw = 176;
            const pairH = gh * 2; // two alternating types cycle every 224px
            const centerX = (GAME_W - gw * 2) / 2;
            const offsetY = this.groundScrollY % pairH;
            // Draw enough tiles to cover screen + buffer
            const needed = Math.ceil(GAME_H / gh) + 2;
            for (let i = -1; i < needed; i++) {
                const y = Math.floor(i * gh + offsetY - gh);
                const gType = ((i + 100) % 2) + 1; // alternate 1, 2 (offset avoids negative mod)
                const imgL = this.assets.get(`dyl_ground_0${gType}_L.png`);
                const imgR = this.assets.get(`dyl_ground_0${gType}_R.png`);
                if (imgL) ctx.drawImage(imgL, centerX, y, gw, gh);
                if (imgR) ctx.drawImage(imgR, centerX + gw, y, gw, gh);
            }
        }

        // Layer 6: Side blocks (on top of ground)
        if (this.blocks.active) {
            this._drawBlocks(ctx);
        }

        // Layer 8: Buildings on blocks
        for (const b of this.buildingDecs) {
            const bx = b.side === 'left' ? 0 : GAME_W - 80;
            ctx.drawImage(b.img, bx, b.y, 80, 80);
        }

        // Tint overlay
        if (this.tint) {
            ctx.fillStyle = `rgba(${this.tint.r},${this.tint.g},${this.tint.b},${this.tint.a})`;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        }
    }

    _tileY(ctx, img, scrollY, drawW) {
        const h = img.height;
        const y = Math.floor(scrollY);
        for (let ty = y - h; ty < GAME_H; ty += h) {
            ctx.drawImage(img, 0, 0, img.width, h, 0, ty, drawW, h);
        }
    }

    _drawBlocks(ctx) {
        const pat = this.blocks.pattern;
        const blockH = 80;
        const patLen = pat.length;
        const scrollY = Math.floor(this.blocks.y);

        // Draw enough blocks to fill screen plus buffer
        const startOffset = scrollY % blockH;
        const neededBlocks = Math.ceil(GAME_H / blockH) + 2;

        for (let i = 0; i < neededBlocks; i++) {
            const ty = startOffset + (i - 1) * blockH;
            if (ty > GAME_H || ty + blockH < 0) continue;

            // Pick block from pattern based on scroll position
            const patIdx = ((Math.floor((scrollY / blockH)) + i) % patLen + patLen) % patLen;
            const bNum = pat[patIdx]; // 1, 2, or 3

            const imgL = this.assets.get(`dyl_block_0${bNum}_L.png`);
            const imgR = this.assets.get(`dyl_block_0${bNum}_R.png`);
            if (imgL) ctx.drawImage(imgL, 0, ty, 48, blockH);
            if (imgR) ctx.drawImage(imgR, GAME_W - 48, ty, 48, blockH);
        }
    }
}

// ─── Screen Shake ───
class ScreenShake {
    constructor() { this.intensity = 0; this.decay = 0.9; }
    add(amount) { this.intensity = Math.min(this.intensity + amount, 12); }
    update() { this.intensity *= this.decay; if (this.intensity < 0.5) this.intensity = 0; }
    get offset() {
        if (this.intensity === 0) return { x: 0, y: 0 };
        return {
            x: (Math.random() - 0.5) * this.intensity * 2,
            y: (Math.random() - 0.5) * this.intensity * 2,
        };
    }
}

// ─── Main Game ───
export class Game {
    constructor() {
        this.canvas = document.getElementById('game');
        this.ctx = this.canvas.getContext('2d');
        this.assets = new Assets();
        this.input = new Input(this.canvas);
        this.audio = new Audio();
        this.particles = new Particles();
        this.shake = new ScreenShake();
        this.bg = null;

        // Game state
        this.state = 'loading'; // loading, menu, playing, gameover
        this.frame = 0;
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('axeluga_hi') || '0');
        this.wave = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.waveTimer = 0;
        this.waveEnemiesLeft = 0;
        this.waveSpawnTimer = 0;
        this.formationQueue = [];
        this.formationDelay = 0;
        this.showWaveText = 0;
        this.waveTextType = null;
        this.bossActive = false;
        this.flashAlpha = 0;

        // Entity pools
        this.player = null;
        this.playerBullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.powerups = [];
        this.explosions = [];
        this.asteroids = [];
        this.mines = [];
        this.bigExplosions = [];
        this.bulletHits = [];
    }

    async init() {
        // Gather all asset file names
        const files = new Set();
        files.add(SPRITES.player.sheet);
        files.add(SPRITES.enemy.sheet);
        files.add(SPRITES.boss.sheet);
        files.add(SPRITES.bullets.sheet);
        files.add(SPRITES.explosion.sheet);
        files.add(SPRITES.exhaust.sheet);
        files.add(SPRITES.bonuses.sheet);
        files.add(SPRITES.mines.sheet);
        files.add(SPRITES.asteroids.sheet);
        files.add(SPRITES.barrier.sheet);
        files.add(SPRITES.ui.sheet);
        SPRITES.backgrounds.forEach(bg => files.add(bg.file));
        DYL_ENEMIES.forEach(f => files.add(f));
        MINI_BOSS_DEFS.forEach(mb => files.add(mb.sprite));
        DYL_BACKGROUNDS.forEach(f => files.add(f));
        files.add('dyl_explosion.png');

        // DyLEStorm BG pack assets
        files.add('dyl_bg_purple.png');
        files.add('dyl_stars1.png');
        files.add('dyl_stars2.png');
        // Nebulae (per-world)
        WORLDS.forEach(w => {
            (w.nebulae || []).forEach(n => files.add(n));
            (w.planets || []).forEach(p => files.add(p));
        });
        // Blocks
        ['01','02','03'].forEach(n => { files.add(`dyl_block_${n}_L.png`); files.add(`dyl_block_${n}_R.png`); });
        files.add('dyl_block_top_L.png'); files.add('dyl_block_top_R.png');
        files.add('dyl_block_bottom_L.png'); files.add('dyl_block_bottom_R.png');
        // Buildings
        files.add('dyl_buildings_01.png'); files.add('dyl_buildings_02.png'); files.add('dyl_buildings_03.png');
        // Ground
        files.add('dyl_ground_01_L.png'); files.add('dyl_ground_01_R.png');
        files.add('dyl_ground_02_L.png'); files.add('dyl_ground_02_R.png');
        // Weapon-level bullets
        files.add('bullet_wpn1.png'); files.add('bullet_wpn2.png'); files.add('bullet_wpn3.png');
        files.add('bullet_hit.png');

        await this.assets.load([...files]);
        document.getElementById('loading').style.display = 'none';

        this.bg = new Background(this.assets);
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input.onTap((x, y) => {
            this.audio.init();
            this.audio.resume();
            if (this.state === 'menu') {
                this.state = 'levelselect';
                this.menuCursor = 0;
                this._levelSelectInit = true;
                this.frame = 0;
            } else if (this.state === 'levelselect') {
                // Tap on world options (centered, y starts at ~280)
                for (let i = 0; i < WORLDS.length; i++) {
                    const optY = 280 + i * 80;
                    if (y > optY - 30 && y < optY + 30) {
                        this.menuCursor = i;
                        this.startGame(i);
                        return;
                    }
                }
            } else if (this.state === 'gameover' && this.frame > 60) {
                this.state = 'menu';
                this.frame = 0;
            } else if (this.state === 'paused') {
                // Tap on pause options
                const resumeY = GAME_H / 2 + 10;
                const quitY = GAME_H / 2 + 40;
                if (y > resumeY - 15 && y < resumeY + 15) {
                    this.state = 'playing';
                } else if (y > quitY - 15 && y < quitY + 15) {
                    this.audio.stopBGM();
                    this.state = 'menu';
                    this.frame = 0;
                } else {
                    // Tap anywhere = resume
                    this.state = 'playing';
                }
            }
        });

        this.state = 'menu';
        this.menuCursor = 0;
        this.pauseCursor = 0;
        this.loop();
    }

    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const scale = Math.min(w / GAME_W, h / GAME_H);
        const cw = Math.floor(GAME_W * scale);
        const ch = Math.floor(GAME_H * scale);
        this.canvas.width = GAME_W;
        this.canvas.height = GAME_H;
        this.canvas.style.width = cw + 'px';
        this.canvas.style.height = ch + 'px';
        const offsetX = (cw - GAME_W * scale) / 2;
        const offsetY = (ch - GAME_H * scale) / 2;
        this.input.setScale(scale, offsetX, offsetY);
    }

    startGame(startWorld = 0) {
        this.state = 'playing';
        this.frame = 0;
        this._gpTapPrev = true;
        this.score = 0;
        this.wave = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.waveTimer = 90;
        this.waveEnemiesLeft = 0;
        this.bossActive = false;
        this.formationQueue = [];
        this.formationDelay = 0;

        // World system
        this.world = startWorld;
        // Fast-forward wave counter to match world
        if (startWorld > 0) {
            this.wave = startWorld * WAVE_CONFIG.bossEvery;
        }
        this.showWorldText = 180;
        this.bg.setWorld(WORLDS[this.world % WORLDS.length]);

        // World transition effect
        this.worldTransition = null; // { phase, timer, fromWorld, toWorld }

        // Bomb charge system (charges from kills)
        this.bombCharge = 0;
        this.bombChargeMax = 100;
        this.bombs = 0;
        this.bombActive = 0;

        // Floating score text
        this.floatingTexts = [];

        // Reset entity pools
        this.playerBullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.powerups = [];
        this.explosions = [];
        this.asteroids = [];
        this.mines = [];
        this.bigExplosions = [];
        this.bulletHits = [];

        this.player = {
            x: GAME_W / 2,
            y: GAME_H - 80,
            w: 32, h: 32,           // visual size
            hitW: 20, hitH: 22,     // collision hitbox (65% of visual)
            hp: PLAYER_MAX_HP,
            maxHp: PLAYER_MAX_HP,
            weaponLevel: 1,
            speedLevel: 0,
            speed: PLAYER_SPEED,
            fireTimer: 0,
            invuln: 120,
            shield: 0,
            scoreMulti: 0,
            dead: false,
            exhaustFrame: 0,
        };

        this.audio.init();
        this.audio.waveStart();
        this.audio.startBGM(startWorld);
    }

    // ─── Main Loop ───
    loop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        this.frame++;
        this.input.pollGamepad();
        this.bg.update();
        this.particles.update();
        this.shake.update();

        // Edge-detected input helpers
        const gpTap = this.input.gpButtons.tap && !this._gpTapPrev;
        const gpUp = (this.input.gpAxes.y < -0.5) && !this._gpUpPrev;
        const gpDown = (this.input.gpAxes.y > 0.5) && !this._gpDownPrev;
        const kUp = (this.input.keys['ArrowUp'] || this.input.keys['KeyW']) && !this._kUpPrev;
        const kDown = (this.input.keys['ArrowDown'] || this.input.keys['KeyS']) && !this._kDownPrev;
        const kConfirm = (this.input.keys['Enter'] || this.input.keys['Space']) && !this._kConfirmPrev;
        const navUp = gpUp || kUp;
        const navDown = gpDown || kDown;
        const confirm = gpTap || kConfirm;

        if (this.state === 'menu') {
            if (confirm) {
                this.audio.init();
                this.audio.resume();
                this.state = 'levelselect';
                this.menuCursor = 0;
                this._levelSelectInit = true;
                this.frame = 0;
            }
        } else if (this.state === 'levelselect') {
            const prevCursor = this.menuCursor;
            if (navUp) this.menuCursor = (this.menuCursor - 1 + WORLDS.length) % WORLDS.length;
            if (navDown) this.menuCursor = (this.menuCursor + 1) % WORLDS.length;
            if (confirm) {
                this.startGame(this.menuCursor);
            }
            // Preview background (only update on cursor change)
            if (this.menuCursor !== prevCursor || this._levelSelectInit) {
                this.bg.setWorld(WORLDS[this.menuCursor % WORLDS.length]);
                this._levelSelectInit = false;
            }
            // ESC back to menu
            if (this.input.keys['Escape'] && !this._escPrev) {
                this.state = 'menu';
                this.frame = 0;
            }
        } else if (this.state === 'playing') {
            if (this.input.isPausePressed()) {
                this.state = 'paused';
                this.pauseCursor = 0; // 0=resume, 1=quit
                // Must save prev state so confirm doesn't fire immediately
                this._gpTapPrev = true;  // block gamepad confirm next frame
                this._kConfirmPrev = true; // block keyboard confirm next frame
                return;
            }
            this.updatePlaying();
        } else if (this.state === 'paused') {
            if (navUp || navDown) this.pauseCursor = this.pauseCursor === 0 ? 1 : 0;
            if (confirm || this.input.isPausePressed()) {
                if (this.pauseCursor === 0) {
                    this.state = 'playing';
                } else {
                    this.audio.stopBGM();
                    this.state = 'menu';
                    this.frame = 0;
                }
            }
        } else if (this.state === 'gameover') {
            if (this.frame > 60 && confirm) {
                this.state = 'menu';
                this.frame = 0;
            }
        }

        // Save previous input state for edge detection
        this._gpTapPrev = this.input.gpButtons.tap;
        this._gpUpPrev = this.input.gpAxes.y < -0.5;
        this._gpDownPrev = this.input.gpAxes.y > 0.5;
        this._kUpPrev = this.input.keys['ArrowUp'] || this.input.keys['KeyW'];
        this._kDownPrev = this.input.keys['ArrowDown'] || this.input.keys['KeyS'];
        this._kConfirmPrev = this.input.keys['Enter'] || this.input.keys['Space'];
        this._escPrev = this.input.keys['Escape'];
    }

    updatePlaying() {
        const p = this.player;
        if (p.dead) return;

        // ── Player movement ──
        const touchMove = this.input.getTouchMove();
        if (touchMove) {
            // Touch: move towards touch point (offset up so finger doesn't cover ship)
            const targetX = touchMove.x;
            const targetY = touchMove.y - 50;
            const dx = targetX - p.x;
            const dy = targetY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 2) {
                const speed = Math.min(p.speed * 1.5, dist);
                p.x += (dx / dist) * speed;
                p.y += (dy / dist) * speed;
            }
        } else {
            const mv = this.input.getMovement();
            const spd = p.speed * (1 + p.speedLevel * 0.2);
            p.x += mv.dx * spd;
            p.y += mv.dy * spd;
        }

        // Clamp to bounds
        p.x = Math.max(p.w / 2, Math.min(GAME_W - p.w / 2, p.x));
        p.y = Math.max(p.h / 2, Math.min(GAME_H - p.h / 2, p.y));

        // ── Player shooting ──
        p.fireTimer--;
        if (this.input.isFiring() && p.fireTimer <= 0) {
            this.playerShoot();
            p.fireTimer = Math.max(4, PLAYER_FIRE_RATE - p.weaponLevel);
        }

        // ── Player timers ──
        if (p.invuln > 0) p.invuln--;
        if (p.shield > 0) p.shield--;
        if (p.scoreMulti > 0) p.scoreMulti--;

        // ── Engine trail particles ──
        if (this.frame % 2 === 0) {
            this.particles.emitTrail(p.x, p.y + p.h / 2, '#48f');
            this.particles.emitTrail(p.x, p.y + p.h / 2, '#88f');
        }

        // ── Update bullets ──
        this.updateBullets();

        // ── Update enemies ──
        this.updateEnemies();

        // ── Update powerups ──
        this.updatePowerups();

        // ── Update asteroids ──
        this.updateAsteroids();

        // ── Update mines ──
        this.updateMines();

        // ── Update explosions ──
        this.updateExplosions();

        // ── Combo timer ──
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer === 0) this.combo = 0;
        }

        // ── Wave management ──
        this.updateWaves();

        // ── Random asteroid/mine spawns (scaled to wave) ──
        const asteroidChance = this.wave <= 2 ? 0.005 : WAVE_CONFIG.asteroidChance;
        if (Math.random() < asteroidChance) this.spawnAsteroid();
        if (this.wave > 4 && Math.random() < WAVE_CONFIG.mineChance) this.spawnMine();

        // ── Flash fade ──
        if (this.flashAlpha > 0) this.flashAlpha -= 0.05;

        // ── Bomb activation ──
        if (this.bombActive > 0) {
            this.bombActive--;
            if (this.bombActive === 25) this.executeBomb();
        }
        // Activate bomb with E/Q key or touch bomb button
        if (this.bombs > 0 && this.bombActive === 0 && this.input.isBombing()) {
            this.triggerBomb();
        }

        // ── Update floating texts ──
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y -= ft.vy;
            ft.life--;
            if (ft.life <= 0) this.floatingTexts.splice(i, 1);
        }

        // ── World text countdown ──
        if (this.showWorldText > 0) this.showWorldText--;

        // ── World transition sequence ──
        if (this.worldTransition) {
            const wt = this.worldTransition;
            wt.timer++;

            // Update speed lines
            for (const sl of wt.speedLines) {
                sl.y += sl.speed;
                if (sl.y > GAME_H + sl.len) {
                    sl.y = -sl.len;
                    sl.x = Math.random() * GAME_W;
                }
            }

            // Phase transitions
            if (wt.phase === 0 && wt.timer >= 90) {
                // "SECTOR CLEAR" phase done → fade to black
                wt.phase = 1;
                wt.timer = 0;
            } else if (wt.phase === 1 && wt.timer >= 40) {
                // Fully black → switch world
                wt.phase = 2;
                wt.timer = 0;
                this.world = wt.toWorld;
                this.bg.setWorld(WORLDS[this.world]);
                // Clear remaining entities
                this.enemies = [];
                this.enemyBullets = [];
                this.asteroids = [];
                this.mines = [];
                this.powerups = [];
                this.explosions = [];
                this.bigExplosions = [];
            } else if (wt.phase === 2 && wt.timer >= 30) {
                // Hold black done → fade in new world
                wt.phase = 3;
                wt.timer = 0;
                this.showWorldText = 180;
                this.audio.startBGM(this.world);
            } else if (wt.phase === 3 && wt.timer >= 60) {
                // Transition complete
                this.worldTransition = null;
                this.waveTimer = 90; // resume wave spawning
                this.player.invuln = 120; // brief safety
            }

            // Player is invulnerable during transition
            this.player.invuln = Math.max(this.player.invuln, 2);
        }
    }

    // ─── Player Shooting ───
    playerShoot() {
        const p = this.player;
        const lvl = p.weaponLevel;

        if (lvl >= 1) {
            this.playerBullets.push({
                x: p.x, y: p.y - p.h / 2,
                vx: 0, vy: -PLAYER_BULLET_SPEED,
                w: 6, h: 14, damage: 1, type: 0, wpnLevel: lvl,
            });
        }
        if (lvl >= 2) {
            this.playerBullets.push({
                x: p.x - 10, y: p.y - p.h / 2 + 4,
                vx: 0, vy: -PLAYER_BULLET_SPEED,
                w: 5, h: 12, damage: 1, type: 0, wpnLevel: lvl,
            });
            this.playerBullets.push({
                x: p.x + 10, y: p.y - p.h / 2 + 4,
                vx: 0, vy: -PLAYER_BULLET_SPEED,
                w: 5, h: 12, damage: 1, type: 0, wpnLevel: lvl,
            });
        }
        if (lvl >= 3) {
            this.playerBullets.push({
                x: p.x - 6, y: p.y - p.h / 2,
                vx: -1.5, vy: -PLAYER_BULLET_SPEED * 0.9,
                w: 5, h: 12, damage: 1, type: 1, wpnLevel: lvl,
            });
            this.playerBullets.push({
                x: p.x + 6, y: p.y - p.h / 2,
                vx: 1.5, vy: -PLAYER_BULLET_SPEED * 0.9,
                w: 5, h: 12, damage: 1, type: 1, wpnLevel: lvl,
            });
        }
        if (lvl >= 4) {
            // Wide spread
            this.playerBullets.push({
                x: p.x - 14, y: p.y,
                vx: -2.5, vy: -PLAYER_BULLET_SPEED * 0.7,
                w: 4, h: 10, damage: 1, type: 1,
            });
            this.playerBullets.push({
                x: p.x + 14, y: p.y,
                vx: 2.5, vy: -PLAYER_BULLET_SPEED * 0.7,
                w: 4, h: 10, damage: 1, type: 1,
            });
        }

        this.audio.playerShoot();
    }

    // ─── Update Bullets ───
    updateBullets() {
        // Player bullets
        for (let i = this.playerBullets.length - 1; i >= 0; i--) {
            const b = this.playerBullets[i];
            b.x += b.vx;
            b.y += b.vy;
            if (b.y < -20 || b.x < -20 || b.x > GAME_W + 20) {
                this.playerBullets.splice(i, 1);
                continue;
            }

            // Check vs enemies
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (this.collides(b, e)) {
                    const wasAboveRage = e.hp / e.maxHp > 0.25;
                    e.hp -= b.damage;
                    if (e.hp <= 0) {
                        this.killEnemy(j);
                    } else {
                        e.flashTimer = 4;
                        this.audio.hit();
                        // Boss rage trigger
                        if (e.isBoss && wasAboveRage && e.hp / e.maxHp <= 0.25) {
                            this.spawnFloatingText(e.x, e.y - 40, 'RAGE MODE!');
                            this.shake.add(6);
                            this.input.vibrate(150, 0.4, 0.6);
                        }
                    }
                    this.particles.emit(b.x, b.y, 3, '#fff', 2, 10);
                    this.spawnBulletHit(b.x, b.y);
                    hit = true;
                    break;
                }
            }
            if (hit) {
                this.playerBullets.splice(i, 1);
            }
        }

        // Enemy bullets
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.x += b.vx;
            b.y += b.vy;
            if (b.y > GAME_H + 20 || b.y < -20 || b.x < -20 || b.x > GAME_W + 20) {
                this.enemyBullets.splice(i, 1);
                continue;
            }

            // Check vs player
            if (this.player.invuln <= 0 && this.playerHitBy(b)) {
                this.hitPlayer();
                this.enemyBullets.splice(i, 1);
            }
        }
    }

    // ─── Update Enemies ───
    updateEnemies() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];

            // Movement pattern
            this.moveEnemy(e);

            // Shooting
            if (e.shootRate > 0) {
                e.shootTimer--;
                if (e.shootTimer <= 0) {
                    this.enemyShoot(e);
                    e.shootTimer = e.shootRate;
                }
            }

            // Flash timer
            if (e.flashTimer > 0) e.flashTimer--;

            // Off screen check (timeout only for non-boss enemies)
            const offScreen = e.y > GAME_H + 60 || e.x < -80 || e.x > GAME_W + 80;
            const timedOut = !e.isBoss && !e.isMiniBoss && e.moveT > 600;
            if (offScreen || timedOut) {
                if (e.isBoss) this.bossActive = false; // safety: reset if boss somehow leaves
                this.enemies.splice(i, 1);
                continue;
            }

            // Collide with player
            if (this.player.invuln <= 0 && this.playerHitBy(e)) {
                e.hp -= 2;
                this.hitPlayer();
                if (e.hp <= 0) this.killEnemy(i);
            }
        }
    }

    moveEnemy(e) {
        e.moveT++;
        switch (e.pattern) {
            case 'straight':
                e.y += e.speed;
                break;

            case 'zigzag':
                e.y += e.speed;
                e.x += Math.sin(e.moveT * 0.05 + e.phase) * 2.5;
                break;

            case 'swoop': {
                // Dive in, pause and strafe, then dive out
                if (e.moveT < 50) {
                    e.y += e.speed * 1.8;
                } else if (e.moveT < 140) {
                    e.y += Math.sin(e.moveT * 0.04) * 0.5;
                    e.x += e.swoopDir * 1.8;
                } else {
                    e.y += e.speed * 1.2;
                }
                break;
            }

            case 'circle': {
                // Orbit pattern — loops while slowly descending
                e.x = e.originX + Math.cos(e.moveT * 0.04) * 70;
                e.y = e.originY + Math.sin(e.moveT * 0.04) * 40;
                e.originY += e.speed * 0.25;
                break;
            }

            case 'vformation': {
                // V-shape: descend at angle, then switch direction
                const leg = Math.floor(e.moveT / 80) % 2;
                e.y += e.speed * 0.9;
                e.x += (leg === 0 ? 1 : -1) * e.swoopDir * 1.2;
                break;
            }

            case 'sinewave': {
                // Large sine wave across the full screen width
                e.y += e.speed * 0.8;
                e.x = e.originX + Math.sin(e.moveT * 0.03 + e.phase) * (GAME_W * 0.35);
                break;
            }

            case 'divebomb': {
                // Hover at top, lock on, then dive fast at player
                if (e.moveT < 60) {
                    // Enter from top
                    e.y += e.speed;
                    e.x += Math.sin(e.moveT * 0.1) * 1;
                } else if (e.moveT < 100) {
                    // Hover and track player X
                    e.y += 0.1;
                    const dx = this.player.x - e.x;
                    e.x += Math.sign(dx) * Math.min(2, Math.abs(dx) * 0.05);
                } else {
                    // Dive!
                    e.y += e.speed * 3.5;
                }
                break;
            }

            case 'figure8': {
                // Figure-8 loop while descending
                const t = e.moveT * 0.03;
                e.x = e.originX + Math.sin(t) * 80;
                e.y = e.originY + Math.sin(t * 2) * 25;
                e.originY += e.speed * 0.2;
                break;
            }

            case 'diagonal': {
                // Diagonal sweep across screen, bounce off edges
                e.y += e.speed * 0.6;
                e.x += e.swoopDir * 2.0;
                if (e.x < 20 || e.x > GAME_W - 20) {
                    e.swoopDir *= -1;
                }
                break;
            }

            case 'boss':
                this.moveBoss(e);
                break;

            case 'miniboss':
                this.moveMiniBoss(e);
                break;
        }

        // Clamp X
        if (e.pattern !== 'diagonal') {
            e.x = Math.max(e.w / 2, Math.min(GAME_W - e.w / 2, e.x));
        }
    }

    moveBoss(e) {
        const rage = e.hp / e.maxHp <= 0.25;
        if (e.y < 80) {
            e.y += 0.5;
        } else if (rage) {
            // Rage mode: faster, erratic movement
            e.x += Math.sin(e.moveT * 0.03) * 2.5 + Math.cos(e.moveT * 0.07) * 1.2;
            e.y = 80 + Math.sin(e.moveT * 0.025) * 35;
            // Clamp to screen
            e.x = Math.max(e.w, Math.min(GAME_W - e.w, e.x));
        } else {
            e.x += Math.sin(e.moveT * 0.015) * 1.5;
            e.y = 80 + Math.sin(e.moveT * 0.01) * 20;
        }
    }

    moveMiniBoss(e) {
        // Descend to position, then sweep side to side more aggressively than boss
        if (e.y < 120) {
            e.y += 0.8;
        } else {
            e.x += Math.sin(e.moveT * 0.025) * 2.0;
            e.y = 120 + Math.sin(e.moveT * 0.015) * 30;
        }
    }

    enemyShoot(e) {
        if (e.y < 0 || e.y > GAME_H) return;

        // Scale bullet speed with wave (slower early)
        let bulletSpeed;
        if (this.wave <= 3) bulletSpeed = 1.5;
        else if (this.wave <= 6) bulletSpeed = 2.0;
        else if (this.wave <= 10) bulletSpeed = 2.5;
        else bulletSpeed = ENEMY_BULLET_SPEED;

        if (e.isBoss) {
            const phase = Math.floor((1 - e.hp / e.maxHp) * BOSS_DEF.phases);
            this.bossShootPattern(e, phase, bulletSpeed);
        } else if (e.isMiniBoss) {
            // Mini-boss: 3-way aimed burst
            const dx = this.player.x - e.x;
            const dy = this.player.y - e.y;
            const angle = Math.atan2(dy, dx);
            const spread = 0.25;
            for (let s = -1; s <= 1; s++) {
                const a = angle + s * spread;
                this.enemyBullets.push({
                    x: e.x, y: e.y + e.h / 2,
                    vx: Math.cos(a) * bulletSpeed * 1.1,
                    vy: Math.sin(a) * bulletSpeed * 1.1,
                    w: 7, h: 7, type: 1,
                });
            }
            this.audio.enemyShoot();
        } else {
            // Aim at player
            const dx = this.player.x - e.x;
            const dy = this.player.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                this.enemyBullets.push({
                    x: e.x, y: e.y + e.h / 2,
                    vx: (dx / dist) * bulletSpeed,
                    vy: (dy / dist) * bulletSpeed,
                    w: 6, h: 6, type: 0,
                });
            }
            this.audio.enemyShoot();
        }
    }

    bossShootPattern(e, phase, bulletSpeed) {
        const t = e.moveT;
        const bossNum = Math.floor(this.wave / WAVE_CONFIG.bossEvery);
        const rage = e.hp / e.maxHp <= 0.25;

        // Rage mode: everything fires faster
        const rageMul = rage ? 0.6 : 1;

        // Scale fire rates
        const spreadInterval = Math.max(2, Math.floor((bossNum <= 1 ? 8 : Math.max(3, 7 - bossNum)) * rageMul));
        const aimedInterval = Math.max(2, Math.floor((bossNum <= 1 ? 12 : Math.max(4, 9 - bossNum)) * rageMul));
        const spiralInterval = Math.max(2, Math.floor((bossNum <= 1 ? 10 : Math.max(3, 7 - bossNum)) * rageMul));

        // Pattern 1: spread shot
        if (phase >= 0 && t % spreadInterval === 0) {
            const spread = bossNum <= 1 ? 2 + phase : 3 + phase;
            const extraSpread = rage ? 2 : 0;
            for (let i = 0; i < spread + extraSpread; i++) {
                const total = spread + extraSpread;
                const angle = Math.PI / 2 + (i - (total - 1) / 2) * 0.25;
                this.enemyBullets.push({
                    x: e.x, y: e.y + e.h / 2,
                    vx: Math.cos(angle) * bulletSpeed,
                    vy: Math.sin(angle) * bulletSpeed,
                    w: 6, h: 6, type: 1,
                });
            }
        }

        // Pattern 2: aimed shot (phase 1+)
        if (phase >= 1 && t % aimedInterval === 0) {
            const dx = this.player.x - e.x;
            const dy = this.player.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                const speed = rage ? bulletSpeed * 1.6 : bulletSpeed * 1.3;
                this.enemyBullets.push({
                    x: e.x, y: e.y + e.h / 2,
                    vx: (dx / dist) * speed,
                    vy: (dy / dist) * speed,
                    w: 8, h: 8, type: 1,
                });
            }
        }

        // Pattern 3: spiral (phase 2+)
        if (phase >= 2 && t % spiralInterval === 0) {
            const angle = t * 0.15;
            this.enemyBullets.push({
                x: e.x, y: e.y + e.h / 2,
                vx: Math.cos(angle) * bulletSpeed * 1.1,
                vy: Math.sin(angle) * bulletSpeed * 1.1,
                w: 6, h: 6, type: 1,
            });
        }

        // Rage pattern: ring burst every 45 frames
        if (rage && t % 45 === 0) {
            const count = 12;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i + t * 0.05;
                this.enemyBullets.push({
                    x: e.x, y: e.y,
                    vx: Math.cos(angle) * bulletSpeed * 0.9,
                    vy: Math.sin(angle) * bulletSpeed * 0.9,
                    w: 5, h: 5, type: 1,
                });
            }
        }

        this.audio.enemyShoot();
    }

    killEnemy(index) {
        const e = this.enemies[index];

        // Score with combo
        this.combo++;
        this.comboTimer = 90;
        const multi = this.player.scoreMulti > 0 ? 2 : 1;
        const comboBonus = Math.min(this.combo, 10);
        const points = e.score * comboBonus * multi;
        this.score += points;

        // Charge bomb meter from kills
        if (e.isBoss) this.addBombCharge(30);
        else if (e.isMiniBoss) this.addBombCharge(20);
        else this.addBombCharge(5);

        // Explosion
        this.spawnExplosion(e.x, e.y, e.isBoss ? 2 : (e.w > 30 ? 1 : 0));
        this.particles.emit(e.x, e.y, e.isBoss ? 30 : 12, '#f84', 4, 25);
        this.particles.emit(e.x, e.y, 8, '#ff4', 3, 20);
        this.shake.add(e.isBoss ? 8 : 2);
        this.audio.explosion(e.isBoss);

        if (e.isBoss) {
            this.bossActive = false;
            this.flashAlpha = 1;
            // Massive staggered big explosions
            for (let i = 0; i < 12; i++) {
                const ox = (Math.random() - 0.5) * 100;
                const oy = (Math.random() - 0.5) * 80;
                const sz = 64 + Math.random() * 56; // 64-120px
                this.spawnBigExplosion(e.x + ox, e.y + oy, sz, i * 5);
            }
            // Delayed audio for staggered feel
            for (let i = 0; i < 5; i++) {
                setTimeout(() => this.audio.explosion(false), i * 100);
            }
        }

        if (e.isMiniBoss) {
            this.flashAlpha = 0.6;
            this.input.vibrate(200, 0.5, 0.7);
            // Medium staggered big explosions
            for (let i = 0; i < 7; i++) {
                const ox = (Math.random() - 0.5) * 70;
                const oy = (Math.random() - 0.5) * 60;
                const sz = 48 + Math.random() * 40; // 48-88px
                this.spawnBigExplosion(e.x + ox, e.y + oy, sz, i * 6);
            }
            for (let i = 0; i < 3; i++) {
                setTimeout(() => this.audio.explosion(false), i * 120);
            }
        }

        // Power-up drop
        if (e.isBoss) {
            // Boss always drops exactly 3: 1 guaranteed weapon + 2 cycling
            this.spawnPowerup(e.x, e.y, 'weapon');
            this.spawnPowerup(e.x - 25, e.y + 10);
            this.spawnPowerup(e.x + 25, e.y + 10);
        } else if (e.isMiniBoss) {
            // Mini-boss drops 2: 1 weapon + 1 cycling
            this.spawnPowerup(e.x, e.y, 'weapon');
            this.spawnPowerup(e.x + 15, e.y);
        } else if (Math.random() < 0.10) {
            // Regular enemies: 10% drop chance (down from 15%)
            this.spawnPowerup(e.x, e.y);
        }

        // Floating score text
        this.spawnFloatingText(e.x, e.y, points);

        this.enemies.splice(index, 1);
    }

    // ─── Bomb Charge System ───
    addBombCharge(amount) {
        if (this.bombCharge >= this.bombChargeMax) return; // already full, waiting to be used
        this.bombCharge = Math.min(this.bombChargeMax, this.bombCharge + amount);
        if (this.bombCharge >= this.bombChargeMax) {
            this.bombs = 1;
            this.audio.powerup();
            this.spawnFloatingText(this.player.x, this.player.y - 30, 'BOMB READY!');
        }
    }

    triggerBomb() {
        if (this.bombs <= 0 || this.bombActive > 0) return;
        this.bombs = 0;
        this.bombCharge = 0; // reset meter on use
        this.bombActive = 30;
        this.audio.explosion(true);
        this.shake.add(10);
        this.input.vibrate(300, 0.8, 1.0);
    }

    executeBomb() {
        // Clear all enemy bullets
        for (const b of this.enemyBullets) {
            this.particles.emit(b.x, b.y, 3, '#ff0', 2, 10);
        }
        this.enemyBullets = [];

        // Damage all enemies on screen
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.isBoss) {
                // Chip damage only — ~10% of max HP
                const dmg = Math.max(5, Math.floor(e.maxHp * 0.10));
                e.hp -= dmg;
                e.flashTimer = 10;
                if (e.hp <= 0) this.killEnemy(i);
            } else if (e.isMiniBoss) {
                // ~15% of max HP
                const dmg = Math.max(5, Math.floor(e.maxHp * 0.15));
                e.hp -= dmg;
                e.flashTimer = 10;
                if (e.hp <= 0) this.killEnemy(i);
            } else {
                this.killEnemy(i);
            }
        }

        // Clear mines
        for (const m of this.mines) {
            this.particles.emit(m.x, m.y, 8, '#f80', 3, 15);
        }
        this.mines = [];

        this.flashAlpha = 0.8;
    }

    // ─── Floating Score Text ───
    spawnFloatingText(x, y, value) {
        const isString = typeof value === 'string';
        let color = '#fff';
        let size = 10;
        if (!isString) {
            if (value >= 5000) color = '#f4f';      // purple for huge
            else if (value >= 1000) color = '#f80';  // orange
            else if (value >= 500) color = '#ff0';   // yellow
        } else if (value === 'RAGE MODE!') {
            color = '#f00';
            size = 14;
        } else if (value === 'WPN DOWN') {
            color = '#f44';
            size = 11;
        } else {
            color = '#0ff'; // cyan for text messages
        }

        this.floatingTexts.push({
            x, y,
            text: isString ? value : '+' + value.toLocaleString(),
            color,
            life: 50,
            maxLife: 50,
            vy: 1.2,
            size: isString ? size : (value >= 1000 ? 14 : 10),
        });
    }

    hitPlayer() {
        const p = this.player;
        if (p.shield > 0) {
            p.shield = 0;
            this.audio.hit();
            this.particles.emit(p.x, p.y, 10, '#0ff', 3, 20);
            p.invuln = 30;
            this.input.vibrate(80, 0.2, 0.3);
            return;
        }

        p.hp--;
        p.invuln = PLAYER_INVULN_TIME;
        this.shake.add(5);
        this.flashAlpha = 0.5;
        this.audio.hit();
        this.particles.emit(p.x, p.y, 15, '#f44', 3, 20);
        this.input.vibrate(200, 0.5, 0.7);

        // Lose 1 weapon level on hit
        if (p.weaponLevel > 1) {
            p.weaponLevel--;
            this.spawnFloatingText(p.x, p.y - 20, 'WPN DOWN');
        }
        // Lose 1 speed level on hit
        if (p.speedLevel > 0) {
            p.speedLevel--;
            this.spawnFloatingText(p.x + 30, p.y - 20, 'SPD DOWN');
        }

        if (p.hp <= 0) {
            this.gameOver();
        }
    }

    _playTransitionSound() {
        // Rising sweep + fanfare
        this.audio._play(() => {
            const ctx = this.audio.ctx;
            const t = ctx.currentTime;
            const dest = this.audio.masterGain;
            // Rising sweep
            const sweep = ctx.createOscillator();
            const sGain = ctx.createGain();
            sweep.type = 'sawtooth';
            sweep.frequency.setValueAtTime(200, t);
            sweep.frequency.exponentialRampToValueAtTime(800, t + 0.6);
            sGain.gain.setValueAtTime(0.08, t);
            sGain.gain.linearRampToValueAtTime(0.12, t + 0.3);
            sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
            sweep.connect(sGain).connect(dest);
            sweep.start(t);
            sweep.stop(t + 0.8);
            // Fanfare notes
            [523, 659, 784, 1047].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'square';
                osc.frequency.value = freq;
                g.gain.setValueAtTime(0.1, t + 0.5 + i * 0.12);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.5 + i * 0.12 + 0.25);
                osc.connect(g).connect(dest);
                osc.start(t + 0.5 + i * 0.12);
                osc.stop(t + 0.5 + i * 0.12 + 0.25);
            });
        });
    }

    gameOver() {
        this.player.dead = true;
        this.audio.stopBGM();
        this.spawnExplosion(this.player.x, this.player.y, 2);
        this.particles.emit(this.player.x, this.player.y, 40, '#f84', 5, 40);
        this.shake.add(10);
        this.audio.playerDeath();
        this.audio.explosion(true);
        this.input.vibrate(500, 1.0, 1.0);

        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('axeluga_hi', this.highScore.toString());
        }

        setTimeout(() => {
            this.state = 'gameover';
            this.frame = 0;
        }, 1500);
    }

    // ─── Wave Management ───
    updateWaves() {
        if (this.bossActive) return;
        if (this.worldTransition) return; // pause during world transition

        // Process formation queue
        if (this.formationQueue.length > 0) {
            this.formationDelay--;
            if (this.formationDelay <= 0) {
                const formation = this.formationQueue.shift();
                this.spawnFormation(formation);
                // Delay before next formation
                this.formationDelay = 60 + Math.floor(Math.random() * 40);
            }
            return;
        }

        // Wait for all enemies to be cleared
        if (this.enemies.length > 0) return;

        // Pause between waves
        if (this.waveTimer > 0) {
            this.waveTimer--;
            return;
        }

        this.nextWave();
    }

    nextWave() {
        this.wave++;

        // Pause between waves
        this.waveTimer = Math.max(30, 90 - this.wave * 5);

        // Check for world transition (after each boss)
        if ((this.wave - 1) % WAVE_CONFIG.bossEvery === 0 && this.wave > 1) {
            if (this.world < WORLDS.length - 1 && !this.worldTransition) {
                // Start transition sequence instead of instant switch
                this.worldTransition = {
                    phase: 0,      // 0=speedlines+clear, 1=fade-to-black, 2=hold-black, 3=fade-in-new
                    timer: 0,
                    fromWorld: this.world,
                    toWorld: this.world + 1,
                    speedLines: [],
                };
                // Generate speed lines
                for (let i = 0; i < 30; i++) {
                    this.worldTransition.speedLines.push({
                        x: Math.random() * GAME_W,
                        y: Math.random() * GAME_H,
                        len: 30 + Math.random() * 80,
                        speed: 8 + Math.random() * 12,
                        alpha: 0.3 + Math.random() * 0.7,
                    });
                }
                this.waveTimer = 999; // pause wave spawning during transition
                this.audio.stopBGM();
                // Score bonus for completing world
                const bonus = (this.world + 1) * 5000;
                this.score += bonus;
                this.spawnFloatingText(GAME_W / 2, GAME_H / 2 + 60, `+${bonus}`);
                // Play transition sound
                this._playTransitionSound();
            }
        }

        const waveInWorld = ((this.wave - 1) % WAVE_CONFIG.bossEvery) + 1;

        if (waveInWorld === WAVE_CONFIG.bossEvery) {
            // Boss wave (last wave in world)
            this.showWaveText = 120;
            this.waveTextType = null;
            this.spawnBoss();
        } else if (waveInWorld === WAVE_CONFIG.miniBossWave) {
            // Mini-boss wave (mid-world)
            this.showWaveText = 90;
            this.waveTextType = 'miniboss';
            this.spawnMiniBoss();
            // Also queue some formations alongside mini-boss
            this.queueFormations();
            this.formationDelay = 60;
            this.audio.waveStart();
        } else {
            // Normal wave
            this.queueFormations();
            this.formationDelay = 20;
            this.audio.waveStart();
        }
    }

    queueFormations() {
        this.formationQueue = [];
        const w = this.world; // world index for scaling

        // Number of formations increases with wave AND world
        let numFormations;
        if (this.wave <= 2) numFormations = 1 + Math.min(w, 1);
        else if (this.wave <= 4) numFormations = 2 + Math.min(w, 1);
        else if (this.wave <= 7) numFormations = 3 + Math.min(w, 2);
        else numFormations = Math.min(6, 2 + Math.floor(this.wave / 3) + Math.floor(w / 2));

        // Available formation shapes — unlock faster in later worlds
        const easyShapes = ['hline', 'vline', 'diagonal'];
        const medShapes = ['hline', 'vline', 'diagonal', 'vee', 'spread'];
        const hardShapes = ['hline', 'vline', 'diagonal', 'vee', 'spread', 'pincer', 'cross', 'swarm'];

        let shapes;
        if (w >= 2) shapes = hardShapes; // all shapes from world 3+
        else if (this.wave <= 2) shapes = easyShapes;
        else if (this.wave <= 5) shapes = medShapes;
        else shapes = hardShapes;

        // Available enemy types — unlock faster in later worlds
        const types = Object.keys(ENEMY_DEFS);
        let maxType;
        if (w >= 2) maxType = types.length; // all enemies from world 3+
        else if (this.wave <= 2) maxType = 1;
        else if (this.wave <= 4) maxType = 2;
        else if (this.wave <= 6) maxType = 3;
        else maxType = types.length;

        for (let i = 0; i < numFormations; i++) {
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const typeKey = types[Math.floor(Math.random() * maxType)];

            // Formation size varies — bigger in later worlds
            let size;
            if (this.wave <= 2) size = 3 + Math.min(w, 2);
            else if (this.wave <= 4) size = 3 + Math.floor(Math.random() * 2) + Math.min(w, 2);
            else size = 3 + Math.floor(Math.random() * 4) + Math.min(w, 3);
            size = Math.min(size, 8); // cap

            // Movement patterns — more aggressive in later worlds
            const movePatterns = ['straight', 'zigzag', 'sinewave'];
            if (this.wave > 3 || w >= 1) movePatterns.push('swoop', 'diagonal');
            if (this.wave > 5 || w >= 2) movePatterns.push('divebomb', 'circle');
            const pattern = movePatterns[Math.floor(Math.random() * movePatterns.length)];

            this.formationQueue.push({ shape, typeKey, size, pattern });
        }
    }

    spawnFormation(f) {
        const def = ENEMY_DEFS[f.typeKey];
        const phase = Math.random() * Math.PI * 2;
        const swoopDir = Math.random() < 0.5 ? -1 : 1;

        const positions = this.getFormationPositions(f.shape, f.size);

        // Shoot rate based on wave + world scaling
        let shootRate = 0;
        if (def.shootRate > 0) {
            const worldBoost = this.world * 8; // faster shooting per world
            if (this.wave <= 2 && this.world === 0) shootRate = 0;
            else if (this.wave <= 4 && this.world === 0) shootRate = Math.max(120, def.shootRate + 60);
            else if (this.wave <= 7) shootRate = Math.max(50, def.shootRate + 20 - worldBoost);
            else shootRate = Math.max(20, def.shootRate - Math.floor(this.wave * 1.5) - worldBoost);
        }

        const hpBonus = Math.floor(this.wave / 7) + this.world;
        const speedBonus = this.wave * 0.02 + this.world * 0.15;

        // Optionally use DyLESTorm sprites based on world config
        const worldDef = WORLDS[this.world % WORLDS.length];
        const useDylSprite = Math.random() < (worldDef.dylChance || 0);
        const dylSprite = useDylSprite
            ? DYL_ENEMIES[(this.world + Math.floor(Math.random() * DYL_ENEMIES.length)) % DYL_ENEMIES.length]
            : null;
        // Use world-specific color rows for Timberlate enemies
        const colorRow = worldDef.enemyRows
            ? worldDef.enemyRows[Math.floor(Math.random() * worldDef.enemyRows.length)]
            : (this.world + Math.floor(Math.random() * 2)) % 3;

        for (const pos of positions) {
            this.enemies.push({
                x: pos.x,
                y: pos.y,
                w: def.size, h: def.size,
                hp: def.hp + hpBonus,
                maxHp: def.hp + hpBonus,
                speed: def.speed + speedBonus,
                score: def.score,
                shootRate,
                shootTimer: 90 + Math.floor(Math.random() * 90),
                spriteType: def.type,
                colorRow,
                pattern: f.pattern,
                phase,
                swoopDir,
                moveT: 0,
                originX: pos.x,
                originY: pos.y,
                flashTimer: 0,
                isBoss: false,
                dylSprite,
            });
        }
    }

    getFormationPositions(shape, count) {
        const spacing = 36;
        const positions = [];

        // Random center X for the formation
        const centerX = 60 + Math.random() * (GAME_W - 120);
        const startY = -40;

        switch (shape) {
            case 'hline': {
                // Horizontal row
                const startX = centerX - ((count - 1) * spacing) / 2;
                for (let i = 0; i < count; i++) {
                    positions.push({ x: startX + i * spacing, y: startY });
                }
                break;
            }

            case 'vline': {
                // Vertical column — staggered entry
                for (let i = 0; i < count; i++) {
                    positions.push({ x: centerX, y: startY - i * spacing });
                }
                break;
            }

            case 'diagonal': {
                // Diagonal line
                const dir = Math.random() < 0.5 ? 1 : -1;
                const startX = centerX - dir * ((count - 1) * spacing * 0.5) / 2;
                for (let i = 0; i < count; i++) {
                    positions.push({
                        x: startX + dir * i * spacing * 0.5,
                        y: startY - i * spacing * 0.7,
                    });
                }
                break;
            }

            case 'vee': {
                // V-formation (like birds)
                const half = Math.floor(count / 2);
                // Leader
                positions.push({ x: centerX, y: startY });
                for (let i = 1; i <= half; i++) {
                    positions.push({ x: centerX - i * spacing * 0.7, y: startY - i * spacing * 0.6 });
                    if (positions.length < count) {
                        positions.push({ x: centerX + i * spacing * 0.7, y: startY - i * spacing * 0.6 });
                    }
                }
                break;
            }

            case 'spread': {
                // Fan spread from center
                for (let i = 0; i < count; i++) {
                    const angle = (i / (count - 1 || 1) - 0.5) * Math.PI * 0.6;
                    positions.push({
                        x: centerX + Math.sin(angle) * spacing * 2,
                        y: startY - Math.cos(angle) * spacing,
                    });
                }
                break;
            }

            case 'pincer': {
                // Two groups from the sides
                const half = Math.ceil(count / 2);
                for (let i = 0; i < half; i++) {
                    positions.push({ x: 20 + i * 10, y: startY - i * spacing * 0.5 });
                }
                for (let i = 0; i < count - half; i++) {
                    positions.push({ x: GAME_W - 20 - i * 10, y: startY - i * spacing * 0.5 });
                }
                break;
            }

            case 'cross': {
                // Plus/cross shape
                positions.push({ x: centerX, y: startY });
                const arms = Math.floor((count - 1) / 4);
                for (let i = 1; i <= arms; i++) {
                    positions.push({ x: centerX - i * spacing, y: startY });
                    positions.push({ x: centerX + i * spacing, y: startY });
                    positions.push({ x: centerX, y: startY - i * spacing });
                    if (positions.length < count) {
                        positions.push({ x: centerX, y: startY + i * spacing * 0.5 });
                    }
                }
                // Fill remaining
                while (positions.length < count) {
                    positions.push({ x: centerX + (Math.random() - 0.5) * spacing * 2, y: startY - Math.random() * spacing });
                }
                break;
            }

            case 'swarm': {
                // Tight cluster
                for (let i = 0; i < count; i++) {
                    positions.push({
                        x: centerX + (Math.random() - 0.5) * spacing * 2.5,
                        y: startY - Math.random() * spacing * 2,
                    });
                }
                break;
            }

            default: {
                // Fallback: random scatter
                for (let i = 0; i < count; i++) {
                    positions.push({
                        x: 40 + Math.random() * (GAME_W - 80),
                        y: startY - Math.random() * spacing * 2,
                    });
                }
            }
        }

        // Clamp X positions
        for (const p of positions) {
            p.x = Math.max(24, Math.min(GAME_W - 24, p.x));
        }

        return positions;
    }

    spawnBoss() {
        this.bossActive = true;
        this.audio.bossAlert();

        const bossNum = Math.floor(this.wave / WAVE_CONFIG.bossEvery);
        const w = this.world;
        const worldDef = WORLDS[w % WORLDS.length];
        // Scale boss: first boss is a real fight, each subsequent boss much tougher
        const hpScale = (bossNum <= 1 ? 0 : (bossNum - 1) * 20) + w * 30;
        const shootRateScale = bossNum <= 1 && w === 0 ? 35 : Math.max(10, 30 - bossNum * 3 - w * 3);

        // World-specific boss color
        const bossColors = worldDef.bossColors || [0, 1];
        const bossColorRow = bossColors[bossNum % bossColors.length];

        this.enemies.push({
            x: GAME_W / 2, y: -80,
            w: BOSS_DEF.size * 2, h: BOSS_DEF.size * 2,
            hp: BOSS_DEF.hp + hpScale,
            maxHp: BOSS_DEF.hp + hpScale,
            speed: BOSS_DEF.speed + w * 0.1,
            score: BOSS_DEF.score + this.wave * 500 + w * 2000,
            shootRate: shootRateScale,
            shootTimer: 90,
            spriteType: 0,
            colorRow: bossColorRow,
            pattern: 'boss',
            moveT: 0,
            flashTimer: 0,
            isBoss: true,
        });
    }

    spawnMiniBoss() {
        const w = this.world;
        const worldDef = WORLDS[w % WORLDS.length];
        const mbIdx = worldDef.miniBossIdx || 0;
        const def = MINI_BOSS_DEFS[mbIdx];

        this.enemies.push({
            x: GAME_W / 2,
            y: -100,
            w: def.w, h: def.h,
            hp: def.hp + w * 8,
            maxHp: def.hp + w * 8,
            speed: def.speed + w * 0.08,
            score: def.score + w * 500,
            shootRate: Math.max(20, def.shootRate - w * 3),
            shootTimer: 60,
            spriteType: 0,
            colorRow: 0,
            pattern: 'miniboss',
            moveT: 0,
            flashTimer: 0,
            isMiniBoss: true,
            miniBossSprite: def.sprite,
        });
    }

    // ─── Spawners ───
    spawnExplosion(x, y, size = 0) {
        const colorRow = Math.floor(Math.random() * 4);
        this.explosions.push({
            x, y,
            frame: 0,
            maxFrames: 7,
            timer: 0,
            speed: 4,
            colorRow,
            size, // 0=small, 1=medium, 2=large
        });
    }

    spawnBigExplosion(x, y, size = 80, delay = 0) {
        this.bigExplosions.push({
            x, y, size,
            frame: 0,
            maxFrames: 8,
            timer: 0,
            speed: 5,
            delay,
            alpha: 1,
        });
    }

    spawnBulletHit(x, y) {
        this.bulletHits.push({
            x, y,
            frame: 0,
            maxFrames: 5, // 70px / 14px = 5 frames
            timer: 0,
            speed: 3,
        });
    }

    spawnPowerup(x, y, forcedType) {
        const types = ['health', 'shield', 'weapon', 'speed', 'score2x'];
        this.powerups.push({
            x, y,
            vy: 1.2,
            w: 24, h: 24,
            forcedType: forcedType || null, // null = cycling, string = fixed
            frame: Math.floor(Math.random() * 300), // random start phase
        });
    }

    spawnAsteroid() {
        const typeIdx = Math.floor(Math.random() * SPRITES.asteroids.types.length);
        const def = SPRITES.asteroids.types[typeIdx];
        const size = Math.max(def.w, def.h);
        this.asteroids.push({
            x: Math.random() * GAME_W,
            y: -50,
            vx: (Math.random() - 0.5) * 1,
            vy: 1 + Math.random() * 1.5,
            w: size, h: size,
            typeIdx,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.03,
            hp: size > 30 ? 3 : (size > 20 ? 2 : 1),
        });
    }

    spawnMine() {
        this.mines.push({
            x: 20 + Math.random() * (GAME_W - 40),
            y: -30,
            vy: 0.8 + Math.random() * 0.5,
            w: 24, h: 24,
            colorIdx: Math.floor(Math.random() * 3),
            frame: 0,
            hp: 2,
        });
    }

    // ─── Update Helpers ───
    updatePowerups() {
        const types = ['health', 'shield', 'weapon', 'speed', 'score2x'];
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const pu = this.powerups[i];
            pu.y += pu.vy;
            pu.frame++;

            // Only remove when off-screen
            if (pu.y > GAME_H + 30) {
                this.powerups.splice(i, 1);
                continue;
            }

            if (this.collides(pu, this.player)) {
                // Determine current type from cycling frame (90 frames per type)
                const currentType = pu.forcedType || types[Math.floor(pu.frame / 90) % 5];
                this.collectPowerup(pu, currentType);
                this.powerups.splice(i, 1);
            }
        }
    }

    collectPowerup(pu, type) {
        const p = this.player;
        switch (type) {
            case 'health':
                p.hp = Math.min(p.maxHp, p.hp + 1);
                break;
            case 'shield':
                p.shield = 600; // 10 seconds, disappears on hit
                break;
            case 'weapon':
                p.weaponLevel = Math.min(3, p.weaponLevel + 1);
                break;
            case 'speed':
                p.speedLevel = Math.min(3, p.speedLevel + 1);
                break;
            case 'score2x':
                p.scoreMulti = 600;
                break;
        }
        this.audio.powerup();
        this.particles.emit(pu.x, pu.y, 10, '#0f0', 3, 20);
        this.spawnFloatingText(pu.x, pu.y - 10, type.toUpperCase());
    }

    updateAsteroids() {
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
            const a = this.asteroids[i];
            a.x += a.vx;
            a.y += a.vy;
            a.rot += a.rotSpeed;

            if (a.y > GAME_H + 60) {
                this.asteroids.splice(i, 1);
                continue;
            }

            // Player bullet collision
            for (let j = this.playerBullets.length - 1; j >= 0; j--) {
                if (this.collides(this.playerBullets[j], a)) {
                    a.hp--;
                    this.particles.emit(this.playerBullets[j].x, this.playerBullets[j].y, 3, '#aaa', 2, 10);
                    this.playerBullets.splice(j, 1);
                    if (a.hp <= 0) {
                        this.score += 50;
                        this.spawnExplosion(a.x, a.y, 0);
                        this.particles.emit(a.x, a.y, 8, '#a84', 3, 20);
                        this.asteroids.splice(i, 1);
                        this.audio.explosion(false);
                    }
                    break;
                }
            }

            // Player collision
            if (i < this.asteroids.length && this.player.invuln <= 0 && this.playerHitBy(a)) {
                this.hitPlayer();
                this.asteroids.splice(i, 1);
            }
        }
    }

    updateMines() {
        for (let i = this.mines.length - 1; i >= 0; i--) {
            const m = this.mines[i];
            m.y += m.vy;
            m.frame++;

            if (m.y > GAME_H + 30) {
                this.mines.splice(i, 1);
                continue;
            }

            // Proximity check - mine detonates near player
            const dx = this.player.x - m.x;
            const dy = this.player.y - m.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 50) {
                // Move towards player
                m.x += (dx / dist) * 2;
                m.y += (dy / dist) * 2;
            }

            // Player bullet collision
            for (let j = this.playerBullets.length - 1; j >= 0; j--) {
                if (this.collides(this.playerBullets[j], m)) {
                    m.hp--;
                    this.playerBullets.splice(j, 1);
                    if (m.hp <= 0) {
                        this.score += 150;
                        this.spawnExplosion(m.x, m.y, 1);
                        this.particles.emit(m.x, m.y, 12, '#f4f', 4, 25);
                        this.mines.splice(i, 1);
                        this.audio.explosion(false);
                        this.shake.add(3);
                    }
                    break;
                }
            }

            // Player collision
            if (i < this.mines.length && this.player.invuln <= 0 && this.playerHitBy(m)) {
                this.hitPlayer();
                this.spawnExplosion(m.x, m.y, 1);
                this.mines.splice(i, 1);
                this.shake.add(4);
                this.audio.explosion(false);
            }
        }
    }

    updateExplosions() {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const ex = this.explosions[i];
            ex.timer++;
            if (ex.timer >= ex.speed) {
                ex.timer = 0;
                ex.frame++;
                if (ex.frame >= ex.maxFrames) {
                    this.explosions.splice(i, 1);
                }
            }
        }
        // Big explosions (boss/mini-boss death)
        for (let i = this.bigExplosions.length - 1; i >= 0; i--) {
            const bx = this.bigExplosions[i];
            if (bx.delay > 0) {
                bx.delay--;
                // Shake while waiting for staggered explosions
                if (bx.delay % 4 === 0) this.shake.add(2);
                continue;
            }
            bx.timer++;
            if (bx.timer >= bx.speed) {
                bx.timer = 0;
                bx.frame++;
                // Shake on first frame of each explosion
                if (bx.frame === 1) this.shake.add(3);
                if (bx.frame >= bx.maxFrames) {
                    this.bigExplosions.splice(i, 1);
                }
            }
        }
        // Bullet hit effects
        for (let i = this.bulletHits.length - 1; i >= 0; i--) {
            const bh = this.bulletHits[i];
            bh.timer++;
            if (bh.timer >= bh.speed) {
                bh.timer = 0;
                bh.frame++;
                if (bh.frame >= bh.maxFrames) {
                    this.bulletHits.splice(i, 1);
                }
            }
        }
    }

    // ─── Collision ───
    collides(a, b) {
        const ax = a.x - a.w / 2, ay = a.y - a.h / 2;
        const bx = b.x - b.w / 2, by = b.y - b.h / 2;
        return ax < bx + b.w && ax + a.w > bx && ay < by + b.h && ay + a.h > by;
    }

    // Collision check using player's smaller hitbox (for damage only)
    playerHitBy(obj) {
        const p = this.player;
        const px = p.x - p.hitW / 2, py = p.y - p.hitH / 2;
        const ox = obj.x - obj.w / 2, oy = obj.y - obj.h / 2;
        return px < ox + obj.w && px + p.hitW > ox && py < oy + obj.h && py + p.hitH > oy;
    }

    // ═══════════════════════════════════════
    // ─── RENDERING ───
    // ═══════════════════════════════════════
    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        // Apply screen shake
        const shk = this.shake.offset;
        ctx.save();
        ctx.translate(shk.x, shk.y);

        // Background
        this.bg.draw(ctx);

        if (this.state === 'menu') {
            this.drawMenu(ctx);
        } else if (this.state === 'levelselect') {
            this.drawLevelSelect(ctx);
        } else if (this.state === 'playing' || this.state === 'gameover' || this.state === 'paused') {
            this.drawGame(ctx);
            if (this.state === 'paused') {
                this.drawPaused(ctx);
            }
        }

        ctx.restore();

        // Flash overlay (no shake)
        if (this.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255,255,255,${this.flashAlpha})`;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        }
    }

    drawMenu(ctx) {
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Title
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 48px "Courier New", monospace';
        ctx.fillText('AXELUGA', GAME_W / 2, 200);

        // Subtitle
        ctx.fillStyle = '#88f';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText('SPACE SHOOTER', GAME_W / 2, 230);

        // Pulsing start text
        const alpha = 0.5 + Math.sin(this.frame * 0.05) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText('TAP OR PRESS SPACE TO START', GAME_W / 2, 400);

        // High score
        if (this.highScore > 0) {
            ctx.fillStyle = '#ff8';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText(`HIGH SCORE: ${this.highScore.toLocaleString()}`, GAME_W / 2, 450);
        }

        // Controls
        ctx.fillStyle = '#666';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText('WASD / ARROWS / 🎮 STICK TO MOVE', GAME_W / 2, 505);
        ctx.fillText('SPACE / CLICK / 🎮 A TO FIRE', GAME_W / 2, 520);
        ctx.fillText('E·Q / 🎮 B TO USE BOMB', GAME_W / 2, 535);
        ctx.fillText('ESC·P / 🎮 START TO PAUSE', GAME_W / 2, 550);
        ctx.fillText('KILL ENEMIES TO CHARGE BOMBS', GAME_W / 2, 565);

        // Gamepad connected indicator + debug
        if (this.input.gpConnected && this.input.gpDebug) {
            const dbg = this.input.gpDebug;
            ctx.fillStyle = '#0f0';
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText('🎮 GAMEPAD CONNECTED', GAME_W / 2, 585);
            ctx.fillStyle = '#0a0';
            ctx.font = '7px "Courier New", monospace';
            const name = dbg.id.length > 40 ? dbg.id.substring(0, 40) + '…' : dbg.id;
            ctx.fillText(name, GAME_W / 2, 596);
            ctx.fillText(`mapping: ${dbg.mapping} | ${dbg.numButtons}btn ${dbg.numAxes}axes`, GAME_W / 2, 605);
            // Show live data
            const axStr = `stick: ${dbg.axes[0]},${dbg.axes[1]}`;
            const btnStr = dbg.buttons.length > 0 ? `BTN: ${dbg.buttons.join(',')}` : 'press a button...';
            ctx.fillStyle = '#ff0';
            ctx.fillText(`${axStr} | ${btnStr}`, GAME_W / 2, 616);
            // Tip for non-standard mapping
            if (dbg.mapping !== 'standard') {
                ctx.fillStyle = '#f80';
                ctx.fillText('TIP: Switch to X-input mode for best support', GAME_W / 2, 627);
            }
        } else if (this.input.gpConnected) {
            ctx.fillStyle = '#0f0';
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText('🎮 GAMEPAD CONNECTED', GAME_W / 2, 585);
        }

        // Credits
        ctx.fillStyle = '#444';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('ASSETS: TIMBERLATE007 · DYLESTORM', GAME_W / 2, 635);
        ctx.fillText('PULSEGAMES.EU', GAME_W / 2, 648);
    }

    drawLevelSelect(ctx) {
        // Background already shows selected world preview
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';

        // Header
        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 28px "Courier New", monospace';
        ctx.fillText('SELECT WORLD', GAME_W / 2, 180);

        ctx.fillStyle = '#666';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText('↑↓ SELECT · ENTER/TAP TO START · ESC BACK', GAME_W / 2, 210);

        // World options
        const colors = ['#4af', '#c4f', '#f84'];
        const icons = ['✦', '▸', '⚙'];
        for (let i = 0; i < WORLDS.length; i++) {
            const w = WORLDS[i];
            const y = 280 + i * 80;
            const sel = this.menuCursor === i;
            const pulse = sel ? 0.9 + Math.sin(this.frame * 0.08) * 0.1 : 1;

            // Selection box
            if (sel) {
                ctx.fillStyle = 'rgba(0,255,255,0.08)';
                ctx.fillRect(30, y - 28, GAME_W - 60, 56);
                ctx.strokeStyle = '#0ff';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(30, y - 28, GAME_W - 60, 56);
            }

            // World number + icon
            ctx.fillStyle = sel ? colors[i] : '#666';
            ctx.font = `bold ${sel ? 20 : 16}px "Courier New", monospace`;
            ctx.save();
            ctx.translate(GAME_W / 2, y - 4);
            ctx.scale(pulse, pulse);
            ctx.fillText(`${icons[i]} ${w.name}`, 0, 0);
            ctx.restore();

            // Subtitle
            ctx.fillStyle = sel ? '#aaa' : '#555';
            ctx.font = '11px "Courier New", monospace';
            ctx.fillText(w.subtitle, GAME_W / 2, y + 16);
        }

        // High score
        if (this.highScore > 0) {
            ctx.fillStyle = '#ff8';
            ctx.font = '11px "Courier New", monospace';
            ctx.fillText(`HIGH SCORE: ${this.highScore.toLocaleString()}`, GAME_W / 2, 540);
        }

        // Gamepad indicator
        if (this.input.gpConnected) {
            ctx.fillStyle = '#0f0';
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText('🎮 GAMEPAD CONNECTED', GAME_W / 2, 580);
        }

        // Credits
        ctx.fillStyle = '#333';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('ASSETS: TIMBERLATE007 · DYLESTORM', GAME_W / 2, 635);
        ctx.fillText('PULSEGAMES.EU', GAME_W / 2, 648);
    }

    drawPaused(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';

        // Title
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px "Courier New", monospace';
        ctx.fillText('PAUSED', GAME_W / 2, GAME_H / 2 - 50);

        // Menu options
        const opts = ['RESUME', 'QUIT TO MENU'];
        for (let i = 0; i < opts.length; i++) {
            const y = GAME_H / 2 + 10 + i * 36;
            const sel = this.pauseCursor === i;
            ctx.fillStyle = sel ? '#0ff' : '#888';
            ctx.font = `${sel ? 'bold ' : ''}16px "Courier New", monospace`;
            ctx.fillText((sel ? '▸ ' : '  ') + opts[i], GAME_W / 2, y);
        }

        // Stats
        ctx.fillStyle = '#555';
        ctx.font = '10px "Courier New", monospace';
        const worldDef = WORLDS[this.world % WORLDS.length];
        ctx.fillText(`WAVE ${this.wave} · ${worldDef.name} · SCORE: ${this.score.toLocaleString()}`, GAME_W / 2, GAME_H / 2 + 100);
    }

    drawGame(ctx) {
        // Draw powerups
        for (const pu of this.powerups) {
            this.drawPowerup(ctx, pu);
        }

        // Draw asteroids
        for (const a of this.asteroids) {
            this.drawAsteroid(ctx, a);
        }

        // Draw mines
        for (const m of this.mines) {
            this.drawMine(ctx, m);
        }

        // Draw player bullets
        for (const b of this.playerBullets) {
            this.drawBullet(ctx, b, true);
        }

        // Draw enemy bullets
        for (const b of this.enemyBullets) {
            this.drawBullet(ctx, b, false);
        }

        // Draw enemies
        for (const e of this.enemies) {
            this.drawEnemy(ctx, e);
        }

        // Draw player
        if (!this.player.dead) {
            this.drawPlayer(ctx);
        }

        // Draw explosions
        for (const ex of this.explosions) {
            this.drawExplosion(ctx, ex);
        }

        // Draw big explosions (boss/mini-boss death)
        for (const bx of this.bigExplosions) {
            if (bx.delay > 0) continue;
            this.drawBigExplosion(ctx, bx);
        }

        // Draw bullet hit effects
        const hitImg = this.assets.get('bullet_hit.png');
        if (hitImg) {
            for (const bh of this.bulletHits) {
                const fw = 14, fh = 14;
                const sx = bh.frame * fw;
                ctx.globalCompositeOperation = 'lighter';
                ctx.drawImage(hitImg, sx, 0, fw, fh, bh.x - 8, bh.y - 8, 16, 16);
                ctx.globalCompositeOperation = 'source-over';
            }
        }

        // Draw particles
        this.particles.draw(ctx);

        // Draw floating score texts
        this.drawFloatingTexts(ctx);

        // Bomb effect
        if (this.bombActive > 0) {
            this.drawBombEffect(ctx);
        }

        // Draw HUD
        this.drawHUD(ctx);

        // Wave text (boss warning)
        if (this.showWaveText > 0) {
            this.drawWaveText(ctx);
            this.showWaveText--;
        }

        // World transition text
        if (this.showWorldText > 0) {
            this.drawWorldText(ctx);
        }

        // World transition overlay (on top of everything)
        if (this.worldTransition) {
            this.drawWorldTransition(ctx);
        }

        // Game over overlay
        if (this.state === 'gameover') {
            this.drawGameOver(ctx);
        }
    }

    // ─── Draw Entities ───
    drawPlayer(ctx) {
        const p = this.player;

        // Invulnerability blink
        if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return;

        // Shield effect
        if (p.shield > 0) {
            const shieldImg = this.assets.get(SPRITES.barrier.sheet);
            if (shieldImg) {
                const s = SPRITES.barrier.variants[0];
                ctx.globalAlpha = 0.4 + Math.sin(this.frame * 0.1) * 0.2;
                ctx.drawImage(shieldImg, s.x, s.y, s.w, s.h,
                    p.x - 24, p.y - 24, 48, 48);
                ctx.globalAlpha = 1;
            }
        }

        // Draw ship sprite
        const shipImg = this.assets.get(SPRITES.player.sheet);
        if (shipImg) {
            const sprite = SPRITES.player.type1[2]; // Blue ship
            ctx.drawImage(shipImg, sprite.x, sprite.y, sprite.w, sprite.h,
                p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
        } else {
            // Fallback
            ctx.fillStyle = '#4af';
            ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
        }

        // Exhaust
        const exImg = this.assets.get(SPRITES.exhaust.sheet);
        if (exImg) {
            const frameIdx = Math.floor(this.frame / 6) % 4;
            const exSprite = SPRITES.exhaust.type3[frameIdx];
            if (exSprite) {
                ctx.drawImage(exImg, exSprite.x, exSprite.y, exSprite.w, exSprite.h,
                    p.x - 6, p.y + p.h / 2 - 4, 12, 18);
            }
        }
    }

    drawEnemy(ctx, e) {
        if (e.flashTimer > 0) {
            ctx.globalCompositeOperation = 'lighter';
        }

        if (e.isMiniBoss) {
            // Draw standalone DyLESTorm mini-boss sprite (rotated 180°)
            const mbImg = this.assets.get(e.miniBossSprite);
            if (mbImg) {
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(Math.PI);
                ctx.drawImage(mbImg, -e.w / 2, -e.h / 2, e.w, e.h);
                ctx.restore();
            } else {
                ctx.fillStyle = '#f8f';
                ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
            }
            // Mini-boss HP bar
            const barW = 60;
            const barH = 4;
            const barX = e.x - barW / 2;
            const barY = e.y + e.h / 2 + 6;
            ctx.fillStyle = '#420';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#fa0';
            ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
        } else if (e.isBoss) {
            const rage = e.hp / e.maxHp <= 0.25;
            const img = this.assets.get(SPRITES.boss.sheet);
            if (img) {
                const sprite = SPRITES.boss.variants[e.colorRow % 6];
                const size = e.w;

                // Rage: pulsing red overlay
                if (rage) {
                    const pulse = 0.15 + Math.sin(this.frame * 0.3) * 0.1;
                    ctx.globalAlpha = pulse;
                    ctx.fillStyle = '#f00';
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, size * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }

                ctx.drawImage(img, sprite.x, sprite.y, sprite.w, sprite.h,
                    e.x - size / 2, e.y - size / 2, size, size);

                // Boss HP bar
                const barW = 80;
                const barH = 4;
                const barX = e.x - barW / 2;
                const barY = e.y + size / 2 + 8;
                ctx.fillStyle = '#400';
                ctx.fillRect(barX, barY, barW, barH);
                // Bar color: red → flashing red/yellow in rage
                if (rage) {
                    ctx.fillStyle = this.frame % 10 < 5 ? '#f44' : '#ff0';
                } else {
                    ctx.fillStyle = '#f44';
                }
                ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);

                // Rage label
                if (rage) {
                    ctx.fillStyle = '#f00';
                    ctx.font = 'bold 9px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.globalAlpha = 0.6 + Math.sin(this.frame * 0.25) * 0.4;
                    ctx.fillText('RAGE', e.x, barY + 14);
                    ctx.globalAlpha = 1;
                }
            } else {
                ctx.fillStyle = '#f4f';
                ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
            }
        } else if (e.dylSprite) {
            // DyLESTorm standalone enemy sprite (rotated 180° to face down)
            const dImg = this.assets.get(e.dylSprite);
            if (dImg) {
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(Math.PI);
                ctx.drawImage(dImg, -e.w / 2, -e.h / 2, e.w, e.h);
                ctx.restore();
            } else {
                ctx.fillStyle = '#f44';
                ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
            }
        } else {
            const img = this.assets.get(SPRITES.enemy.sheet);
            if (img) {
                const row = e.colorRow % 3;
                const col = e.spriteType % 4;
                const sprite = SPRITES.enemy.types[row][col];
                ctx.drawImage(img, sprite.x, sprite.y, sprite.w, sprite.h,
                    e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
            } else {
                ctx.fillStyle = '#f44';
                ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
            }
        }

        if (e.flashTimer > 0) {
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    drawBullet(ctx, b, isPlayer) {
        if (isPlayer && b.wpnLevel) {
            // DyLEStorm weapon-level sprites
            const wpnFile = `bullet_wpn${Math.min(b.wpnLevel, 3)}.png`;
            const img = this.assets.get(wpnFile);
            if (img) {
                if (b.wpnLevel >= 3 && img.width > img.height) {
                    // Hyper bullet: 2-frame spritesheet (64x32), animate
                    const fw = 32, fh = 32;
                    const frame = Math.floor(this.frame / 4) % 2;
                    ctx.drawImage(img, frame * fw, 0, fw, fh,
                        b.x - 8, b.y - 10, 16, 20);
                } else {
                    // Single sprite bullet
                    const dw = Math.max(b.w, 8);
                    const dh = Math.max(b.h, 14);
                    ctx.drawImage(img, b.x - dw / 2, b.y - dh / 2, dw, dh);
                }
                return;
            }
        }
        // Fallback: Timberlate spritesheet or colored rect
        const img = this.assets.get(SPRITES.bullets.sheet);
        if (img) {
            const bullets = isPlayer
                ? SPRITES.bullets.playerBullets
                : SPRITES.bullets.enemyBullets;
            const sprite = bullets[b.type % bullets.length];
            ctx.drawImage(img, sprite.x, sprite.y, sprite.w, sprite.h,
                b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        } else {
            ctx.fillStyle = isPlayer ? '#4ff' : '#f44';
            ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        }
    }

    drawExplosion(ctx, ex) {
        const img = this.assets.get(SPRITES.explosion.sheet);
        if (!img) return;

        const fw = SPRITES.explosion.frameW;
        const fh = SPRITES.explosion.frameH;
        const sx = ex.frame * fw;
        const sy = ex.colorRow * fh;
        const scale = [1, 1.5, 2.5][ex.size] || 1;
        const size = fw * scale;

        ctx.drawImage(img, sx, sy, fw, fh,
            ex.x - size / 2, ex.y - size / 2, size, size);
    }

    drawBigExplosion(ctx, bx) {
        const img = this.assets.get('dyl_explosion.png');
        if (!img) return;

        const fw = 48; // each frame is 48x48 in 384x48 spritesheet
        const sx = bx.frame * fw;
        const sz = bx.size;

        // Fade out in last 2 frames
        if (bx.frame >= 6) {
            ctx.globalAlpha = bx.frame >= 7 ? 0.3 : 0.6;
        }

        // Additive blending for glow effect
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(img, sx, 0, fw, 48,
            bx.x - sz / 2, bx.y - sz / 2, sz, sz);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    drawPowerup(ctx, pu) {
        const img = this.assets.get(SPRITES.bonuses.sheet);
        const pulse = 0.85 + Math.sin(pu.frame * 0.1) * 0.15;
        ctx.globalAlpha = pulse;

        // Current type index: cycles every 90 frames (1.5 sec per type)
        const types = ['health', 'shield', 'weapon', 'speed', 'score2x'];
        const typeIdx = pu.forcedType
            ? types.indexOf(pu.forcedType)
            : Math.floor(pu.frame / 90) % 5;

        if (img) {
            const cell = SPRITES.bonuses.cellSize;
            const off = SPRITES.bonuses.spriteOffset;
            const sz = SPRITES.bonuses.spriteSize;
            // Slow sparkle: just 2 frames alternating (subtle glow, not confusing)
            const frameCol = Math.floor(pu.frame / 20) % 2;
            const sx = frameCol * cell + off;
            const sy = typeIdx * cell + off;
            ctx.drawImage(img, sx, sy, sz, sz,
                pu.x - pu.w / 2, pu.y - pu.h / 2, pu.w, pu.h);
        } else {
            const colors = ['#0f0', '#0ff', '#ff0', '#f80', '#f0f'];
            ctx.fillStyle = colors[typeIdx];
            ctx.fillRect(pu.x - pu.w / 2, pu.y - pu.h / 2, pu.w, pu.h);
        }

        // Type label below powerup (colored by type)
        const typeColors = ['#0f0', '#0ff', '#ff0', '#f80', '#f0f'];
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = typeColors[typeIdx];
        ctx.font = 'bold 8px "Courier New", monospace';
        ctx.textAlign = 'center';
        const label = pu.forcedType || types[typeIdx];
        const shortLabel = { health: 'HP', shield: 'SHD', weapon: 'WPN', speed: 'SPD', score2x: '2X' };
        ctx.fillText(shortLabel[label], pu.x, pu.y + pu.h / 2 + 9);

        ctx.globalAlpha = 1;
    }

    drawAsteroid(ctx, a) {
        const img = this.assets.get(SPRITES.asteroids.sheet);
        if (img) {
            const sprite = SPRITES.asteroids.types[a.typeIdx];
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rot);
            ctx.drawImage(img, sprite.x, sprite.y, sprite.w, sprite.h,
                -a.w / 2, -a.h / 2, a.w, a.h);
            ctx.restore();
        } else {
            ctx.fillStyle = '#864';
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.w / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawMine(ctx, m) {
        const img = this.assets.get(SPRITES.mines.sheet);
        if (img) {
            const colorFrames = SPRITES.mines.large[m.colorIdx % 3];
            const frameIdx = Math.floor(m.frame / 10) % colorFrames.length;
            const s = colorFrames[frameIdx];
            ctx.drawImage(img, s.x, s.y, s.w, s.h,
                m.x - m.w / 2, m.y - m.h / 2, m.w, m.h);
        } else {
            ctx.fillStyle = '#f4f';
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.w / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ─── HUD ───
    drawHUD(ctx) {
        const p = this.player;

        // Score
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.fillText('SCORE', 8, 18);
        ctx.fillStyle = '#0ff';
        ctx.fillText(this.score.toLocaleString(), 8, 34);

        // Wave + World
        ctx.textAlign = 'right';
        ctx.fillStyle = '#888';
        ctx.font = '12px "Courier New", monospace';
        const worldDef = WORLDS[this.world % WORLDS.length];
        ctx.fillText(`${worldDef.name}`, GAME_W - 8, 18);

        // Combo
        if (this.combo > 1) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 12px "Courier New", monospace';
            ctx.fillText(`x${this.combo} COMBO`, GAME_W / 2, 18);
        }

        // Score multiplier
        if (p.scoreMulti > 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f0f';
            ctx.font = 'bold 11px "Courier New", monospace';
            ctx.fillText('2X SCORE', GAME_W / 2, 34);
        }

        // HP Hearts
        ctx.textAlign = 'left';
        for (let i = 0; i < p.maxHp; i++) {
            const hx = 8 + i * 16;
            const hy = GAME_H - 22;
            ctx.fillStyle = i < p.hp ? '#f44' : '#444';
            ctx.font = '14px serif';
            ctx.fillText('♥', hx, hy + 12);
        }

        // Weapon level (visual bars)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#4af';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('WPN', 8, GAME_H - 30);
        for (let i = 0; i < 3; i++) {
            const bx = 34 + i * 14;
            const by = GAME_H - 37;
            ctx.fillStyle = i < p.weaponLevel ? '#4af' : '#333';
            ctx.fillRect(bx, by, 10, 7);
            if (i < p.weaponLevel) {
                ctx.fillStyle = '#8cf';
                ctx.fillRect(bx, by, 10, 3);
            }
        }

        // Speed level (visual bars, right side)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#f80';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('SPD', GAME_W - 8, GAME_H - 30);
        for (let i = 0; i < 3; i++) {
            const bx = GAME_W - 52 + i * 14;
            const by = GAME_H - 37;
            ctx.fillStyle = i < p.speedLevel ? '#f80' : '#333';
            ctx.fillRect(bx, by, 10, 7);
            if (i < p.speedLevel) {
                ctx.fillStyle = '#fc4';
                ctx.fillRect(bx, by, 10, 3);
            }
        }

        // ── Bomb charge meter (left side, above HP) ──
        const meterX = 8;
        const meterY = GAME_H - 50;
        const meterW = 80;
        const meterH = 6;
        const fillRatio = this.bombCharge / this.bombChargeMax;

        // Meter background
        ctx.fillStyle = '#222';
        ctx.fillRect(meterX, meterY, meterW, meterH);
        // Meter fill (orange → yellow as it fills)
        const r = 255;
        const g = Math.floor(120 + fillRatio * 135);
        ctx.fillStyle = `rgb(${r},${g},${Math.floor(fillRatio * 80)})`;
        ctx.fillRect(meterX, meterY, meterW * fillRatio, meterH);
        // Pulse when almost full
        if (fillRatio > 0.8) {
            ctx.globalAlpha = 0.3 + Math.sin(this.frame * 0.2) * 0.2;
            ctx.fillStyle = '#ff0';
            ctx.fillRect(meterX, meterY, meterW * fillRatio, meterH);
            ctx.globalAlpha = 1;
        }
        // Border
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(meterX, meterY, meterW, meterH);
        // Label
        ctx.fillStyle = '#f80';
        ctx.font = '8px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('CHARGE', meterX, meterY - 2);

        // ── Bomb count ──
        if (this.bombs > 0) {
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 10px "Courier New", monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`💣×${this.bombs} [E]`, meterX + meterW + 8, meterY + 6);
        }

        // Active power-ups indicators
        let puY = GAME_H - 22;
        ctx.textAlign = 'right';
        ctx.font = '10px "Courier New", monospace';
        if (p.shield > 0) {
            ctx.fillStyle = '#0ff';
            ctx.fillText(`SHIELD ${Math.ceil(p.shield / 60)}s`, GAME_W - 8, puY);
            puY -= 14;
        }

        // ── Fire button (visible only on touch devices) ──
        if (this.input.isTouchDevice) {
            const fz = this.input.fireZone;
            const firing = this.input.isFiring();
            ctx.globalAlpha = firing ? 0.6 : 0.25;
            ctx.fillStyle = firing ? '#f44' : '#888';
            ctx.beginPath();
            ctx.arc(fz.x + fz.w / 2, fz.y + fz.h / 2, 32, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = firing ? '#f88' : '#aaa';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = firing ? 0.9 : 0.5;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('FIRE', fz.x + fz.w / 2, fz.y + fz.h / 2 + 4);
            ctx.globalAlpha = 1;

            // Bomb button (bottom-left, only if bombs available)
            if (this.bombs > 0) {
                const bx = 15, by = GAME_H - 90;
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#f80';
                ctx.beginPath();
                ctx.arc(bx + 28, by + 28, 26, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 11px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.fillText('BOMB', bx + 28, by + 31);
                ctx.globalAlpha = 1;
            }
        }

        // High score
        ctx.textAlign = 'right';
        ctx.fillStyle = '#555';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText(`HI: ${this.highScore.toLocaleString()}`, GAME_W - 8, 34);
    }

    drawWaveText(ctx) {
        const isMiniBoss = this.waveTextType === 'miniboss';
        // Show text for boss or mini-boss waves
        if (!this.bossActive && !isMiniBoss) return;

        const alpha = Math.min(1, this.showWaveText / 30);
        const scale = this.showWaveText > 90 ? 1 + (this.showWaveText - 90) * 0.02 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.translate(GAME_W / 2, GAME_H / 2 - 40);
        ctx.scale(scale, scale);

        if (isMiniBoss) {
            ctx.fillStyle = '#fa0';
            ctx.font = 'bold 24px "Courier New", monospace';
            ctx.fillText('⚠ DANGER ⚠', 0, 0);
            ctx.fillStyle = '#fc8';
            ctx.font = '14px "Courier New", monospace';
            ctx.fillText('MINI-BOSS APPROACHING', 0, 24);
            if (this.showWaveText <= 1) this.waveTextType = null;
        } else {
            ctx.fillStyle = '#f44';
            ctx.font = 'bold 28px "Courier New", monospace';
            ctx.fillText('⚠ WARNING ⚠', 0, 0);
            ctx.fillStyle = '#f88';
            ctx.font = '16px "Courier New", monospace';
            ctx.fillText('BOSS INCOMING', 0, 28);
        }

        ctx.restore();
    }

    drawFloatingTexts(ctx) {
        ctx.textAlign = 'center';
        for (const ft of this.floatingTexts) {
            const alpha = Math.min(1, ft.life / (ft.maxLife * 0.3));
            const scale = ft.life > ft.maxLife - 8 ? 1.3 - (ft.life - ft.maxLife + 8) * 0.04 : 1;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = ft.color;
            ctx.font = `bold ${Math.floor(ft.size * scale)}px "Courier New", monospace`;
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1;
    }

    drawBombEffect(ctx) {
        // Expanding circle of light
        const progress = 1 - this.bombActive / 30;
        const radius = progress * Math.max(GAME_W, GAME_H);

        ctx.save();
        ctx.globalAlpha = (1 - progress) * 0.6;
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 4 + (1 - progress) * 8;
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glow
        ctx.globalAlpha = (1 - progress) * 0.3;
        ctx.fillStyle = '#ff8';
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y, radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawWorldText(ctx) {
        const worldDef = WORLDS[this.world % WORLDS.length];
        const t = this.showWorldText;

        // Fade in for first 30 frames, hold, fade out last 30 frames
        let alpha;
        if (t > 150) alpha = (180 - t) / 30;
        else if (t < 30) alpha = t / 30;
        else alpha = 1;

        const scale = t > 150 ? 1 + (t - 150) * 0.01 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.translate(GAME_W / 2, GAME_H / 2 - 20);
        ctx.scale(scale, scale);

        // World number
        ctx.fillStyle = '#888';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText(`— WORLD ${this.world + 1} —`, 0, -20);

        // World name
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px "Courier New", monospace';
        ctx.fillText(worldDef.name, 0, 8);

        // Subtitle
        ctx.fillStyle = '#0ff';
        ctx.font = '11px "Courier New", monospace';
        ctx.fillText(worldDef.subtitle, 0, 28);

        ctx.restore();
    }

    drawWorldTransition(ctx) {
        const wt = this.worldTransition;
        if (!wt) return;

        ctx.save();

        if (wt.phase === 0) {
            // Phase 0: Speed lines + "SECTOR CLEAR" text
            const progress = wt.timer / 90;

            // Speed lines
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            for (const sl of wt.speedLines) {
                ctx.globalAlpha = sl.alpha * Math.min(1, progress * 3);
                ctx.beginPath();
                ctx.moveTo(sl.x, sl.y);
                ctx.lineTo(sl.x, sl.y - sl.len);
                ctx.stroke();
            }

            // Dim overlay building up
            ctx.globalAlpha = progress * 0.3;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME_W, GAME_H);

            // "SECTOR CLEAR" text
            if (wt.timer > 20) {
                const textAlpha = Math.min(1, (wt.timer - 20) / 15);
                ctx.globalAlpha = textAlpha;
                ctx.textAlign = 'center';

                // Flash effect
                const flash = Math.sin(wt.timer * 0.2) * 0.3 + 0.7;
                ctx.fillStyle = `rgba(0, 255, 200, ${flash})`;
                ctx.font = 'bold 10px "Courier New", monospace';
                ctx.fillText('★ ★ ★', GAME_W / 2, GAME_H / 2 - 40);

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 26px "Courier New", monospace';
                ctx.fillText('SECTOR CLEAR', GAME_W / 2, GAME_H / 2);

                // Score bonus text
                ctx.fillStyle = '#ff0';
                ctx.font = 'bold 14px "Courier New", monospace';
                ctx.fillText(`WORLD ${wt.fromWorld + 1} COMPLETE`, GAME_W / 2, GAME_H / 2 + 30);
            }

        } else if (wt.phase === 1) {
            // Phase 1: Fade to black
            const fadeProgress = wt.timer / 40;
            ctx.globalAlpha = fadeProgress;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME_W, GAME_H);

            // Speed lines fade out
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            for (const sl of wt.speedLines) {
                ctx.globalAlpha = sl.alpha * (1 - fadeProgress) * 0.5;
                ctx.beginPath();
                ctx.moveTo(sl.x, sl.y);
                ctx.lineTo(sl.x, sl.y - sl.len * (1 + fadeProgress));
                ctx.stroke();
            }

        } else if (wt.phase === 2) {
            // Phase 2: Hold black
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME_W, GAME_H);

            // "ENTERING..." text pulsing
            const pulse = 0.5 + Math.sin(wt.timer * 0.15) * 0.5;
            ctx.globalAlpha = pulse;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#0ff';
            ctx.font = '12px "Courier New", monospace';
            const nextWorld = WORLDS[wt.toWorld % WORLDS.length];
            ctx.fillText(`ENTERING ${nextWorld.name}...`, GAME_W / 2, GAME_H / 2);

        } else if (wt.phase === 3) {
            // Phase 3: Fade in from black
            const fadeIn = 1 - (wt.timer / 60);
            ctx.globalAlpha = Math.max(0, fadeIn);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        }

        ctx.restore();
    }

    drawGameOver(ctx) {
        const alpha = Math.min(1, this.frame / 30);
        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.6})`;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';

        ctx.fillStyle = '#f44';
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.fillText('GAME OVER', GAME_W / 2, GAME_H / 2 - 70);

        ctx.fillStyle = '#fff';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText(`SCORE: ${this.score.toLocaleString()}`, GAME_W / 2, GAME_H / 2 - 20);

        const worldDef = WORLDS[this.world % WORLDS.length];
        ctx.fillStyle = '#ff8';
        ctx.font = '14px "Courier New", monospace';
        ctx.fillText(`WAVE ${this.wave} · ${worldDef.name}`, GAME_W / 2, GAME_H / 2 + 10);

        if (this.score >= this.highScore && this.score > 0) {
            ctx.fillStyle = '#f0f';
            ctx.font = 'bold 14px "Courier New", monospace';
            ctx.fillText('★ NEW HIGH SCORE! ★', GAME_W / 2, GAME_H / 2 + 45);
        }

        if (this.frame > 60) {
            const pulse = 0.5 + Math.sin(this.frame * 0.05) * 0.5;
            ctx.fillStyle = `rgba(255,255,255,${pulse})`;
            ctx.font = '14px "Courier New", monospace';
            ctx.fillText('TAP TO CONTINUE', GAME_W / 2, GAME_H / 2 + 100);
        }

        ctx.globalAlpha = 1;
    }
}
