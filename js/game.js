import {
    GAME_W, GAME_H, PLAYER_SPEED, PLAYER_BULLET_SPEED, PLAYER_FIRE_RATE,
    PLAYER_MAX_HP, PLAYER_INVULN_TIME, ENEMY_BULLET_SPEED,
    SPRITES, WAVE_CONFIG, ENEMY_DEFS, BOSS_DEF, WORLDS,
    DYL_ENEMIES, MINI_BOSS_DEFS, DYL_BACKGROUNDS,
    PE_ENEMIES, CLOUD_SPRITES, CITY_ASSETS, DIFFICULTY
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
        this.scrollPaused = false;
        this.scrollFade = 1; // 1=normal, 0=stopped (smooth transition)
        
        // Atmosphere/cloud system
        this.useAtmoBg = false;
        this.clouds = [];
        this.skyGradient = null;
        this.atmoScrollY = 0;
        
        // City background system
        this.useCityBg = false;
        this.cityRoadY = 0;
        this.cityBlocks = [];   // scrolling building blocks
        this.cityClouds = [];   // cloud shadows over city
    }

    setWorld(world) {
        this.tint = world.tint;
        this.speedMult = world.bgSpeedMult;
        for (const layer of this.layers) {
            layer.speed = layer.baseSpeed * this.speedMult;
        }

        // Use DyLEStorm bg if world has nebulae defined
        this.useDylBg = !!(world.nebulae && world.nebulae.length > 0);
        
        // Atmosphere cloud background
        this.useAtmoBg = world.bgType === 'atmosphere';
        // City background
        this.useCityBg = world.bgType === 'city';
        if (!this.useAtmoBg) {
            this.clouds = []; // Clear cloud data when leaving atmosphere
        }
        if (!this.useCityBg) {
            this.cityBlocks = [];
            this.cityClouds = [];
        }
        if (this.useCityBg) {
            this.useDylBg = false;
            this.useAtmoBg = false;
            // Clear old decorations
            this.decorations = [];
            this.blocks.active = false;
            this.buildingDecs = [];
            this.groundDecs = [];
            this.hasGround = false;
            
            this.cityRoadY = 0;
            this.cityBlocks = [];
            this.cityClouds = [];
            
            // Generate initial city blocks grid
            // Road tile is 80x80, buildings are 144x144
            // Layout: 2 columns of buildings with road lanes
            const blockFiles = CITY_ASSETS.blocks;
            const forestFiles = CITY_ASSETS.forests;
            const roadH = 80;
            const blockSize = 144;
            const rowH = blockSize + 16; // building + gap
            const numRows = Math.ceil(GAME_H / rowH) + 3;
            
            for (let i = -1; i < numRows; i++) {
                const y = i * rowH;
                // Left column
                const isForestL = Math.random() < 0.15;
                const fileL = isForestL 
                    ? forestFiles[Math.floor(Math.random() * forestFiles.length)]
                    : blockFiles[Math.floor(Math.random() * blockFiles.length)];
                const sizeL = isForestL ? 128 : blockSize;
                this.cityBlocks.push({
                    file: fileL, x: 8, y, w: sizeL, h: sizeL, col: 0,
                });
                // Right column
                const isForestR = Math.random() < 0.15;
                const fileR = isForestR
                    ? forestFiles[Math.floor(Math.random() * forestFiles.length)]
                    : blockFiles[Math.floor(Math.random() * blockFiles.length)];
                const sizeR = isForestR ? 128 : blockSize;
                this.cityBlocks.push({
                    file: fileR, x: GAME_W - sizeR - 8, y, w: sizeR, h: sizeR, col: 1,
                });
            }
            
            // City clouds (DyLESTorm cloud shadows)
            const cloudFiles = CITY_ASSETS.clouds;
            for (let i = 0; i < 5; i++) {
                const file = cloudFiles[i % cloudFiles.length];
                const img = this.assets.get(file);
                if (!img) continue;
                this.cityClouds.push({
                    file, img,
                    x: -40 + Math.random() * (GAME_W + 80),
                    y: -200 + Math.random() * (GAME_H + 400),
                    speed: 0.6 + Math.random() * 0.4,
                    alpha: 0.35 + Math.random() * 0.25,
                    scale: 0.8 + Math.random() * 0.6,
                });
            }
            return;
        }
        if (this.useAtmoBg) {
            this.useDylBg = false;
            // Clear any leftover DyLEStorm decorations
            this.decorations = [];
            this.blocks.active = false;
            this.buildingDecs = [];
            this.groundDecs = [];
            this.hasGround = false;
            
            this.skyGradient = world.skyGradient || ['#001','#038','#5af'];
            this.clouds = [];
            this.atmoScrollY = 0;
            const palette = CLOUD_SPRITES[world.cloudPalette || 'sunny'] || CLOUD_SPRITES.sunny;
            // Spawn initial clouds across the screen
            for (let i = 0; i < 18; i++) {
                const file = palette[Math.floor(Math.random() * palette.length)];
                const img = this.assets.get(file);
                if (!img) continue;
                const scale = 0.6 + Math.random() * 1.2;
                const layer = Math.random(); // 0=far, 1=near
                this.clouds.push({
                    img, file,
                    x: -50 + Math.random() * (GAME_W + 100),
                    y: -100 + Math.random() * (GAME_H + 200),
                    scale,
                    layer,
                    speed: 0.3 + layer * 1.2,
                    alpha: 0.25 + layer * 0.45,
                });
            }
            // Sort by layer so far clouds draw first
            this.clouds.sort((a, b) => a.layer - b.layer);
            return;
        }
        
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
        // Smooth scroll fade (boss on screen = slow to stop)
        if (this.scrollPaused) {
            this.scrollFade = Math.max(0.05, this.scrollFade - 0.02);
        } else {
            this.scrollFade = Math.min(1, this.scrollFade + 0.02);
        }
        const fade = this.scrollFade;

        // Timberlate fallback
        for (const layer of this.layers) {
            layer.y += layer.speed * fade;
            if (layer.y >= 320) layer.y -= 320;
        }

        // Atmosphere cloud update
        if (this.useAtmoBg) {
            const spd = this.speedMult * fade;
            this.atmoScrollY += 0.5 * spd;
            for (const c of this.clouds) {
                c.y += c.speed * spd;
                const h = (c.img.height || 80) * c.scale;
                if (c.y > GAME_H + h + 20) {
                    c.y = -h - 20 - Math.random() * 100;
                    c.x = -80 + Math.random() * (GAME_W + 160);
                }
            }
            return;
        }

        // City background update
        if (this.useCityBg) {
            const spd = this.speedMult * fade;
            const roadH = 80;
            this.cityRoadY += 0.8 * spd;
            if (this.cityRoadY >= roadH) this.cityRoadY -= roadH;
            
            // Scroll building blocks
            const rowH = 160; // blockSize + gap
            for (const b of this.cityBlocks) {
                b.y += 0.8 * spd;
            }
            // Recycle blocks that scroll off bottom
            const blockFiles = CITY_ASSETS.blocks;
            const forestFiles = CITY_ASSETS.forests;
            for (let i = this.cityBlocks.length - 1; i >= 0; i--) {
                const b = this.cityBlocks[i];
                if (b.y > GAME_H + 20) {
                    // Find the highest block in same column
                    let minY = GAME_H;
                    for (const ob of this.cityBlocks) {
                        if (ob.col === b.col && ob.y < minY) minY = ob.y;
                    }
                    b.y = minY - rowH;
                    const isForest = Math.random() < 0.15;
                    b.file = isForest
                        ? forestFiles[Math.floor(Math.random() * forestFiles.length)]
                        : blockFiles[Math.floor(Math.random() * blockFiles.length)];
                    const sz = isForest ? 128 : 144;
                    b.w = sz; b.h = sz;
                    if (b.col === 1) b.x = GAME_W - sz - 8;
                }
            }
            
            // City cloud shadows
            for (const c of this.cityClouds) {
                c.y += c.speed * spd;
                const h = (c.img?.height || 100) * c.scale;
                if (c.y > GAME_H + h + 40) {
                    c.y = -h - 40 - Math.random() * 200;
                    c.x = -60 + Math.random() * (GAME_W + 120);
                }
            }
            return;
        }

        if (!this.useDylBg) return;

        // DyLEStorm layers
        const spd = this.speedMult * fade;
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
            this.blocks.y += this.blocks.speed * fade;
            if (this.blocks.y >= 80) this.blocks.y -= 80;
        }

        // Buildings
        for (const b of this.buildingDecs) {
            b.y += b.speed * fade;
            if (b.y > GAME_H + 100) {
                b.y = -100 - Math.random() * 200;
            }
        }

        // Ground scroll
        if (this.hasGround) {
            this.groundScrollY += this.groundSpeed * fade;
        }
    }

    draw(ctx) {
        // City background
        if (this.useCityBg) {
            // Dark asphalt base
            ctx.fillStyle = '#1a1d22';
            ctx.fillRect(0, 0, GAME_W, GAME_H);
            
            // Tiled road surface (center lane between buildings)
            const roadImg = this.assets.get(CITY_ASSETS.road);
            if (roadImg) {
                const rw = 80;
                const rh = 80;
                const roadX = (GAME_W - rw) / 2;
                const scrollY = Math.floor(this.cityRoadY);
                for (let ty = scrollY - rh; ty < GAME_H + rh; ty += rh) {
                    ctx.drawImage(roadImg, roadX, ty, rw, rh);
                }
                // Side road strips (narrower)
                const sideRoadW = 56;
                for (let ty = scrollY - rh; ty < GAME_H + rh; ty += rh) {
                    ctx.drawImage(roadImg, 0, ty, sideRoadW, rh);
                    ctx.drawImage(roadImg, GAME_W - sideRoadW, ty, sideRoadW, rh);
                }
            }
            
            // Draw building blocks
            for (const b of this.cityBlocks) {
                const img = this.assets.get(b.file);
                if (!img) continue;
                ctx.drawImage(img, b.x, b.y, b.w, b.h);
            }
            
            // Ambient light glow from buildings (subtle)
            ctx.globalAlpha = 0.04;
            ctx.fillStyle = '#ff8';
            for (const b of this.cityBlocks) {
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
            ctx.globalAlpha = 1;
            
            // Road markings (center dashed line)
            ctx.strokeStyle = 'rgba(255,200,0,0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([12, 18]);
            const markX = GAME_W / 2;
            const dashOffset = -this.cityRoadY * 2;
            ctx.lineDashOffset = dashOffset;
            ctx.beginPath();
            ctx.moveTo(markX, -20);
            ctx.lineTo(markX, GAME_H + 20);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Cloud shadows floating over city
            for (const c of this.cityClouds) {
                const img = c.img;
                if (!img) continue;
                ctx.globalAlpha = c.alpha;
                const w = img.width * c.scale;
                const h = img.height * c.scale;
                ctx.drawImage(img, c.x - w / 2, c.y - h / 2, w, h);
            }
            ctx.globalAlpha = 1;
            
            // Slight dark vignette at edges
            const vigGrad = ctx.createRadialGradient(
                GAME_W / 2, GAME_H / 2, GAME_W * 0.3,
                GAME_W / 2, GAME_H / 2, GAME_W * 0.7
            );
            vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
            vigGrad.addColorStop(1, 'rgba(0,0,15,0.3)');
            ctx.fillStyle = vigGrad;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
            
            if (this.tint) {
                ctx.fillStyle = `rgba(${this.tint.r},${this.tint.g},${this.tint.b},${this.tint.a})`;
                ctx.fillRect(0, 0, GAME_W, GAME_H);
            }
            return;
        }
        
        // Atmosphere cloud background
        if (this.useAtmoBg) {
            // Draw gradient sky
            const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
            const colors = this.skyGradient;
            for (let i = 0; i < colors.length; i++) {
                grad.addColorStop(i / (colors.length - 1), colors[i]);
            }
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
            
            // Subtle scrolling star dots (high altitude, sparse)
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            const starSeed = 42;
            for (let i = 0; i < 25; i++) {
                const sx = ((i * 137 + starSeed) % GAME_W);
                const sy = ((i * 97 + starSeed + this.atmoScrollY * 0.2) % (GAME_H + 40)) - 20;
                const sz = (i % 3 === 0) ? 1.5 : 1;
                ctx.fillRect(sx, sy, sz, sz);
            }
            
            // Draw clouds
            for (const c of this.clouds) {
                ctx.globalAlpha = c.alpha;
                const w = c.img.width * c.scale;
                const h = c.img.height * c.scale;
                ctx.drawImage(c.img, c.x - w / 2, c.y - h / 2, w, h);
            }
            ctx.globalAlpha = 1;
            
            // Tint overlay
            if (this.tint) {
                ctx.fillStyle = `rgba(${this.tint.r},${this.tint.g},${this.tint.b},${this.tint.a})`;
                ctx.fillRect(0, 0, GAME_W, GAME_H);
            }
            return;
        }
        
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

        // Settings (persisted)
        this._loadSettings();
        this.optionsCursor = 0;
        this._kLeftPrev = false;
        this._kRightPrev = false;
        this._gpLeftPrev = false;
        this._gpRightPrev = false;

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
        files.add('logo.png');

        // Pixel Enemies sprites
        Object.values(PE_ENEMIES).forEach(arr => arr.forEach(f => files.add(f)));
        // PE bosses
        files.add('pe_boss_01.png'); files.add('pe_boss_02.png');
        // Cloud sprites
        Object.values(CLOUD_SPRITES).forEach(arr => arr.forEach(f => files.add(f)));
        // City assets
        files.add(CITY_ASSETS.road);
        CITY_ASSETS.blocks.forEach(f => files.add(f));
        CITY_ASSETS.forests.forEach(f => files.add(f));
        CITY_ASSETS.clouds.forEach(f => files.add(f));
        // World-specific boss sprites
        WORLDS.forEach(w => { if (w.bossSprite) files.add(w.bossSprite); });

        await this.assets.load([...files]);
        document.getElementById('loading').style.display = 'none';

        // Load BGM music files (non-blocking, falls back to procedural)
        this.audio.init();
        this.audio.loadBGM().catch(() => {});

        this.bg = new Background(this.assets);
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input.onTap((x, y) => {
            this.audio.init();
            this.audio.resume();
            // Restart title BGM on first tap if on menu
            if (this.state === 'menu' && !this._titleMusicResumed) {
                this.audio.startTitleBGM();
                this._applyVolumes();
                this._titleMusicResumed = true;
            }
            if (this.state === 'menu') {
                // Tap on menu items
                const menuOpts = [{y: 360, action: 0}, {y: 396, action: 1}, {y: 432, action: 2}, {y: 468, action: 3}];
                for (const opt of menuOpts) {
                    if (y > opt.y - 18 && y < opt.y + 18) {
                        this.menuCursor = opt.action;
                        if (opt.action === 0) {
                            this.state = 'levelselect';
                            this.menuCursor = 0;
                            this._levelSelectInit = true;
                            this.frame = 0;
                        } else if (opt.action === 1) {
                            this.state = 'gallery';
                            this.galleryCursor = 0;
                            this.frame = 0;
                        } else if (opt.action === 2) {
                            this.state = 'options';
                            this.optionsCursor = 0;
                            this.frame = 0;
                        } else if (opt.action === 3) {
                            this.state = 'credits';
                            this.frame = 0;
                        }
                        return;
                    }
                }
            } else if (this.state === 'options') {
                // Touch volume sliders or BACK
                const optStartY = 220;
                const optSpacing = 80;
                // Music slider: y~232-244, SFX slider: y~312-324
                for (let oi = 0; oi < 2; oi++) {
                    const barY = optStartY + oi * optSpacing + 12;
                    if (y > barY - 5 && y < barY + 17) {
                        const barX = GAME_W / 2 - 90;
                        const pct = Math.max(0, Math.min(1, (x - barX) / 180));
                        if (oi === 0) this.settings.musicVol = Math.round(pct * 10) / 10;
                        else this.settings.sfxVol = Math.round(pct * 10) / 10;
                        this._applyVolumes();
                        return;
                    }
                }
                // BACK button area (y~380)
                const backY = optStartY + 2 * optSpacing;
                if (y > backY - 15 && y < backY + 25) {
                    this._saveSettings();
                    this.state = 'menu';
                    this.menuCursor = 1;
                    this.frame = 0;
                }
            } else if (this.state === 'gallery') {
                // Navigate worlds with left/right arrows or tap
                const arrowY = GAME_H / 2;
                if (x < 50 && y > arrowY - 80 && y < arrowY + 80) {
                    // Left arrow
                    this.galleryCursor = (this.galleryCursor - 1 + WORLDS.length) % WORLDS.length;
                } else if (x > GAME_W - 50 && y > arrowY - 80 && y < arrowY + 80) {
                    // Right arrow
                    this.galleryCursor = (this.galleryCursor + 1) % WORLDS.length;
                }
                // BACK button
                if (y > GAME_H - 65 && y < GAME_H - 25) {
                    this.state = 'menu';
                    this.menuCursor = 1;
                    this.frame = 0;
                }
            } else if (this.state === 'credits') {
                // BACK button at bottom
                const backY = GAME_H - 55;
                if (y > backY - 18 && y < backY + 18) {
                    this.state = 'menu';
                    this.menuCursor = 2;
                    this.frame = 0;
                }
            } else if (this.state === 'levelselect') {
                // Tap on world options
                for (let i = 0; i < WORLDS.length; i++) {
                    const optY = 220 + i * 55;
                    if (y > optY - 22 && y < optY + 22) {
                        this.menuCursor = i;
                        this.startGame(i);
                        return;
                    }
                }
                // Difficulty selector at y~500
                const diffY = 500;
                if (y > diffY - 18 && y < diffY + 18) {
                    // Left half = prev, right half = next
                    if (x < GAME_W / 2) {
                        this.settings.difficulty = (this.settings.difficulty - 1 + 3) % 3;
                    } else {
                        this.settings.difficulty = (this.settings.difficulty + 1) % 3;
                    }
                    this._saveSettings();
                    return;
                }
                // BACK button at y~575
                if (y > 555 && y < 595) {
                    this.state = 'menu';
                    this.menuCursor = 0;
                    this.frame = 0;
                    return;
                }
            } else if (this.state === 'gameover' && this.frame > 60) {
                this.state = 'menu';
                this.menuCursor = 0;
                this.frame = 0;
            } else if (this.state === 'stageclear' && this.frame > 90) {
                // Simulate confirm for touch
                this._touchConfirm = true;
            } else if (this.state === 'victory' && this.frame > 120) {
                this.state = 'menu';
                this.menuCursor = 0;
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
                    this.menuCursor = 0;
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
        this._titleMusicPlaying = false;
        this._titleMusicResumed = true; // context already active from gameplay
        this.loop();
    }

    _loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('axeluga_settings') || '{}');
            this.settings = {
                musicVol: s.musicVol !== undefined ? s.musicVol : 0.7,
                sfxVol: s.sfxVol !== undefined ? s.sfxVol : 0.8,
                difficulty: s.difficulty !== undefined ? s.difficulty : 1, // 0=easy, 1=medium, 2=hard
            };
        } catch (e) {
            this.settings = { musicVol: 0.7, sfxVol: 0.8, difficulty: 1 };
        }
    }

    _saveSettings() {
        try {
            localStorage.setItem('axeluga_settings', JSON.stringify(this.settings));
        } catch (e) {}
    }

    _applyVolumes() {
        if (!this.audio || !this.audio.ctx) return;
        // Master gain controls SFX; BGM has its own gain
        if (this.audio.masterGain) {
            this.audio.masterGain.gain.value = this.settings.sfxVol * 0.3;
        }
        if (this.audio.bgmPlayer && this.audio.bgmPlayer.gainNode) {
            this.audio.bgmPlayer.gainNode.gain.setValueAtTime(
                this.settings.musicVol * 0.7, this.audio.ctx.currentTime
            );
        }
        // Procedural BGM gain
        if (this.audio.bgm && this.audio.bgm.bgmGain) {
            this.audio.bgm.bgmGain.gain.setValueAtTime(
                this.settings.musicVol * 0.5, this.audio.ctx.currentTime
            );
        }
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

        // Show side panels on desktop when there's enough space
        const panelL = document.getElementById('panel-left');
        const panelR = document.getElementById('panel-right');
        if (panelL && panelR) {
            const sideSpace = (w - cw) / 2;
            if (sideSpace > 180) {
                panelL.style.display = 'flex';
                panelR.style.display = 'flex';
                panelL.style.width = Math.min(240, sideSpace - 10) + 'px';
                panelR.style.width = Math.min(240, sideSpace - 10) + 'px';
            } else {
                panelL.style.display = 'none';
                panelR.style.display = 'none';
            }
        }
    }

    startGame(startWorld = 0) {
        this._titleMusicPlaying = false;
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
            this._skipNextTransitionCheck = true; // don't trigger transition on first nextWave
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

        // Debug mode: start with max powerups when selecting level > 1
        if (startWorld > 0) {
            this.player.weaponLevel = 5;
            this.player.hp = PLAYER_MAX_HP;
            this.player.maxHp = PLAYER_MAX_HP;
            this.player.speedLevel = 3;
            this.player.speed = PLAYER_SPEED + 3 * 0.4;
            this.player.shield = 600;   // 10 seconds of shield
            this.player.invuln = 180;
        }

        this.audio.init();
        this._applyVolumes();
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

        // Boss scroll control: pause bg when boss is settled in position
        if (this.bossActive && this.enemies.some(e => e.isBoss && e.y >= 75)) {
            this.bg.scrollPaused = true;
        } else {
            this.bg.scrollPaused = false;
        }

        this.bg.update();
        this.particles.update();
        this.shake.update();

        // Flash fade (must run in ALL states, not just playing)
        if (this.flashAlpha > 0) this.flashAlpha -= 0.05;

        // Edge-detected input helpers
        const gpTap = this.input.gpButtons.tap && !this._gpTapPrev;
        const gpUp = (this.input.gpAxes.y < -0.5) && !this._gpUpPrev;
        const gpDown = (this.input.gpAxes.y > 0.5) && !this._gpDownPrev;
        const kUp = (this.input.keys['ArrowUp'] || this.input.keys['KeyW']) && !this._kUpPrev;
        const kDown = (this.input.keys['ArrowDown'] || this.input.keys['KeyS']) && !this._kDownPrev;
        const kConfirm = (this.input.keys['Enter'] || this.input.keys['Space']) && !this._kConfirmPrev;
        const navUp = gpUp || kUp;
        const navDown = gpDown || kDown;
        const confirm = gpTap || kConfirm || this._touchConfirm;
        this._touchConfirm = false; // reset touch confirm each frame

        if (this.state === 'menu') {
            this.flashAlpha = 0; // clear any lingering flash
            // Start title music — needs user gesture to actually play
            if (!this._titleMusicPlaying) {
                this.audio.init();
                this.audio.startTitleBGM();
                this._titleMusicPlaying = true;
                // Only need resume-restart if context is still suspended
                this._titleMusicResumed = !!(this.audio.ctx && this.audio.ctx.state === 'running');
            }
            // On first user interaction, resume context and restart title BGM
            if (!this._titleMusicResumed && (confirm || navUp || navDown)) {
                this.audio.init();
                this.audio.resume();
                // Small delay to let context activate, then restart
                setTimeout(() => {
                    if (this.state === 'menu' || this.state === 'levelselect') {
                        this.audio.startTitleBGM();
                        this._applyVolumes();
                    }
                }, 50);
                this._titleMusicResumed = true;
            }
            const menuItems = 4; // START, GALLERY, OPTIONS, CREDITS
            if (navUp) this.menuCursor = (this.menuCursor - 1 + menuItems) % menuItems;
            if (navDown) this.menuCursor = (this.menuCursor + 1) % menuItems;
            if (confirm) {
                this.audio.init();
                this.audio.resume();
                if (this.menuCursor === 0) {
                    // START → level select
                    this.state = 'levelselect';
                    this.menuCursor = 0;
                    this._levelSelectInit = true;
                    this.frame = 0;
                } else if (this.menuCursor === 1) {
                    // GALLERY
                    this.state = 'gallery';
                    this.galleryCursor = 0;
                    this.frame = 0;
                } else if (this.menuCursor === 2) {
                    // OPTIONS
                    this.state = 'options';
                    this.optionsCursor = 0;
                    this.frame = 0;
                } else if (this.menuCursor === 3) {
                    // CREDITS
                    this.state = 'credits';
                    this.frame = 0;
                }
            }
        } else if (this.state === 'options') {
            const optItems = 3; // Music, SFX, Gamepad (display only)
            if (navUp) this.optionsCursor = (this.optionsCursor - 1 + optItems) % optItems;
            if (navDown) this.optionsCursor = (this.optionsCursor + 1) % optItems;
            // Left/right to adjust volumes
            const kLeft = this.input.keys['ArrowLeft'] || this.input.keys['KeyA'];
            const kRight = this.input.keys['ArrowRight'] || this.input.keys['KeyD'];
            const gpLeft = this.input.gpAxes.x < -0.5;
            const gpRight = this.input.gpAxes.x > 0.5;
            const left = (kLeft && !this._kLeftPrev) || (gpLeft && !this._gpLeftPrev);
            const right = (kRight && !this._kRightPrev) || (gpRight && !this._gpRightPrev);
            if (this.optionsCursor === 0) { // Music
                if (left) this.settings.musicVol = Math.max(0, this.settings.musicVol - 0.1);
                if (right) this.settings.musicVol = Math.min(1, this.settings.musicVol + 0.1);
                if (left || right) this._applyVolumes();
            } else if (this.optionsCursor === 1) { // SFX
                if (left) this.settings.sfxVol = Math.max(0, this.settings.sfxVol - 0.1);
                if (right) this.settings.sfxVol = Math.min(1, this.settings.sfxVol + 0.1);
                if (left || right) this._applyVolumes();
            }
            // ESC / Confirm on back
            if (this.input.keys['Escape'] && !this._escPrev) {
                this._saveSettings();
                this.state = 'menu';
                this.menuCursor = 1;
                this.frame = 0;
            }
            if (confirm && this.optionsCursor === 2) {
                // "BACK" option
                this._saveSettings();
                this.state = 'menu';
                this.menuCursor = 1;
                this.frame = 0;
            }
            this._kLeftPrev = kLeft;
            this._kRightPrev = kRight;
            this._gpLeftPrev = gpLeft;
            this._gpRightPrev = gpRight;
        } else if (this.state === 'gallery') {
            const kLeft = this.input.keys['ArrowLeft'] || this.input.keys['KeyA'];
            const kRight = this.input.keys['ArrowRight'] || this.input.keys['KeyD'];
            const gpL = this.input.gpAxes.x < -0.5;
            const gpR = this.input.gpAxes.x > 0.5;
            if ((kLeft && !this._galLPrev) || (gpL && !this._galGpLPrev)) {
                this.galleryCursor = (this.galleryCursor - 1 + WORLDS.length) % WORLDS.length;
            }
            if ((kRight && !this._galRPrev) || (gpR && !this._galGpRPrev)) {
                this.galleryCursor = (this.galleryCursor + 1) % WORLDS.length;
            }
            if (navUp) this.galleryCursor = (this.galleryCursor - 1 + WORLDS.length) % WORLDS.length;
            if (navDown) this.galleryCursor = (this.galleryCursor + 1) % WORLDS.length;
            this._galLPrev = kLeft; this._galRPrev = kRight;
            this._galGpLPrev = gpL; this._galGpRPrev = gpR;
            if (confirm || (this.input.keys['Escape'] && !this._escPrev)) {
                this.state = 'menu';
                this.menuCursor = 1;
                this.frame = 0;
            }
        } else if (this.state === 'credits') {
            if (confirm || (this.input.keys['Escape'] && !this._escPrev)) {
                this.state = 'menu';
                this.menuCursor = 3;
                this.frame = 0;
            }
        } else if (this.state === 'levelselect') {
            const totalItems = WORLDS.length + 2; // worlds + difficulty + BACK
            const prevCursor = this.menuCursor;
            if (navUp) this.menuCursor = (this.menuCursor - 1 + totalItems) % totalItems;
            if (navDown) this.menuCursor = (this.menuCursor + 1) % totalItems;
            
            // Difficulty row: left/right to cycle
            const diffRow = WORLDS.length; // index of difficulty row
            if (this.menuCursor === diffRow) {
                const kLeft = this.input.keys['ArrowLeft'] || this.input.keys['KeyA'];
                const kRight = this.input.keys['ArrowRight'] || this.input.keys['KeyD'];
                const gpLeft = this.input.gpAxes.x < -0.5;
                const gpRight = this.input.gpAxes.x > 0.5;
                const left = (kLeft && !this._kLeftPrev) || (gpLeft && !this._gpLeftPrev);
                const right = (kRight && !this._kRightPrev) || (gpRight && !this._gpRightPrev);
                if (left) this.settings.difficulty = (this.settings.difficulty - 1 + 3) % 3;
                if (right) this.settings.difficulty = (this.settings.difficulty + 1) % 3;
                if (left || right) this._saveSettings();
                this._kLeftPrev = kLeft; this._kRightPrev = kRight;
                this._gpLeftPrev = gpLeft; this._gpRightPrev = gpRight;
            }
            
            if (confirm) {
                if (this.menuCursor < WORLDS.length) {
                    this.startGame(this.menuCursor);
                } else if (this.menuCursor === diffRow) {
                    // Confirm on difficulty cycles it too
                    this.settings.difficulty = (this.settings.difficulty + 1) % 3;
                    this._saveSettings();
                } else {
                    // BACK
                    this.state = 'menu';
                    this.menuCursor = 0;
                    this.frame = 0;
                }
            }
            // Preview background (only update on cursor change, only for world items)
            if (this.menuCursor !== prevCursor || this._levelSelectInit) {
                const worldIdx = Math.min(this.menuCursor, WORLDS.length - 1);
                this.bg.setWorld(WORLDS[worldIdx]);
                this._levelSelectInit = false;
            }
            // ESC back to menu
            if (this.input.keys['Escape'] && !this._escPrev) {
                this.state = 'menu';
                this.menuCursor = 0;
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
                    this.menuCursor = 0;
                    this.frame = 0;
                }
            }
        } else if (this.state === 'gameover') {
            if (this.frame > 60 && confirm) {
                this.state = 'menu';
                this.menuCursor = 0;
                this.frame = 0;
            }
        } else if (this.state === 'stageclear') {
            // Stage clear: show results, wait for confirm to trigger transition
            this.updateExplosions();
            // Update floating texts
            for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
                const ft = this.floatingTexts[i];
                ft.y -= ft.vy;
                ft.life--;
                if (ft.life <= 0) this.floatingTexts.splice(i, 1);
            }
            if (this.frame > 90 && confirm) {
                this.state = 'playing';
                this.frame = 0;
                // Now start the actual world transition
                this.worldTransition = {
                    phase: 0,
                    timer: 0,
                    fromWorld: this.stageClearWorld,
                    toWorld: this.stageClearWorld + 1,
                    speedLines: [],
                };
                for (let i = 0; i < 30; i++) {
                    this.worldTransition.speedLines.push({
                        x: Math.random() * GAME_W,
                        y: Math.random() * GAME_H,
                        len: 30 + Math.random() * 80,
                        speed: 8 + Math.random() * 12,
                        alpha: 0.3 + Math.random() * 0.7,
                    });
                }
                this.waveTimer = 999;
                this._playTransitionSound();
            }
        } else if (this.state === 'victory') {
            // Victory: wait for confirm to return to menu
            if (this.frame > 120 && confirm) {
                this.state = 'menu';
                this.menuCursor = 0;
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
            // Higher weapon = more bullets, so slightly slower fire rate to balance
            p.fireTimer = PLAYER_FIRE_RATE + Math.floor((p.weaponLevel - 1) * 0.8);
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
        const localWv = ((this.wave) % WAVE_CONFIG.bossEvery) + 1;
        const asteroidChance = localWv <= 2 ? 0.005 : WAVE_CONFIG.asteroidChance;
        if (Math.random() < asteroidChance) this.spawnAsteroid();
        if (localWv > 3 && Math.random() < WAVE_CONFIG.mineChance) this.spawnMine();

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
        // Sprite mapping: lvl 1-2=pink(1), lvl 3=green(2), lvl 4-5=yellow(3)
        const sprLvl = lvl <= 2 ? 1 : lvl <= 3 ? 2 : 3;

        // LVL 1+: Center shot (main damage dealer)
        this.playerBullets.push({
            x: p.x, y: p.y - p.h / 2,
            vx: 0, vy: -PLAYER_BULLET_SPEED,
            w: 6, h: 14, damage: 1, type: 0, wpnLevel: sprLvl,
        });

        // LVL 2+: Tight side shots (smaller, support fire)
        if (lvl >= 2) {
            this.playerBullets.push({
                x: p.x - 10, y: p.y - p.h / 2 + 8,
                vx: -0.3, vy: -PLAYER_BULLET_SPEED * 0.9,
                w: 4, h: 10, damage: 1, type: 0, wpnLevel: sprLvl,
            });
            this.playerBullets.push({
                x: p.x + 10, y: p.y - p.h / 2 + 8,
                vx: 0.3, vy: -PLAYER_BULLET_SPEED * 0.9,
                w: 4, h: 10, damage: 1, type: 0, wpnLevel: sprLvl,
            });
        }

        // LVL 3+: Angled spread (wider coverage)
        if (lvl >= 3) {
            this.playerBullets.push({
                x: p.x - 8, y: p.y - p.h / 2 + 2,
                vx: -1.8, vy: -PLAYER_BULLET_SPEED * 0.85,
                w: 4, h: 10, damage: 1, type: 1, wpnLevel: sprLvl,
            });
            this.playerBullets.push({
                x: p.x + 8, y: p.y - p.h / 2 + 2,
                vx: 1.8, vy: -PLAYER_BULLET_SPEED * 0.85,
                w: 4, h: 10, damage: 1, type: 1, wpnLevel: sprLvl,
            });
        }

        // LVL 4+: Wide angle (area coverage)
        if (lvl >= 4) {
            this.playerBullets.push({
                x: p.x - 14, y: p.y,
                vx: -3.0, vy: -PLAYER_BULLET_SPEED * 0.6,
                w: 3, h: 8, damage: 1, type: 1, wpnLevel: sprLvl,
            });
            this.playerBullets.push({
                x: p.x + 14, y: p.y,
                vx: 3.0, vy: -PLAYER_BULLET_SPEED * 0.6,
                w: 3, h: 8, damage: 1, type: 1, wpnLevel: sprLvl,
            });
        }

        // LVL 5: Rear guard (diagonal backward)
        if (lvl >= 5) {
            this.playerBullets.push({
                x: p.x - 12, y: p.y + p.h / 4,
                vx: -3.2, vy: -PLAYER_BULLET_SPEED * 0.35,
                w: 3, h: 8, damage: 1, type: 1, wpnLevel: sprLvl,
            });
            this.playerBullets.push({
                x: p.x + 12, y: p.y + p.h / 4,
                vx: 3.2, vy: -PLAYER_BULLET_SPEED * 0.35,
                w: 3, h: 8, damage: 1, type: 1, wpnLevel: sprLvl,
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
        const hpRatio = e.hp / e.maxHp;
        const rage = hpRatio <= 0.25;
        const enraged = hpRatio <= 0.5; // Phase 2: half HP gone
        const w = e.bossWorld || 0;
        
        // Entry: descend into position
        if (e.y < 80) {
            e.y += 0.5;
            return;
        }
        
        // ── Phase 3: Rage (≤25% HP) — same for all bosses, fast erratic ──
        if (rage) {
            e.x += Math.sin(e.moveT * 0.03) * 2.5 + Math.cos(e.moveT * 0.07) * 1.2;
            e.y = 80 + Math.sin(e.moveT * 0.025) * 35;
            e.x = Math.max(e.w, Math.min(GAME_W - e.w, e.x));
            return;
        }
        
        // ── Phase 1 & 2: World-specific patterns ──
        switch (w) {
            case 0: // DEEP SPACE — gentle sweep → tight figure-8
                if (enraged) {
                    const t = e.moveT * 0.035;
                    e.x = GAME_W / 2 + Math.sin(t) * (GAME_W * 0.35);
                    e.y = 80 + Math.sin(t * 2) * 35;
                } else {
                    e.x += Math.sin(e.moveT * 0.015) * 1.5;
                    e.y = 80 + Math.sin(e.moveT * 0.01) * 20;
                }
                break;
                
            case 1: // STATION APPROACH — pendulum → teleport-dash stops
                if (enraged) {
                    const cycle = e.moveT % 150;
                    if (cycle < 100) {
                        // Fast pendulum with changing amplitude
                        const amp = GAME_W * 0.38;
                        e.x = GAME_W / 2 + Math.sin(e.moveT * 0.04) * amp;
                        e.y = 75 + Math.sin(e.moveT * 0.02) * 25;
                    } else {
                        // Snap toward player X position
                        const dx = this.player.x - e.x;
                        e.x += dx * 0.08;
                        e.y = 70 + Math.sin(e.moveT * 0.06) * 15;
                    }
                } else {
                    // Slow pendulum
                    e.x = GAME_W / 2 + Math.sin(e.moveT * 0.012) * (GAME_W * 0.3);
                    e.y = 80 + Math.sin(e.moveT * 0.008) * 15;
                }
                break;
                
            case 2: // STATION CORE — circular orbit → spiral dive rushes
                if (enraged) {
                    const cycle = e.moveT % 200;
                    if (cycle < 140) {
                        // Tight orbit, closer to player
                        const radius = 60 + Math.sin(e.moveT * 0.015) * 30;
                        e.x = GAME_W / 2 + Math.cos(e.moveT * 0.035) * radius;
                        e.y = 100 + Math.sin(e.moveT * 0.035) * 50;
                    } else {
                        // Rush downward then retreat
                        const rushT = cycle - 140;
                        if (rushT < 30) {
                            e.y += 2.5;
                            e.x += (this.player.x > e.x ? 1.5 : -1.5);
                        } else {
                            e.y -= 1.8;
                        }
                    }
                    e.y = Math.max(50, Math.min(220, e.y));
                } else {
                    // Circular orbit
                    e.x = GAME_W / 2 + Math.cos(e.moveT * 0.02) * (GAME_W * 0.25);
                    e.y = 90 + Math.sin(e.moveT * 0.02) * 30;
                }
                break;
                
            case 3: // ATMOSPHERE — slow drift → diagonal charge pattern
                if (enraged) {
                    const cycle = e.moveT % 180;
                    if (cycle < 120) {
                        // Wide horizontal sweeps with vertical bob
                        e.x += Math.sin(e.moveT * 0.028) * 2.5;
                        e.y = 80 + Math.sin(e.moveT * 0.02) * 40 + Math.cos(e.moveT * 0.04) * 15;
                    } else {
                        // Diagonal charge toward player
                        const dx = this.player.x - e.x;
                        const dy = Math.min(this.player.y - 60, 180) - e.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        e.x += (dx / dist) * 2.2;
                        e.y += (dy / dist) * 0.8;
                    }
                    e.y = Math.max(50, Math.min(200, e.y));
                } else {
                    // Gentle vertical drift + horizontal sway
                    e.x += Math.sin(e.moveT * 0.018) * 1.2;
                    e.y = 85 + Math.sin(e.moveT * 0.012) * 25 + Math.cos(e.moveT * 0.025) * 10;
                }
                break;
                
            case 4: // CITY ASSAULT — wide sine → aggressive chase + strafing
            default:
                if (enraged) {
                    // Chase player X with strafing runs
                    const dx = this.player.x - e.x;
                    e.x += Math.sign(dx) * Math.min(2.5, Math.abs(dx) * 0.04);
                    e.x += Math.sin(e.moveT * 0.06) * 1.5; // jitter
                    e.y = 75 + Math.sin(e.moveT * 0.025) * 35 + Math.cos(e.moveT * 0.05) * 15;
                    // Occasional rapid sweep
                    if (e.moveT % 200 > 160) {
                        e.x += Math.sin(e.moveT * 0.08) * 4;
                    }
                } else {
                    // Wide sine wave
                    e.x = GAME_W / 2 + Math.sin(e.moveT * 0.014) * (GAME_W * 0.35);
                    e.y = 80 + Math.sin(e.moveT * 0.009) * 20;
                }
                break;
        }
        
        // Clamp position
        e.x = Math.max(e.w, Math.min(GAME_W - e.w, e.x));
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
        // Difficulty scaling
        bulletSpeed *= (DIFFICULTY[this.settings.difficulty] || DIFFICULTY[1]).bulletSpeedMult;

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
        } else if (Math.random() < 0.10 * (DIFFICULTY[this.settings.difficulty] || DIFFICULTY[1]).dropMult) {
            // Regular enemies: base 10% drop chance, scaled by difficulty
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
            if (this._skipNextTransitionCheck) {
                this._skipNextTransitionCheck = false;
            } else if (this.world === WORLDS.length - 1) {
                // ── FINAL BOSS DEFEATED → VICTORY! ──
                this.audio.stopBGM();
                if (this.score > this.highScore) {
                    this.highScore = this.score;
                    localStorage.setItem('axeluga_hi', this.highScore.toString());
                }
                // Bonus for final world
                const bonus = (this.world + 1) * 10000;
                this.score += bonus;
                this.spawnFloatingText(GAME_W / 2, GAME_H / 2, `+${bonus}`);
                this.state = 'victory';
                this.frame = 0;
                this._playTransitionSound();
                return; // don't spawn more waves
            } else if (!this.worldTransition) {
                // ── WORLD BOSS DEFEATED → STAGE CLEAR ──
                this.audio.stopBGM();
                // Score bonus for completing world
                const bonus = (this.world + 1) * 5000;
                this.score += bonus;
                this.spawnFloatingText(GAME_W / 2, GAME_H / 2, `+${bonus}`);
                this._playTransitionSound();
                this.stageClearWorld = this.world;
                this.state = 'stageclear';
                this.frame = 0;
                this.waveTimer = 999;
                return; // don't spawn next wave until player confirms
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
        // Use wave-within-world for difficulty progression (1-10 per world)
        const lw = ((this.wave) % WAVE_CONFIG.bossEvery) + 1;

        // Number of formations increases with local wave AND world
        let numFormations;
        if (lw <= 2) numFormations = 1 + Math.min(w, 1);
        else if (lw <= 4) numFormations = 2 + Math.min(w, 1);
        else if (lw <= 7) numFormations = 3 + Math.min(w, 2);
        else numFormations = Math.min(6, 3 + Math.floor(w / 2));
        // Difficulty: scale formation count
        const diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY[1];
        numFormations = Math.max(1, Math.round(numFormations * diff.formMult));

        // Available formation shapes — unlock faster in later worlds
        const easyShapes = ['hline', 'vline', 'diagonal'];
        const medShapes = ['hline', 'vline', 'diagonal', 'vee', 'spread'];
        const hardShapes = ['hline', 'vline', 'diagonal', 'vee', 'spread', 'pincer', 'cross', 'swarm'];

        let shapes;
        if (w >= 2) shapes = medShapes; // medium from world 3+, hard unlocks later
        else if (lw <= 2) shapes = easyShapes;
        else if (lw <= 5) shapes = medShapes;
        else shapes = hardShapes;
        if (w >= 2 && lw > 4) shapes = hardShapes; // all shapes mid-world 3+

        // Available enemy types — unlock faster in later worlds
        const types = Object.keys(ENEMY_DEFS);
        let maxType;
        if (w >= 2) maxType = Math.min(types.length, 2 + Math.floor(lw / 3)); // gradual in world 3+
        else if (lw <= 2) maxType = 1;
        else if (lw <= 4) maxType = 2;
        else if (lw <= 6) maxType = 3;
        else maxType = types.length;

        for (let i = 0; i < numFormations; i++) {
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const typeKey = types[Math.floor(Math.random() * maxType)];

            // Formation size varies — bigger in later worlds
            let size;
            if (lw <= 2) size = 3 + Math.min(w, 2);
            else if (lw <= 4) size = 3 + Math.floor(Math.random() * 2) + Math.min(w, 2);
            else size = 3 + Math.floor(Math.random() * 3) + Math.min(w, 2);
            size = Math.min(size, 8); // cap

            // Movement patterns — more aggressive in later worlds
            const movePatterns = ['straight', 'zigzag', 'sinewave'];
            if (lw > 3 || w >= 1) movePatterns.push('swoop', 'diagonal');
            if (lw > 5 || w >= 2) movePatterns.push('divebomb', 'circle');
            const pattern = movePatterns[Math.floor(Math.random() * movePatterns.length)];

            this.formationQueue.push({ shape, typeKey, size, pattern });
        }
    }

    spawnFormation(f) {
        const def = ENEMY_DEFS[f.typeKey];
        const phase = Math.random() * Math.PI * 2;
        const swoopDir = Math.random() < 0.5 ? -1 : 1;

        const positions = this.getFormationPositions(f.shape, f.size);

        // Shoot rate based on wave-within-world + world scaling
        // Use local wave (1-10) not global wave to keep difficulty fair per world
        const localWave = ((this.wave) % WAVE_CONFIG.bossEvery) + 1;
        const diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY[1];
        let shootRate = 0;
        if (def.shootRate > 0) {
            const worldBoost = this.world * 2; // gentle world scaling
            if (localWave <= 3 && this.world === 0) shootRate = 0;
            else if (localWave <= 4) shootRate = Math.max(160, def.shootRate + 60 - worldBoost);
            else if (localWave <= 7) shootRate = Math.max(110, def.shootRate + 20 - worldBoost);
            else shootRate = Math.max(70, def.shootRate - localWave - worldBoost);
            // Apply difficulty: higher shootMult = slower shooting (easier)
            shootRate = Math.round(shootRate * diff.shootMult);
        }

        const hpBonus = Math.round((Math.floor(localWave / 6) + Math.floor(this.world / 2)) * diff.hpMult);
        const speedBonus = (localWave * 0.015 + this.world * 0.06) * diff.speedMult;

        // Optionally use DyLESTorm sprites based on world config
        const worldDef = WORLDS[this.world % WORLDS.length];
        const useDylSprite = Math.random() < (worldDef.dylChance || 0);
        const dylSprite = useDylSprite
            ? DYL_ENEMIES[(this.world + Math.floor(Math.random() * DYL_ENEMIES.length)) % DYL_ENEMIES.length]
            : null;
        
        // Pixel Enemies sprites (PE pack)
        let peSprite = null;
        if (worldDef.peChance && Math.random() < worldDef.peChance) {
            // Use tougher sprites for heavier enemy types
            const isTough = (f.typeKey === 'heavy' || f.typeKey === 'elite');
            const poolName = isTough ? (worldDef.peTough || 'danger') : (worldDef.pePool || 'wings');
            const pool = PE_ENEMIES[poolName] || PE_ENEMIES.wings;
            peSprite = pool[Math.floor(Math.random() * pool.length)];
        }
        
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
                shootTimer: 120 + Math.floor(Math.random() * 120),
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
                peSprite,
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
        const diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY[1];
        // Scale boss HP per world
        const hpScale = w * 25; // +25 HP per world (was 15)
        const shootRateScale = w === 0 ? 50 : Math.max(28, 45 - w * 3);

        // World-specific boss color
        const bossColors = worldDef.bossColors || [0, 1];
        const bossColorRow = bossColors[bossNum % bossColors.length];

        // Boss size: PE bosses are larger (240px source)
        const bossSize = (worldDef.bossType === 'pe' || worldDef.bossType === 'pe_animated') ? 100 : BOSS_DEF.size * 2;

        const bossHp = Math.round((BOSS_DEF.hp + hpScale) * diff.hpMult);
        this.enemies.push({
            x: GAME_W / 2, y: -80,
            w: bossSize, h: bossSize,
            hp: bossHp,
            maxHp: bossHp,
            speed: BOSS_DEF.speed + w * 0.1,
            score: BOSS_DEF.score + (w + 1) * 3000,
            shootRate: Math.round(shootRateScale * diff.shootMult),
            shootTimer: 90,
            spriteType: 0,
            colorRow: bossColorRow,
            pattern: 'boss',
            moveT: 0,
            flashTimer: 0,
            isBoss: true,
            bossWorld: w, // track which world for unique movement
        });
    }

    spawnMiniBoss() {
        const w = this.world;
        const worldDef = WORLDS[w % WORLDS.length];
        const mbIdx = worldDef.miniBossIdx || 0;
        const def = MINI_BOSS_DEFS[mbIdx];
        const diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY[1];

        const mbHp = Math.round((def.hp + w * 8) * diff.hpMult);
        this.enemies.push({
            x: GAME_W / 2,
            y: -100,
            w: def.w, h: def.h,
            hp: mbHp,
            maxHp: mbHp,
            speed: def.speed + w * 0.08,
            score: def.score + w * 500,
            shootRate: Math.round(Math.max(20, def.shootRate - w * 3) * diff.shootMult),
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
                p.weaponLevel = Math.min(5, p.weaponLevel + 1);
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
        } else if (this.state === 'options') {
            this.drawOptions(ctx);
        } else if (this.state === 'credits') {
            this.drawCredits(ctx);
        } else if (this.state === 'levelselect') {
            this.drawLevelSelect(ctx);
        } else if (this.state === 'playing' || this.state === 'gameover' || this.state === 'paused') {
            this.drawGame(ctx);
            if (this.state === 'paused') {
                this.drawPaused(ctx);
            }
        } else if (this.state === 'stageclear') {
            this.drawGame(ctx);
            this.drawStageClear(ctx);
        } else if (this.state === 'victory') {
            this.drawGame(ctx);
            this.drawVictory(ctx);
        }

        ctx.restore();

        // Flash overlay (no shake)
        if (this.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255,255,255,${this.flashAlpha})`;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        }

        // Update side panels (throttled to every 6 frames for perf)
        if (this.frame % 6 === 0) this.updateSidePanels();
    }

    updateSidePanels() {
        const panelL = document.getElementById('panel-left');
        if (!panelL || panelL.style.display === 'none') return;

        const isPlaying = this.state === 'playing' || this.state === 'stageclear' || this.state === 'victory';
        const p = this.player;

        // Left panel: World + wave progress
        const plWorld = document.getElementById('pl-world');
        if (plWorld) {
            if (isPlaying) {
                const wd = WORLDS[this.world % WORLDS.length];
                plWorld.textContent = wd.name;
            } else {
                plWorld.textContent = '—';
            }
        }

        // Wave dots
        const plWaves = document.getElementById('pl-waves');
        if (plWaves && isPlaying) {
            const bossEvery = WAVE_CONFIG.bossEvery;
            const waveInWorld = ((this.wave - 1) % bossEvery) + 1;
            let html = '';
            for (let i = 1; i <= bossEvery; i++) {
                const isBoss = i === bossEvery;
                let cls = 'wave-dot';
                if (isBoss) cls += ' boss';
                if (i < waveInWorld) cls += ' done';
                else if (i === waveInWorld) cls += ' current';
                html += `<div class="${cls}"></div>`;
            }
            if (plWaves.innerHTML !== html) plWaves.innerHTML = html;
        }

        // Right panel: Score
        const prScore = document.getElementById('pr-score');
        if (prScore) prScore.textContent = isPlaying ? this.score.toLocaleString() : '0';

        const prHi = document.getElementById('pr-hiscore');
        if (prHi) prHi.textContent = this.highScore.toLocaleString();

        // HP hearts
        const prHp = document.getElementById('pr-hp');
        if (prHp && isPlaying) {
            const hearts = prHp.querySelectorAll('.hp-heart');
            hearts.forEach((h, i) => {
                h.classList.toggle('active', i < p.hp);
            });
        }

        // Weapon level
        const prWpn = document.getElementById('pr-wpn');
        if (prWpn) prWpn.textContent = isPlaying ? `LVL ${p.weaponLevel}` : 'LVL 1';
        const prBars = document.getElementById('pr-wpnbars');
        if (prBars) {
            const bars = prBars.querySelectorAll('.wpn-bar');
            bars.forEach((b, i) => {
                b.classList.toggle('active', isPlaying && i < p.weaponLevel);
            });
        }

        // Combo
        const prCombo = document.getElementById('pr-combo');
        if (prCombo) {
            if (isPlaying && this.combo > 1) {
                prCombo.textContent = `×${this.combo}`;
                prCombo.style.color = this.combo >= 10 ? '#f0f' : this.combo >= 5 ? '#f80' : '#ff8';
            } else {
                prCombo.textContent = '—';
                prCombo.style.color = '#f80';
            }
        }

        // Bomb
        const prBomb = document.getElementById('pr-bomb');
        if (prBomb) {
            if (isPlaying) {
                const pct = Math.floor(this.bombCharge / this.bombChargeMax * 100);
                prBomb.textContent = this.bombs > 0 ? `${this.bombs} READY` : `${pct}%`;
                prBomb.style.color = this.bombs > 0 ? '#ff0' : '#f80';
            } else {
                prBomb.textContent = '—';
            }
        }

        // Status
        const prStatus = document.getElementById('pr-status');
        if (prStatus) {
            if (this.state === 'menu' || this.state === 'levelselect') {
                prStatus.textContent = 'STANDBY';
                prStatus.style.color = '#0ff';
            } else if (this.state === 'gameover') {
                prStatus.textContent = 'DESTROYED';
                prStatus.style.color = '#f44';
            } else if (this.state === 'stageclear') {
                prStatus.textContent = 'STAGE CLEAR';
                prStatus.style.color = '#0f0';
            } else if (this.state === 'victory') {
                prStatus.textContent = 'VICTORY';
                prStatus.style.color = '#ff0';
            } else if (this.bossActive) {
                const boss = this.enemies.find(e => e.isBoss);
                if (boss && boss.hp / boss.maxHp <= 0.25) {
                    prStatus.textContent = '⚠ BOSS RAGE';
                    prStatus.style.color = '#f00';
                } else {
                    prStatus.textContent = '⚠ BOSS FIGHT';
                    prStatus.style.color = '#f80';
                }
            } else if (this.state === 'paused') {
                prStatus.textContent = 'PAUSED';
                prStatus.style.color = '#888';
            } else {
                prStatus.textContent = 'IN COMBAT';
                prStatus.style.color = '#0f0';
            }
        }
    }

    drawMenu(ctx) {
        // ── Dark overlay with gradient ──
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        grad.addColorStop(0, 'rgba(0,0,0,0.7)');
        grad.addColorStop(0.4, 'rgba(0,0,0,0.3)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.4)');
        grad.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        const cx = GAME_W / 2;

        // ── Animated scan lines (subtle) ──
        ctx.globalAlpha = 0.03;
        ctx.fillStyle = '#0ff';
        for (let y = 0; y < GAME_H; y += 3) {
            ctx.fillRect(0, y, GAME_W, 1);
        }
        ctx.globalAlpha = 1;

        // ── Logo image ──
        const logoImg = this.assets.get('logo.png');
        if (logoImg) {
            const logoW = 320;
            const logoH = logoW * (logoImg.naturalHeight / logoImg.naturalWidth);
            const logoX = (GAME_W - logoW) / 2;
            const logoY = 60;

            ctx.save();
            // Subtle pulse glow behind
            const glowAlpha = 0.15 + Math.sin(this.frame * 0.04) * 0.08;
            ctx.globalAlpha = glowAlpha;
            ctx.filter = 'blur(12px) brightness(2)';
            ctx.drawImage(logoImg, logoX - 5, logoY - 3, logoW + 10, logoH + 6);
            ctx.filter = 'none';

            // Main logo
            ctx.globalAlpha = 1;
            ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
            ctx.restore();
        }

        // Decorative line under logo
        const lineY = 260;
        const lineW = 120;
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - lineW, lineY); ctx.lineTo(cx + lineW, lineY);
        ctx.stroke();
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(cx - lineW + 15, lineY + 4); ctx.lineTo(cx + lineW - 15, lineY + 4);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Subtitle with typing effect
        const subText = 'V E R T I C A L   S H O O T E R';
        const chars = Math.min(subText.length, Math.floor(this.frame / 2));
        ctx.fillStyle = '#68a';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText(subText.substring(0, chars), cx, lineY + 18);

        // ── High score ──
        if (this.highScore > 0) {
            ctx.fillStyle = '#ff8';
            ctx.font = '11px "Courier New", monospace';
            ctx.globalAlpha = 0.8;
            ctx.fillText(`★ HIGH SCORE: ${this.highScore.toLocaleString()} ★`, cx, 300);
            ctx.globalAlpha = 1;
        }

        // ── Menu items ──
        const menuItems = ['START', 'GALLERY', 'OPTIONS', 'CREDITS'];
        const menuY = 360;
        const spacing = 36;

        for (let i = 0; i < menuItems.length; i++) {
            const y = menuY + i * spacing;
            const sel = this.menuCursor === i;
            const hover = sel ? Math.sin(this.frame * 0.1) * 0.15 + 0.85 : 0;

            if (sel) {
                // Selected item background
                ctx.fillStyle = `rgba(0, 200, 255, ${0.08 + hover * 0.05})`;
                ctx.fillRect(cx - 90, y - 14, 180, 24);

                // Left/right arrows
                ctx.fillStyle = '#0ff';
                ctx.font = '14px "Courier New", monospace';
                ctx.fillText('▸', cx - 80, y + 1);
                ctx.fillText('◂', cx + 80, y + 1);

                // Text
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 18px "Courier New", monospace';
                ctx.fillText(menuItems[i], cx, y + 4);
            } else {
                ctx.fillStyle = '#667';
                ctx.font = '16px "Courier New", monospace';
                ctx.fillText(menuItems[i], cx, y + 4);
            }
        }

        // ── Bottom info ──
        // Gamepad indicator
        if (this.input.gpConnected) {
            ctx.fillStyle = '#0a0';
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText('🎮 GAMEPAD CONNECTED', cx, 540);
        }

        // Controls hint
        ctx.fillStyle = '#445';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('↑↓ SELECT · ENTER TO CONFIRM', cx, GAME_H - 30);

        // Version / branding
        ctx.fillStyle = '#334';
        ctx.font = '8px "Courier New", monospace';
        ctx.fillText('PULSEGAMES.EU', cx, GAME_H - 12);
    }

    drawOptions(ctx) {
        // ── Dark overlay ──
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        const cx = GAME_W / 2;

        // Header
        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 26px "Courier New", monospace';
        ctx.fillText('OPTIONS', cx, 120);

        // Decorative line
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - 80, 130); ctx.lineTo(cx + 80, 130);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // ── Option items ──
        const items = [
            { label: 'MUSIC', value: this.settings.musicVol, color: '#4af' },
            { label: 'SFX', value: this.settings.sfxVol, color: '#f80' },
            { label: 'BACK', value: null, color: '#888' },
        ];

        const startY = 220;
        const spacing = 80;

        for (let i = 0; i < items.length; i++) {
            const y = startY + i * spacing;
            const sel = this.optionsCursor === i;
            const item = items[i];

            if (item.value !== null) {
                // Label
                ctx.fillStyle = sel ? '#fff' : '#888';
                ctx.font = `${sel ? 'bold ' : ''}14px "Courier New", monospace`;
                ctx.fillText(item.label, cx, y);

                // Volume bar
                const barW = 180;
                const barH = 12;
                const barX = cx - barW / 2;
                const barY = y + 12;

                // Background
                ctx.fillStyle = '#222';
                ctx.fillRect(barX, barY, barW, barH);

                // Fill
                ctx.fillStyle = sel ? item.color : '#555';
                ctx.fillRect(barX, barY, barW * item.value, barH);

                // Segments
                ctx.strokeStyle = '#111';
                ctx.lineWidth = 1;
                for (let s = 1; s < 10; s++) {
                    const sx = barX + (barW / 10) * s;
                    ctx.beginPath();
                    ctx.moveTo(sx, barY); ctx.lineTo(sx, barY + barH);
                    ctx.stroke();
                }

                // Border
                ctx.strokeStyle = sel ? item.color : '#444';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barW, barH);

                // Percentage
                ctx.fillStyle = sel ? '#fff' : '#666';
                ctx.font = '11px "Courier New", monospace';
                ctx.fillText(`${Math.round(item.value * 100)}%`, cx, barY + barH + 16);

                // Arrows if selected
                if (sel) {
                    ctx.fillStyle = '#0ff';
                    ctx.font = '16px "Courier New", monospace';
                    ctx.fillText('◂', barX - 16, barY + 10);
                    ctx.fillText('▸', barX + barW + 16, barY + 10);
                }
            } else {
                // BACK button
                if (sel) {
                    ctx.fillStyle = 'rgba(0, 200, 255, 0.1)';
                    ctx.fillRect(cx - 60, y - 12, 120, 28);
                    ctx.fillStyle = '#0ff';
                    ctx.font = 'bold 16px "Courier New", monospace';
                    ctx.fillText('▸ ' + item.label + ' ◂', cx, y + 6);
                } else {
                    ctx.fillStyle = '#666';
                    ctx.font = '14px "Courier New", monospace';
                    ctx.fillText(item.label, cx, y + 6);
                }
            }
        }

        // ── Gamepad debug info ──
        const gpY = 470;
        if (this.input.gpConnected && this.input.gpDebug) {
            const dbg = this.input.gpDebug;
            ctx.fillStyle = '#0f0';
            ctx.font = '10px "Courier New", monospace';
            ctx.fillText('🎮 GAMEPAD CONNECTED', cx, gpY);
            ctx.fillStyle = '#0a0';
            ctx.font = '8px "Courier New", monospace';
            const name = dbg.id.length > 38 ? dbg.id.substring(0, 38) + '…' : dbg.id;
            ctx.fillText(name, cx, gpY + 14);
            ctx.fillText(`mapping: ${dbg.mapping} | ${dbg.numButtons}btn ${dbg.numAxes}axes`, cx, gpY + 26);
            const axStr = `stick: ${dbg.axes[0]},${dbg.axes[1]}`;
            const btnStr = dbg.buttons.length > 0 ? `BTN: ${dbg.buttons.join(',')}` : '';
            ctx.fillStyle = '#ff0';
            ctx.font = '8px "Courier New", monospace';
            ctx.fillText(`${axStr} ${btnStr}`, cx, gpY + 38);
            if (dbg.mapping !== 'standard') {
                ctx.fillStyle = '#f80';
                ctx.fillText('TIP: Use X-input mode for best support', cx, gpY + 52);
            }
        } else {
            ctx.fillStyle = '#555';
            ctx.font = '10px "Courier New", monospace';
            ctx.fillText('No gamepad detected', cx, gpY);
            ctx.fillStyle = '#444';
            ctx.font = '8px "Courier New", monospace';
            ctx.fillText('Press a button on your controller', cx, gpY + 16);
        }

        // Footer
        ctx.fillStyle = '#445';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('←→ ADJUST · ↑↓ SELECT · ESC BACK', cx, GAME_H - 20);
    }

    drawCredits(ctx) {
        // ── Dark overlay ──
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        const cx = GAME_W / 2;

        // Header
        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 26px "Courier New", monospace';
        ctx.fillText('CREDITS', cx, 90);

        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - 70, 100); ctx.lineTo(cx + 70, 100);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // ── Sections ──
        let y = 150;
        const section = (title, lines, color) => {
            ctx.fillStyle = color;
            ctx.font = 'bold 12px "Courier New", monospace';
            ctx.fillText(title, cx, y);
            y += 4;
            ctx.font = '10px "Courier New", monospace';
            for (const line of lines) {
                y += 16;
                ctx.fillStyle = '#ccc';
                ctx.fillText(line, cx, y);
            }
            y += 28;
        };

        section('— GAME —', [
            'Martin Grahn',
            'SmartProc / PulseGames.eu',
        ], '#0ff');

        section('— PIXEL ART —', [
            'Timberlate007',
            'Space Background SHMUP Pack',
            '',
            'DyLEStorm',
            'Space Background Pack',
            'Player Bullets Pack',
        ], '#f80');

        section('— MUSIC —', [
            'Abstraction / Tallbeard Studios',
            'FREE Music Loop Bundle',
            'tallbeard.itch.io/music-loop-bundle',
        ], '#4af');

        section('— BUILT WITH —', [
            'HTML5 Canvas · Vanilla JavaScript',
            'Web Audio API',
        ], '#888');

        // ── BACK button ──
        const backY = GAME_H - 55;
        ctx.fillStyle = 'rgba(0, 200, 255, 0.1)';
        ctx.fillRect(cx - 60, backY - 14, 120, 28);
        const backPulse = 0.7 + Math.sin(this.frame * 0.06) * 0.3;
        ctx.fillStyle = `rgba(0, 255, 255, ${backPulse})`;
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.fillText('▸ BACK ◂', cx, backY + 4);

        ctx.fillStyle = '#334';
        ctx.font = '8px "Courier New", monospace';
        ctx.fillText('© 2025 PulseGames.eu', cx, GAME_H - 15);
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

        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(GAME_W / 2 - 100, 190); ctx.lineTo(GAME_W / 2 + 100, 190);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // World options
        const colors = ['#4af', '#c4f', '#f84', '#0cf', '#fa0'];
        const icons = ['✦', '▸', '⚙', '☁', '🏙'];
        for (let i = 0; i < WORLDS.length; i++) {
            const w = WORLDS[i];
            const y = 220 + i * 55;
            const sel = this.menuCursor === i;
            const pulse = sel ? 0.9 + Math.sin(this.frame * 0.08) * 0.1 : 1;

            // Selection box
            if (sel) {
                ctx.fillStyle = 'rgba(0,255,255,0.08)';
                ctx.fillRect(30, y - 24, GAME_W - 60, 48);
                ctx.strokeStyle = '#0ff';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(30, y - 24, GAME_W - 60, 48);
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

        // Difficulty selector
        const diffY = 500;
        const diffRow = WORLDS.length;
        const diffSel = this.menuCursor === diffRow;
        const diff = DIFFICULTY[this.settings.difficulty];
        const diffColors = ['#4f4', '#ff8', '#f44']; // green, yellow, red
        const diffColor = diffColors[this.settings.difficulty];
        
        if (diffSel) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(30, diffY - 18, GAME_W - 60, 36);
            ctx.strokeStyle = diffColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(30, diffY - 18, GAME_W - 60, 36);
        }
        
        ctx.fillStyle = diffSel ? '#fff' : '#888';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText('DIFFICULTY', GAME_W / 2, diffY - 5);
        ctx.fillStyle = diffColor;
        ctx.font = `bold ${diffSel ? 16 : 13}px "Courier New", monospace`;
        const arrows = diffSel ? `◄  ${diff.name}  ►` : diff.name;
        ctx.fillText(arrows, GAME_W / 2, diffY + 12);

        // High score
        if (this.highScore > 0) {
            ctx.fillStyle = '#ff8';
            ctx.font = '11px "Courier New", monospace';
            ctx.fillText(`HIGH SCORE: ${this.highScore.toLocaleString()}`, GAME_W / 2, 540);
        }

        // Debug mode hint
        if (this.menuCursor > 0 && this.menuCursor < WORLDS.length) {
            ctx.fillStyle = '#0f8';
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText('⚡ DEBUG: MAX POWER START', GAME_W / 2, 555);
        }

        // BACK button
        const backY = 575;
        const backSel = this.menuCursor === WORLDS.length + 1;
        if (backSel) {
            ctx.fillStyle = 'rgba(0, 200, 255, 0.1)';
            ctx.fillRect(GAME_W / 2 - 60, backY - 14, 120, 28);
            ctx.fillStyle = '#0ff';
            ctx.font = 'bold 14px "Courier New", monospace';
            ctx.fillText('▸ BACK ◂', GAME_W / 2, backY + 4);
        } else {
            ctx.fillStyle = '#667';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText('BACK', GAME_W / 2, backY + 4);
        }

        // Gamepad indicator
        if (this.input.gpConnected) {
            ctx.fillStyle = '#0f0';
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText('🎮 GAMEPAD CONNECTED', GAME_W / 2, 610);
        }

        // Footer hint
        ctx.fillStyle = '#445';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('↑↓ SELECT · ENTER TO CONFIRM', GAME_W / 2, GAME_H - 15);
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
            // Check for PE boss (standalone or animated sprite)
            const worldDef = WORLDS[this.world % WORLDS.length];
            if ((worldDef.bossType === 'pe' || worldDef.bossType === 'pe_animated') && worldDef.bossSprite) {
                const bossImg = this.assets.get(worldDef.bossSprite);
                if (bossImg) {
                    const rage = e.hp / e.maxHp <= 0.25;
                    const enraged = e.hp / e.maxHp <= 0.5;
                    const size = e.w;
                    if (rage) {
                        const pulse = 0.15 + Math.sin(this.frame * 0.3) * 0.1;
                        ctx.globalAlpha = pulse;
                        ctx.fillStyle = '#f00';
                        ctx.beginPath();
                        ctx.arc(e.x, e.y, size * 0.6, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    } else if (enraged) {
                        const pulse = 0.08 + Math.sin(this.frame * 0.15) * 0.05;
                        ctx.globalAlpha = pulse;
                        ctx.fillStyle = '#f80';
                        ctx.beginPath();
                        ctx.arc(e.x, e.y, size * 0.55, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                    ctx.save();
                    ctx.translate(e.x, e.y);
                    ctx.rotate(Math.PI);
                    if (worldDef.bossType === 'pe_animated' && worldDef.bossFrames) {
                        // Animated spritesheet: 4 cols x 2 rows, each frame bossFrameW x bossFrameH
                        const fw = worldDef.bossFrameW || 240;
                        const fh = worldDef.bossFrameH || 240;
                        const cols = Math.floor(bossImg.width / fw);
                        const animSpeed = rage ? 3 : (e.hp / e.maxHp <= 0.5 ? 4 : 6);
                        const frame = Math.floor(this.frame / animSpeed) % worldDef.bossFrames;
                        const sx = (frame % cols) * fw;
                        const sy = Math.floor(frame / cols) * fh;
                        ctx.drawImage(bossImg, sx, sy, fw, fh, -size / 2, -size / 2, size, size);
                    } else {
                        ctx.drawImage(bossImg, -size / 2, -size / 2, size, size);
                    }
                    ctx.restore();
                    // Boss HP bar
                    const barW = 90;
                    const barH = 5;
                    const barX = e.x - barW / 2;
                    const barY = e.y + size / 2 + 8;
                    ctx.fillStyle = '#400';
                    ctx.fillRect(barX, barY, barW, barH);
                    const hpRatio = e.hp / e.maxHp;
                    if (rage) {
                        ctx.fillStyle = this.frame % 10 < 5 ? '#f44' : '#ff0';
                    } else if (hpRatio <= 0.5) {
                        ctx.fillStyle = '#f80'; // orange when enraged
                    } else {
                        ctx.fillStyle = '#f44';
                    }
                    ctx.fillRect(barX, barY, barW * hpRatio, barH);
                    if (rage) {
                        ctx.fillStyle = '#f00';
                        ctx.font = 'bold 9px "Courier New", monospace';
                        ctx.textAlign = 'center';
                        ctx.globalAlpha = 0.6 + Math.sin(this.frame * 0.25) * 0.4;
                        ctx.fillText('RAGE', e.x, barY + 14);
                        ctx.globalAlpha = 1;
                    } else if (hpRatio <= 0.5) {
                        ctx.fillStyle = '#f80';
                        ctx.font = 'bold 9px "Courier New", monospace';
                        ctx.textAlign = 'center';
                        ctx.globalAlpha = 0.5 + Math.sin(this.frame * 0.15) * 0.3;
                        ctx.fillText('ENRAGED', e.x, barY + 14);
                        ctx.globalAlpha = 1;
                    }
                } else {
                    ctx.fillStyle = '#f4f';
                    ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
                }
            } else {
            const rage = e.hp / e.maxHp <= 0.25;
            const img = this.assets.get(SPRITES.boss.sheet);
            if (img) {
                const sprite = SPRITES.boss.variants[e.colorRow % 6];
                const size = e.w;

                // Rage: pulsing red overlay, Enraged: subtle orange overlay
                if (rage) {
                    const pulse = 0.15 + Math.sin(this.frame * 0.3) * 0.1;
                    ctx.globalAlpha = pulse;
                    ctx.fillStyle = '#f00';
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, size * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                } else if (e.hp / e.maxHp <= 0.5) {
                    const pulse = 0.08 + Math.sin(this.frame * 0.15) * 0.05;
                    ctx.globalAlpha = pulse;
                    ctx.fillStyle = '#f80';
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, size * 0.55, 0, Math.PI * 2);
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
                // Bar color: red → orange enraged → flashing red/yellow in rage
                const hpRatio2 = e.hp / e.maxHp;
                if (rage) {
                    ctx.fillStyle = this.frame % 10 < 5 ? '#f44' : '#ff0';
                } else if (hpRatio2 <= 0.5) {
                    ctx.fillStyle = '#f80';
                } else {
                    ctx.fillStyle = '#f44';
                }
                ctx.fillRect(barX, barY, barW * hpRatio2, barH);

                // Phase label
                if (rage) {
                    ctx.fillStyle = '#f00';
                    ctx.font = 'bold 9px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.globalAlpha = 0.6 + Math.sin(this.frame * 0.25) * 0.4;
                    ctx.fillText('RAGE', e.x, barY + 14);
                    ctx.globalAlpha = 1;
                } else if (hpRatio2 <= 0.5) {
                    ctx.fillStyle = '#f80';
                    ctx.font = 'bold 9px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.globalAlpha = 0.5 + Math.sin(this.frame * 0.15) * 0.3;
                    ctx.fillText('ENRAGED', e.x, barY + 14);
                    ctx.globalAlpha = 1;
                }
            } else {
                ctx.fillStyle = '#f4f';
                ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
            }
            } // close PE boss else
        } else if (e.peSprite) {
            // Pixel Enemies standalone sprite (rotated 180° to face down)
            const peImg = this.assets.get(e.peSprite);
            if (peImg) {
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(Math.PI);
                const sz = Math.max(e.w, 32);
                ctx.drawImage(peImg, -sz / 2, -sz / 2, sz, sz);
                ctx.restore();
            } else {
                ctx.fillStyle = '#0cf';
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

        // Enemy bullet glow + color per world
        if (!isPlayer) {
            const worldColors = ['#f44', '#f80', '#f0f', '#0cf', '#fa0']; // red, orange, magenta, cyan, amber
            const glowColors = ['rgba(255,60,60,', 'rgba(255,140,0,', 'rgba(255,0,255,', 'rgba(0,200,255,', 'rgba(255,170,0,'];
            const ci = this.world % worldColors.length;
            // Glow
            ctx.save();
            ctx.globalAlpha = 0.4 + Math.sin(this.frame * 0.15 + b.x * 0.1) * 0.2;
            ctx.fillStyle = glowColors[ci] + '0.5)';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.w * 0.9, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            // Core bullet
            ctx.fillStyle = worldColors[ci];
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.w * 0.4, 0, Math.PI * 2);
            ctx.fill();
            // Bright center
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.w * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
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

        // ══════ TOP BAR ══════
        // Score (left)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.fillText('SCORE', 8, 18);
        ctx.fillStyle = '#0ff';
        ctx.fillText(this.score.toLocaleString(), 8, 34);

        // High score (right)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#555';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText(`HI: ${this.highScore.toLocaleString()}`, GAME_W - 8, 34);

        // World name + difficulty (right)
        ctx.fillStyle = '#888';
        ctx.font = '12px "Courier New", monospace';
        const worldDef = WORLDS[this.world % WORLDS.length];
        const diffName = DIFFICULTY[this.settings.difficulty]?.name || '';
        const diffTag = this.settings.difficulty !== 1 ? ` [${diffName}]` : ''; // Only show if not medium
        ctx.fillText(worldDef.name + diffTag, GAME_W - 8, 18);

        // Combo (center)
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

        // ══════ BOTTOM BAR ══════
        const barY = GAME_H - 18;   // baseline for bar elements
        const barBgY = GAME_H - 26; // background strip top
        
        // Semi-transparent background strip
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, barBgY, GAME_W, 26);
        ctx.fillStyle = '#222';
        ctx.fillRect(0, barBgY, GAME_W, 1);

        // ── HP hearts (left) ──
        for (let i = 0; i < p.maxHp; i++) {
            const hx = 6 + i * 14;
            ctx.fillStyle = i < p.hp ? '#f44' : '#444';
            ctx.font = '12px serif';
            ctx.textAlign = 'left';
            ctx.fillText('♥', hx, barY);
        }

        // ── WPN bars (after hearts) ──
        const wpnStartX = 6 + p.maxHp * 14 + 6;
        ctx.fillStyle = '#4af';
        ctx.font = '8px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('W', wpnStartX, barY - 1);
        for (let i = 0; i < 5; i++) {
            const bx = wpnStartX + 10 + i * 10;
            const by = barBgY + 7;
            ctx.fillStyle = i < p.weaponLevel ? '#4af' : '#333';
            ctx.fillRect(bx, by, 7, 11);
            if (i < p.weaponLevel) {
                ctx.fillStyle = '#8cf';
                ctx.fillRect(bx, by, 7, 4);
            }
        }

        // ── SPD bars (after WPN) ──
        const spdStartX = wpnStartX + 10 + 5 * 10 + 6;
        ctx.fillStyle = '#f80';
        ctx.font = '8px "Courier New", monospace';
        ctx.fillText('S', spdStartX, barY - 1);
        for (let i = 0; i < 3; i++) {
            const bx = spdStartX + 10 + i * 10;
            const by = barBgY + 7;
            ctx.fillStyle = i < p.speedLevel ? '#f80' : '#333';
            ctx.fillRect(bx, by, 7, 11);
            if (i < p.speedLevel) {
                ctx.fillStyle = '#fc4';
                ctx.fillRect(bx, by, 7, 4);
            }
        }

        // ── Bomb charge + count (right side) ──
        const bombRightX = GAME_W - 8;
        // Bomb count
        if (this.bombs > 0) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 10px "Courier New", monospace';
            ctx.fillText(`💣${this.bombs}`, bombRightX, barY);
        }

        // Charge bar
        const chargeW = 40;
        const chargeH = 5;
        const chargeX = bombRightX - (this.bombs > 0 ? 28 : 0) - chargeW;
        const chargeY = barBgY + 10;
        const fillRatio = this.bombCharge / this.bombChargeMax;

        ctx.fillStyle = '#222';
        ctx.fillRect(chargeX, chargeY, chargeW, chargeH);
        const cr = 255, cg = Math.floor(120 + fillRatio * 135);
        ctx.fillStyle = `rgb(${cr},${cg},${Math.floor(fillRatio * 80)})`;
        ctx.fillRect(chargeX, chargeY, chargeW * fillRatio, chargeH);
        if (fillRatio > 0.8) {
            ctx.globalAlpha = 0.3 + Math.sin(this.frame * 0.2) * 0.2;
            ctx.fillStyle = '#ff0';
            ctx.fillRect(chargeX, chargeY, chargeW * fillRatio, chargeH);
            ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(chargeX, chargeY, chargeW, chargeH);

        // Active power-up indicators (above bottom bar)
        let puY = barBgY - 4;
        ctx.textAlign = 'right';
        ctx.font = '10px "Courier New", monospace';
        if (p.shield > 0) {
            ctx.fillStyle = '#0ff';
            ctx.fillText(`SHIELD ${Math.ceil(p.shield / 60)}s`, GAME_W - 8, puY);
            puY -= 14;
        }

        // ── Fire button (touch only) ──
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
    }

    drawWaveText(ctx) {
        const isMiniBoss = this.waveTextType === 'miniboss';
        if (!this.bossActive && !isMiniBoss) return;

        const t = this.showWaveText;
        const alpha = Math.min(1, t / 20);

        ctx.save();

        if (isMiniBoss) {
            // ── Mini-boss: compact warning ──
            ctx.globalAlpha = alpha;
            ctx.textAlign = 'center';

            // Pulsing background stripe
            const stripeAlpha = 0.15 + Math.sin(t * 0.15) * 0.1;
            ctx.fillStyle = `rgba(255, 170, 0, ${stripeAlpha})`;
            ctx.fillRect(0, GAME_H / 2 - 50, GAME_W, 60);

            ctx.fillStyle = '#fa0';
            ctx.font = 'bold 22px "Courier New", monospace';
            ctx.fillText('⚠ DANGER ⚠', GAME_W / 2, GAME_H / 2 - 25);
            ctx.fillStyle = '#fc8';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText('MINI-BOSS APPROACHING', GAME_W / 2, GAME_H / 2 - 5);
            if (t <= 1) this.waveTextType = null;
        } else {
            // ── BOSS: dramatic multi-layer warning ──

            // Red pulsing screen border
            const borderPulse = Math.sin(t * 0.3) * 0.5 + 0.5;
            ctx.globalAlpha = borderPulse * 0.4 * alpha;
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, GAME_W - 4, GAME_H - 4);

            // Scan lines effect
            ctx.globalAlpha = 0.06 * alpha;
            ctx.fillStyle = '#f00';
            for (let y = 0; y < GAME_H; y += 4) {
                ctx.fillRect(0, y, GAME_W, 1);
            }

            // Dark stripe background
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, GAME_H / 2 - 60, GAME_W, 100);

            // Red hazard stripes at edges of banner
            ctx.globalAlpha = alpha * 0.6;
            const stripeW = 8;
            ctx.fillStyle = '#f00';
            for (let i = 0; i < GAME_W / stripeW; i++) {
                if (i % 2 === 0) {
                    const offset = (t * 2) % (stripeW * 2);
                    ctx.fillRect(i * stripeW - offset, GAME_H / 2 - 60, stripeW, 4);
                    ctx.fillRect(i * stripeW + offset, GAME_H / 2 + 36, stripeW, 4);
                }
            }

            // Flashing WARNING text
            const flashRate = t > 80 ? 0.25 : 0.15;
            const textFlash = Math.sin(t * flashRate) > 0 ? 1 : 0.5;
            ctx.globalAlpha = alpha * textFlash;
            ctx.textAlign = 'center';

            // Glow behind text
            ctx.shadowColor = '#f00';
            ctx.shadowBlur = 15 + Math.sin(t * 0.2) * 10;

            ctx.fillStyle = '#f22';
            ctx.font = 'bold 11px "Courier New", monospace';
            ctx.fillText('▲ ▲ ▲  W A R N I N G  ▲ ▲ ▲', GAME_W / 2, GAME_H / 2 - 38);

            ctx.shadowBlur = 20;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 28px "Courier New", monospace';
            ctx.fillText('BOSS', GAME_W / 2, GAME_H / 2 - 5);

            ctx.shadowBlur = 0;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#f88';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText('INCOMING', GAME_W / 2, GAME_H / 2 + 16);

            // World-specific boss subtitle
            const worldDef = WORLDS[this.world % WORLDS.length];
            ctx.fillStyle = '#666';
            ctx.font = '9px "Courier New", monospace';
            ctx.fillText(`${worldDef.name} GUARDIAN`, GAME_W / 2, GAME_H / 2 + 32);
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

    drawStageClear(ctx) {
        const t = this.frame;
        const alpha = Math.min(1, t / 40);
        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.55})`;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.globalAlpha = alpha;

        const worldDef = WORLDS[this.stageClearWorld % WORLDS.length];

        // Decorative top line
        const lineW = Math.min(220, t * 6);
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(GAME_W / 2 - lineW / 2, GAME_H / 2 - 100);
        ctx.lineTo(GAME_W / 2 + lineW / 2, GAME_H / 2 - 100);
        ctx.stroke();

        // "STAGE CLEAR!" with shake intro
        const shake = t < 20 ? (20 - t) * 0.5 * Math.sin(t * 2) : 0;
        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 30px "Courier New", monospace';
        ctx.fillText('STAGE CLEAR!', GAME_W / 2 + shake, GAME_H / 2 - 70);

        // World name
        if (t > 15) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px "Courier New", monospace';
            ctx.fillText(worldDef.name, GAME_W / 2, GAME_H / 2 - 38);
        }

        // Stats (fade in sequentially)
        if (t > 30) {
            ctx.fillStyle = '#aaa';
            ctx.font = '13px "Courier New", monospace';
            ctx.fillText(`WAVE ${this.wave}`, GAME_W / 2, GAME_H / 2 - 5);
        }
        if (t > 40) {
            ctx.fillStyle = '#ff8';
            ctx.font = '16px "Courier New", monospace';
            ctx.fillText(`SCORE: ${this.score.toLocaleString()}`, GAME_W / 2, GAME_H / 2 + 25);
        }
        if (t > 50) {
            const bonus = (this.stageClearWorld + 1) * 5000;
            ctx.fillStyle = '#0f0';
            ctx.font = 'bold 14px "Courier New", monospace';
            ctx.fillText(`CLEAR BONUS: +${bonus.toLocaleString()}`, GAME_W / 2, GAME_H / 2 + 52);
        }

        // Next world preview
        if (t > 65) {
            const nextWorld = WORLDS[(this.stageClearWorld + 1) % WORLDS.length];
            ctx.fillStyle = '#f80';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText(`NEXT: ${nextWorld.name}`, GAME_W / 2, GAME_H / 2 + 85);
            ctx.fillStyle = '#888';
            ctx.font = '10px "Courier New", monospace';
            ctx.fillText(`"${nextWorld.subtitle}"`, GAME_W / 2, GAME_H / 2 + 102);
        }

        // Decorative bottom line
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(GAME_W / 2 - lineW / 2, GAME_H / 2 + 120);
        ctx.lineTo(GAME_W / 2 + lineW / 2, GAME_H / 2 + 120);
        ctx.stroke();

        // "Press to continue"
        if (t > 90) {
            const pulse = 0.4 + Math.sin(t * 0.06) * 0.6;
            ctx.fillStyle = `rgba(255,255,255,${pulse})`;
            ctx.font = '13px "Courier New", monospace';
            ctx.fillText('PRESS TO CONTINUE', GAME_W / 2, GAME_H / 2 + 155);
        }

        ctx.globalAlpha = 1;
    }

    drawVictory(ctx) {
        const t = this.frame;
        const alpha = Math.min(1, t / 50);
        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.7})`;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.globalAlpha = alpha;

        // Stars/sparkle effects
        if (t > 30) {
            for (let i = 0; i < 12; i++) {
                const sx = GAME_W / 2 + Math.cos(t * 0.02 + i * 0.52) * (80 + i * 12);
                const sy = GAME_H / 2 - 60 + Math.sin(t * 0.03 + i * 0.73) * 50;
                const sa = 0.3 + Math.sin(t * 0.08 + i) * 0.3;
                ctx.fillStyle = `rgba(255,255,100,${sa})`;
                ctx.font = '10px monospace';
                ctx.fillText('✦', sx, sy);
            }
        }

        // "MISSION COMPLETE"
        if (t > 10) {
            const shake = t < 30 ? (30 - t) * 0.3 * Math.sin(t * 1.5) : 0;
            const glow = 0.6 + Math.sin(t * 0.04) * 0.4;

            // Glow behind text
            ctx.save();
            ctx.shadowColor = '#ff0';
            ctx.shadowBlur = 15 + glow * 10;
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 26px "Courier New", monospace';
            ctx.fillText('MISSION', GAME_W / 2 + shake, GAME_H / 2 - 90);
            ctx.fillText('COMPLETE!', GAME_W / 2 + shake, GAME_H / 2 - 60);
            ctx.restore();
        }

        // Stats
        if (t > 40) {
            ctx.fillStyle = '#fff';
            ctx.font = '14px "Courier New", monospace';
            ctx.fillText('ALL SECTORS CLEARED', GAME_W / 2, GAME_H / 2 - 20);
        }
        if (t > 55) {
            ctx.fillStyle = '#ff8';
            ctx.font = 'bold 20px "Courier New", monospace';
            ctx.fillText(`FINAL SCORE`, GAME_W / 2, GAME_H / 2 + 20);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px "Courier New", monospace';
            ctx.fillText(`${this.score.toLocaleString()}`, GAME_W / 2, GAME_H / 2 + 50);
        }
        if (t > 70 && this.score >= this.highScore && this.score > 0) {
            ctx.fillStyle = '#f0f';
            ctx.font = 'bold 14px "Courier New", monospace';
            ctx.fillText('★ NEW HIGH SCORE! ★', GAME_W / 2, GAME_H / 2 + 80);
        }
        if (t > 85) {
            ctx.fillStyle = '#0ff';
            ctx.font = '11px "Courier New", monospace';
            ctx.fillText('THANK YOU FOR PLAYING!', GAME_W / 2, GAME_H / 2 + 115);
            ctx.fillStyle = '#666';
            ctx.fillText('PULSEGAMES.EU', GAME_W / 2, GAME_H / 2 + 135);
        }

        // "Press to continue"
        if (t > 120) {
            const pulse = 0.4 + Math.sin(t * 0.06) * 0.6;
            ctx.fillStyle = `rgba(255,255,255,${pulse})`;
            ctx.font = '13px "Courier New", monospace';
            ctx.fillText('PRESS TO CONTINUE', GAME_W / 2, GAME_H / 2 + 175);
        }

        ctx.globalAlpha = 1;
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
