// ─── Game Configuration ───
export const GAME_W = 360;
export const GAME_H = 640;

export const PLAYER_SPEED = 3.5;
export const PLAYER_BULLET_SPEED = 7;
export const PLAYER_FIRE_RATE = 10;
export const PLAYER_MAX_HP = 5;
export const PLAYER_INVULN_TIME = 105;

export const ENEMY_BULLET_SPEED = 2.5;

// ─── Precise Sprite Definitions (pixel-analyzed) ───
export const SPRITES = {
    player: {
        sheet: 'SpaceShips_Player-0001.png',
        type1: [
            { x: 12, y: 22, w: 39, h: 41 },
            { x: 76, y: 22, w: 39, h: 41 },
            { x: 140, y: 22, w: 39, h: 41 },
            { x: 204, y: 22, w: 39, h: 41 },
            { x: 77, y: 71, w: 39, h: 41 },
            { x: 141, y: 71, w: 39, h: 41 },
        ],
        type2: [
            { x: 11, y: 132, w: 58, h: 44 },
            { x: 99, y: 132, w: 58, h: 44 },
            { x: 187, y: 132, w: 58, h: 44 },
            { x: 11, y: 196, w: 58, h: 44 },
            { x: 91, y: 196, w: 58, h: 44 },
            { x: 187, y: 196, w: 58, h: 44 },
        ],
    },
    enemy: {
        sheet: 'SpaceShips_Enemy-0001.png',
        types: [
            [
                { x: 33, y: 11, w: 47, h: 53 },
                { x: 92, y: 17, w: 45, h: 36 },
                { x: 150, y: 25, w: 32, h: 20 },
                { x: 198, y: 27, w: 21, h: 17 },
            ],
            [
                { x: 33, y: 100, w: 47, h: 53 },
                { x: 92, y: 106, w: 45, h: 36 },
                { x: 150, y: 114, w: 32, h: 20 },
                { x: 198, y: 116, w: 21, h: 17 },
            ],
            [
                { x: 33, y: 187, w: 47, h: 53 },
                { x: 92, y: 193, w: 45, h: 36 },
                { x: 150, y: 201, w: 32, h: 20 },
                { x: 198, y: 203, w: 21, h: 17 },
            ],
        ],
    },
    boss: {
        sheet: 'SpaceShip_Boss-0001.png',
        variants: [
            { x: 3, y: 36, w: 106, h: 106 },
            { x: 139, y: 36, w: 106, h: 106 },
            { x: 3, y: 157, w: 106, h: 106 },
            { x: 139, y: 157, w: 106, h: 106 },
            { x: 3, y: 288, w: 106, h: 106 },
            { x: 139, y: 288, w: 106, h: 106 },
        ],
    },
    bullets: {
        sheet: 'Bullets-0001.png',
        playerBullets: [
            { x: 84, y: 16, w: 8, h: 16 },
            { x: 101, y: 17, w: 6, h: 14 },
            { x: 148, y: 16, w: 7, h: 19 },
        ],
        enemyBullets: [
            { x: 16, y: 80, w: 16, h: 16 },
            { x: 33, y: 81, w: 14, h: 14 },
            { x: 148, y: 112, w: 7, h: 19 },
        ],
    },
    explosion: {
        sheet: 'Explosion-0001.png',
        frameW: 55,
        frameH: 80,
        frames: 7,
        colors: 4,
    },
    exhaust: {
        sheet: 'Exhaust-0001.png',
        type1: [
            { x: 36, y: 8, w: 6, h: 15 },
            { x: 52, y: 10, w: 6, h: 13 },
            { x: 67, y: 10, w: 6, h: 13 },
            { x: 83, y: 7, w: 8, h: 16 },
        ],
        type2: [
            { x: 37, y: 40, w: 5, h: 14 },
            { x: 52, y: 41, w: 5, h: 13 },
            { x: 69, y: 42, w: 5, h: 12 },
            { x: 84, y: 40, w: 7, h: 14 },
        ],
        type3: [
            { x: 37, y: 103, w: 6, h: 15 },
            { x: 53, y: 103, w: 6, h: 13 },
            { x: 68, y: 103, w: 6, h: 13 },
            { x: 84, y: 103, w: 8, h: 16 },
        ],
    },
    bonuses: {
        sheet: 'Bonuses-0001.png',
        cellSize: 32,
        spriteSize: 22,
        spriteOffset: 5,
        types: ['health', 'shield', 'weapon', 'speed', 'score2x'],
    },
    mines: {
        sheet: 'Mine-0001.png',
        large: [
            [
                { x: 16, y: 48, w: 32, h: 32 },
                { x: 64, y: 48, w: 32, h: 32 },
                { x: 112, y: 48, w: 32, h: 32 },
                { x: 160, y: 48, w: 32, h: 32 },
            ],
            [
                { x: 16, y: 128, w: 32, h: 32 },
                { x: 64, y: 128, w: 32, h: 32 },
                { x: 112, y: 128, w: 32, h: 32 },
                { x: 160, y: 128, w: 32, h: 32 },
            ],
            [
                { x: 16, y: 208, w: 32, h: 32 },
                { x: 64, y: 208, w: 32, h: 32 },
                { x: 112, y: 208, w: 32, h: 32 },
                { x: 160, y: 208, w: 32, h: 32 },
            ],
        ],
    },
    asteroids: {
        sheet: 'Asteroids-0001.png',
        types: [
            { x: 6, y: 69, w: 39, h: 38 },
            { x: 19, y: 35, w: 26, h: 26 },
            { x: 32, y: 16, w: 16, h: 16 },
            { x: 70, y: 69, w: 39, h: 38 },
            { x: 83, y: 35, w: 26, h: 26 },
            { x: 96, y: 16, w: 16, h: 16 },
        ],
    },
    barrier: {
        sheet: 'Barrier-0001.png',
        variants: [
            { x: 15, y: 16, w: 68, h: 68 },
            { x: 99, y: 16, w: 68, h: 68 },
            { x: 15, y: 94, w: 68, h: 68 },
            { x: 99, y: 94, w: 68, h: 68 },
        ],
    },
    ui: { sheet: 'UI_sprites-0001.png' },
    backgrounds: [
        { file: 'Background_Space-0001.png', speed: 0.15 },
        { file: 'Background_SmallStars-0001.png', speed: 0.3 },
        { file: 'Background_Nebula-0001.png', speed: 0.5 },
        { file: 'Background_Stars-0001.png', speed: 0.8 },
        { file: 'Background_Nebula-0002.png', speed: 1.0 },
    ],
};

export const WAVE_CONFIG = {
    baseEnemies: 4,
    enemiesPerWave: 1.5,
    spawnInterval: 45,
    wavePause: 120,
    bossEvery: 10,
    miniBossWave: 5, // mini-boss appears at this wave within each world
    asteroidChance: 0.015,
    mineChance: 0.006,
    powerupChance: 0.15,
};

export const ENEMY_DEFS = {
    scout:   { hp: 1, speed: 1.8, score: 100, type: 3, shootRate: 0, size: 18 },
    fighter: { hp: 2, speed: 1.3, score: 200, type: 2, shootRate: 120, size: 24 },
    heavy:   { hp: 4, speed: 0.9, score: 350, type: 1, shootRate: 90, size: 32 },
    elite:   { hp: 3, speed: 1.7, score: 500, type: 0, shootRate: 70, size: 38 },
};

// DyLESTorm extra enemy sprites (standalone images, 48x48)
export const DYL_ENEMIES = [
    'dyl_enemy_blue.png',
    'dyl_enemy_grey.png',
    'dyl_enemy_green.png',
    'dyl_enemy_orange.png',
    'dyl_enemy_purple.png',
    'dyl_enemy_red.png',
    'dyl_enemy_metallic.png',
];

// Pixel Enemies for SHMUP (DyLESTorm pack 2) - standalone 64x64 sprites
export const PE_ENEMIES = {
    wings: ['wings_1.png','wings_2.png','wings_3.png','wings_4.png','wings_5.png','wings_6.png'],
    danger: ['danger_1.png','danger_2.png','danger_3.png','danger_4.png','danger_5.png','danger_6.png'],
    bug: ['bug_1.png','bug_2.png','bug_3.png','bug_4.png','bug_5.png','bug_6.png'],
    emperor: ['emperor_01.png','emperor_02.png','emperor_03.png','emperor_04.png','emperor_05.png','emperor_06.png'],
};

// Difficulty presets
export const DIFFICULTY = [
    { name: 'EASY',   shootMult: 1.8, hpMult: 0.6, speedMult: 0.8, formMult: 0.7, bulletSpeedMult: 0.75, dropMult: 1.5 },
    { name: 'MEDIUM', shootMult: 1.0, hpMult: 1.0, speedMult: 1.0, formMult: 1.0, bulletSpeedMult: 1.0,  dropMult: 1.0 },
    { name: 'HARD',   shootMult: 0.6, hpMult: 1.4, speedMult: 1.2, formMult: 1.3, bulletSpeedMult: 1.2,  dropMult: 0.7 },
];

// Cloud sprites (Cloudy Pack) for atmosphere world
export const CLOUD_SPRITES = {
    frosty: ['cloud_frosty_2.png','cloud_frosty_5.png','cloud_frosty_7.png','cloud_frosty_10.png','cloud_frosty_21.png','cloud_frosty_23.png','cloud_frosty_25.png','cloud_frosty_27.png','cloud_frosty_31.png','cloud_frosty_43.png'],
    sunny: ['cloud_sunny_2.png','cloud_sunny_5.png','cloud_sunny_7.png','cloud_sunny_10.png','cloud_sunny_21.png','cloud_sunny_23.png','cloud_sunny_25.png','cloud_sunny_27.png','cloud_sunny_31.png','cloud_sunny_43.png'],
};

// City background assets (DyLESTorm City pack)
export const CITY_ASSETS = {
    road: 'city_road.png',
    blocks: ['city_block_1.png','city_block_2.png','city_block_3.png','city_block_4.png'],
    forests: ['city_forest_1.png','city_forest_2.png'],
    clouds: ['city_cloud_1.png','city_cloud_2.png','city_cloud_3.png'],
};

// Mini-boss definitions
export const MINI_BOSS_DEFS = [
    { sprite: 'dyl_miniboss_01.png', w: 80, h: 80, hp: 70, speed: 0.6, score: 2500, shootRate: 55 },
    { sprite: 'dyl_miniboss_02.png', w: 100, h: 110, hp: 90, speed: 0.45, score: 3500, shootRate: 45 },
    { sprite: 'emperor_06.png', w: 64, h: 64, hp: 80, speed: 0.7, score: 3000, shootRate: 50, isPE: true },
    { sprite: 'emperor_03.png', w: 64, h: 64, hp: 100, speed: 0.55, score: 4000, shootRate: 42, isPE: true },
];

// DyLESTorm background layers
export const DYL_BACKGROUNDS = [
    'dyl_bg_base.png',
    'dyl_bg_stars1.png',
    'dyl_bg_stars2.png',
    'dyl_bg_nebula1.png',
    'dyl_bg_nebula2.png',
];

export const BOSS_DEF = {
    hp: 220,
    speed: 0.7,
    score: 5000,
    size: 56,
    shootRate: 20,
    phases: 3,
};

// ─── World Definitions ───
// Each world lasts bossEvery waves. After beating the boss, next world begins.
export const WORLDS = [
    {
        name: 'DEEP SPACE',
        subtitle: 'THE VOID AWAKENS',
        tint: null,
        bgSpeedMult: 1.0,
        enemyPool: 'timberlate',
        enemyRows: [0, 1],
        dylChance: 0,
        miniBossIdx: 0,
        bossColors: [0, 1],
        // Open space: lots of planets, no structures
        nebulae: ['dyl_nebula_b_blue.png', 'dyl_nebula_c_blue.png'],
        planets: ['dyl_planet_grey.png', 'dyl_planet_green.png', 'dyl_planet_orange.png'],
        blocks: false,
        buildings: false,
        ground: false,
    },
    {
        name: 'STATION APPROACH',
        subtitle: 'ENTERING THE PERIMETER',
        tint: null,
        bgSpeedMult: 1.2,
        enemyPool: 'mixed',
        enemyRows: [1, 2],
        dylChance: 0.5,
        miniBossIdx: 1,
        bossColors: [2, 3],
        // Approaching station: walls appearing, planet still visible behind
        nebulae: ['dyl_nebula_a_purple.png', 'dyl_nebula_b_purple.png'],
        planets: ['dyl_planet_green.png'],
        blocks: true,
        buildings: false,
        ground: false,
    },
    {
        name: 'STATION CORE',
        subtitle: 'NO RETURN',
        tint: null,
        bgSpeedMult: 1.4,
        enemyPool: 'dylestorm',
        enemyRows: [0, 2],
        dylChance: 0.7,
        miniBossIdx: 1,
        bossColors: [4, 5],
        // Inside station: walls, buildings, ground structures
        nebulae: ['dyl_nebula_a_red.png'],
        planets: [],
        blocks: true,
        buildings: true,
        ground: true,
    },
    {
        name: 'ATMOSPHERE',
        subtitle: 'BREAKING THROUGH',
        tint: null,
        bgSpeedMult: 1.6,
        enemyPool: 'pe_atmo',  // Pixel Enemies atmosphere pool
        enemyRows: [0, 1],
        dylChance: 0,
        peChance: 1.0,         // 100% Pixel Enemies sprites
        pePool: 'wings',       // Regular enemies use wings category
        peTough: 'danger',     // Tougher enemies use danger category
        miniBossIdx: 2,        // Emperor mini-boss
        bossType: 'pe',        // Use PE boss sprite
        bossSprite: 'pe_boss_02.png',
        bossColors: [0, 1],
        bulletColor: { core: '#0cf', glow: 'rgba(0,200,255,', name: 'cyan' },
        // Atmosphere: gradient sky + clouds, no space structures
        nebulae: [],
        planets: [],
        blocks: false,
        buildings: false,
        ground: false,
        // Cloud background config
        bgType: 'atmosphere',
        cloudPalette: 'sunny',
        skyGradient: ['#001', '#014', '#038', '#26a', '#5af', '#8cf'],
    },
    {
        name: 'CITY ASSAULT',
        subtitle: 'GROUND ZERO',
        tint: null,
        bgSpeedMult: 1.8,
        enemyPool: 'pe_city',
        enemyRows: [0, 1, 2],
        dylChance: 0,
        peChance: 1.0,
        pePool: 'bug',          // Bugs for city aliens
        peTough: 'emperor',     // Emperors for heavy enemies
        miniBossIdx: 3,         // Emperor 03 mini-boss
        bossType: 'pe_animated',
        bossSprite: 'pe_boss_01_sheet.png',
        bossFrames: 8,          // 4x2 grid, 240x240 per frame
        bossFrameW: 240,
        bossFrameH: 240,
        bossColors: [0, 1],
        bulletColor: { core: '#f80', glow: 'rgba(255,140,0,', name: 'orange' },
        nebulae: [],
        planets: [],
        blocks: false,
        buildings: false,
        ground: false,
        bgType: 'city',
    },
];
