// ─── Procedural Audio System ───
export class Audio {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.masterGain = null;
        this._initialized = false;
        this.bgm = null;          // procedural fallback
        this.bgmPlayer = null;    // OGG player
        this._bgmMode = 'none';   // 'ogg' | 'procedural' | 'none'
    }

    init() {
        if (this._initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
            this.bgmPlayer = new BGMPlayer(this.ctx, this.masterGain);
            this._initialized = true;
        } catch (e) {
            this.enabled = false;
        }
    }

    async loadBGM() {
        if (!this.bgmPlayer) return;
        await this.bgmPlayer.loadAll();
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    _play(fn) {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        try { fn(); } catch (e) { /* ignore audio errors */ }
    }

    // ─── Background Music ───
    startBGM(worldIndex) {
        this.stopBGM();
        if (!this.enabled || !this.ctx) return;
        this.resume();

        // Try file-based BGM first
        if (this.bgmPlayer && this.bgmPlayer.hasTrack(worldIndex)) {
            this.bgmPlayer.start(worldIndex);
            this._bgmMode = 'ogg';
            return;
        }

        // Fall back to procedural
        this.bgm = new BGMTrack(this.ctx, this.masterGain, worldIndex);
        this.bgm.start();
        this._bgmMode = 'procedural';
    }

    startTitleBGM() {
        this.stopBGM();
        if (!this.enabled || !this.ctx) return;
        this.resume();
        if (this.bgmPlayer && this.bgmPlayer.hasTrack('title')) {
            this.bgmPlayer.start('title');
            this._bgmMode = 'ogg';
        }
    }

    stopBGM() {
        if (this._bgmMode === 'ogg' && this.bgmPlayer) {
            this.bgmPlayer.stop();
        }
        if (this.bgm) {
            this.bgm.stop();
            this.bgm = null;
        }
        this._bgmMode = 'none';
    }

    // ─── SFX ───
    playerShoot() {
        this._play(() => {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, t);
            osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.connect(gain).connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.08);
        });
    }

    playerShootHeavy() {
        this._play(() => {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.12);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.connect(gain).connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.12);
        });
    }

    enemyShoot() {
        this._play(() => {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, t);
            osc.frequency.exponentialRampToValueAtTime(150, t + 0.1);
            gain.gain.setValueAtTime(0.06, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.connect(gain).connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.1);
        });
    }

    explosion(big = false) {
        this._play(() => {
            const t = this.ctx.currentTime;
            const dur = big ? 0.5 : 0.25;
            const bufferSize = this.ctx.sampleRate * dur;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(big ? 600 : 1200, t);
            filter.frequency.exponentialRampToValueAtTime(100, t + dur);
            gain.gain.setValueAtTime(big ? 0.25 : 0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
            noise.connect(filter).connect(gain).connect(this.masterGain);
            noise.start(t);
            noise.stop(t + dur);
        });
    }

    powerup() {
        this._play(() => {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(660, t + 0.05);
            osc.frequency.setValueAtTime(880, t + 0.1);
            osc.frequency.setValueAtTime(1100, t + 0.15);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            osc.connect(gain).connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.25);
        });
    }

    hit() {
        this._play(() => {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.connect(gain).connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.12);
        });
    }

    playerDeath() {
        this._play(() => {
            const t = this.ctx.currentTime;
            for (let i = 0; i < 3; i++) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400 - i * 100, t + i * 0.15);
                osc.frequency.exponentialRampToValueAtTime(50, t + i * 0.15 + 0.2);
                gain.gain.setValueAtTime(0.15, t + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.2);
                osc.connect(gain).connect(this.masterGain);
                osc.start(t + i * 0.15);
                osc.stop(t + i * 0.15 + 0.2);
            }
        });
    }

    waveStart() {
        this._play(() => {
            const t = this.ctx.currentTime;
            [523, 659, 784].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.1, t + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
                osc.connect(gain).connect(this.masterGain);
                osc.start(t + i * 0.08);
                osc.stop(t + i * 0.08 + 0.15);
            });
        });
    }

    bossAlert() {
        // Try file-based siren first, fall back to procedural
        if (this._playSfx('boss_warning', 0.5)) return;
        this._play(() => {
            const t = this.ctx.currentTime;
            for (let i = 0; i < 4; i++) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.value = i % 2 === 0 ? 220 : 330;
                gain.gain.setValueAtTime(0.12, t + i * 0.2);
                gain.gain.setValueAtTime(0, t + i * 0.2 + 0.15);
                osc.connect(gain).connect(this.masterGain);
                osc.start(t + i * 0.2);
                osc.stop(t + i * 0.2 + 0.15);
            }
        });
    }

    menuClick() {
        if (this._playSfx('click', 0.6)) return;
    }

    bossExplode() {
        if (this._playSfx('boss_explode', 0.7)) return;
        this.explosion(true);
    }

    bombSfx() {
        if (this._playSfx('bomb', 0.7)) return;
        this.explosion(true);
    }

    gameOverSfx() {
        if (this._playSfx('gameover', 0.6)) return;
    }

    playerHit() {
        if (this._playSfx('player_hit', 0.7)) return;
        this.hit(); // fallback to procedural
    }

    // ─── File-based SFX playback ───
    _playSfx(name, volume = 0.5) {
        if (!this.enabled || !this.ctx || !this.sfxBuffers) return false;
        const buf = this.sfxBuffers[name];
        if (!buf) return false;
        this.resume();
        try {
            const source = this.ctx.createBufferSource();
            source.buffer = buf;
            const gain = this.ctx.createGain();
            gain.gain.value = volume;
            source.connect(gain).connect(this.masterGain);
            source.start(0);
        } catch (e) { /* ignore */ }
        return true;
    }

    async loadSFX() {
        if (!this.ctx) return;
        this.sfxBuffers = {};
        const files = {
            'click': 'sfx_click.mp3',
            'boss_warning': 'sfx_boss_warning.mp3',
            'boss_explode': 'sfx_boss_explode.mp3',
            'bomb': 'sfx_bomb.mp3',
            'gameover': 'sfx_gameover.mp3',
            'player_hit': 'sfx_player_hit.mp3',
        };
        await Promise.allSettled(Object.entries(files).map(async ([name, file]) => {
            try {
                const resp = await fetch('assets/' + file);
                if (!resp.ok) return;
                const arrayBuf = await resp.arrayBuffer();
                this.sfxBuffers[name] = await this.ctx.decodeAudioData(arrayBuf);
                console.log(`🔊 Loaded SFX: ${file}`);
            } catch (e) {
                console.warn(`SFX load error: ${file}`, e);
            }
        }));
    }
}

// ─── BGM File Configuration ───
const BGM_FILES = [
    'bgm_world1.mp3',        // World 1: DEEP SPACE
    'bgm_world2.mp3',        // World 2: STATION APPROACH
    'bgm_world3.mp3',        // World 3: STATION CORE
    'bgm_world4.mp3',        // World 4: ATMOSPHERE
    'bgm_world5.mp3',        // World 5: CITY ASSAULT
];
const BGM_TITLE = 'bgm_title_music.mp3';

// ─── OGG-based Background Music Player ───
class BGMPlayer {
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.buffers = {}; // worldIndex → AudioBuffer
        this.source = null;
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 0;
        this.gainNode.connect(destination);
        this.playing = false;
        this.currentWorld = -1;
    }

    async loadAll() {
        const promises = BGM_FILES.map(async (file, i) => {
            try {
                const resp = await fetch('assets/' + file);
                if (!resp.ok) {
                    console.warn(`BGM not found: ${file} (will use procedural)`);
                    return;
                }
                const arrayBuf = await resp.arrayBuffer();
                const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
                this.buffers[i] = audioBuf;
                console.log(`🎵 Loaded BGM: ${file} (${audioBuf.duration.toFixed(1)}s)`);
            } catch (e) {
                console.warn(`BGM load error: ${file}`, e);
            }
        });
        // Also load title music
        promises.push((async () => {
            try {
                const resp = await fetch('assets/' + BGM_TITLE);
                if (!resp.ok) return;
                const arrayBuf = await resp.arrayBuffer();
                const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
                this.buffers['title'] = audioBuf;
                console.log(`🎵 Loaded title BGM (${audioBuf.duration.toFixed(1)}s)`);
            } catch (e) {
                console.warn('Title BGM load error:', e);
            }
        })());
        await Promise.allSettled(promises);
    }

    hasTrack(worldIndex) {
        return !!this.buffers[worldIndex];
    }

    start(worldIndex) {
        this.stop();
        const buf = this.buffers[worldIndex];
        if (!buf) return false;

        this.source = this.ctx.createBufferSource();
        this.source.buffer = buf;
        this.source.loop = true;
        this.source.connect(this.gainNode);

        // Fade in
        this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        this.gainNode.gain.linearRampToValueAtTime(0.7, this.ctx.currentTime + 0.5);

        this.source.start(0);
        this.playing = true;
        this.currentWorld = worldIndex;
        return true;
    }

    stop() {
        if (!this.playing || !this.source) return;
        try {
            // Fade out
            this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.ctx.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
            const src = this.source;
            setTimeout(() => {
                try { src.stop(); } catch (e) {}
            }, 450);
        } catch (e) {}
        this.source = null;
        this.playing = false;
        this.currentWorld = -1;
    }
}

// ─── Procedural Background Music (fallback) ───
const NOTE_FREQS = {
    'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'Eb3': 155.56, 'Bb3': 233.08, 'Eb4': 311.13, 'Ab4': 415.30, 'Bb4': 466.16,
    'Eb5': 622.25, 'Gb4': 369.99, 'Gb3': 185.00, 'Ab3': 207.65,
    'F#3': 185.00, 'F#4': 369.99, 'F#5': 739.99,
};

const WORLD_TRACKS = [
    // ── World 1: DEEP SPACE ──
    {
        bpm: 120,
        bass: {
            notes: ['E3', 'E3', 'G3', 'E3', 'A3', 'A3', 'B3', 'B3',
                    'E3', 'E3', 'D3', 'E3', 'C3', 'C3', 'D3', 'D3'],
            wave: 'square', vol: 0.09, noteLen: 0.8,
        },
        melody: {
            notes: ['E4', 'G4', 'B4', 'E5', null, 'D5', 'B4', null,
                    'A4', 'B4', 'G4', null, 'E4', 'D4', 'E4', null],
            wave: 'triangle', vol: 0.07, noteLen: 0.6,
        },
        arp: {
            notes: ['B4', 'E5', 'G5', 'E5', 'B4', 'G4', 'E4', 'G4',
                    'A4', 'C5', 'E5', 'C5', 'A4', 'E4', 'D4', 'E4'],
            wave: 'sine', vol: 0.04, noteLen: 0.3,
        },
        drums: { pattern: [1,0,0,0, 2,0,0,0, 1,0,0,2, 2,0,1,0] },
    },
    // ── World 2: STATION APPROACH ──
    {
        bpm: 140,
        bass: {
            notes: ['A3', 'A3', 'A3', 'C3', 'D3', 'D3', 'E3', 'E3',
                    'F3', 'F3', 'E3', 'E3', 'D3', 'D3', 'C3', 'E3'],
            wave: 'sawtooth', vol: 0.08, noteLen: 0.7,
        },
        melody: {
            notes: ['A4', 'C5', 'E5', null, 'D5', 'C5', 'A4', 'C5',
                    'F4', 'A4', 'C5', 'D5', 'E5', null, 'D5', null],
            wave: 'square', vol: 0.06, noteLen: 0.5,
        },
        arp: {
            notes: ['E4', 'A4', 'C5', 'E5', 'C5', 'A4', 'E4', 'A4',
                    'D4', 'F4', 'A4', 'D5', 'A4', 'F4', 'D4', 'F4'],
            wave: 'square', vol: 0.03, noteLen: 0.2,
        },
        drums: { pattern: [1,0,2,0, 1,0,2,2, 1,0,2,0, 1,2,1,2] },
    },
    // ── World 3: STATION CORE ──
    {
        bpm: 160,
        bass: {
            notes: ['E3', 'E3', 'Eb3', 'Eb3', 'D3', 'D3', 'E3', 'G3',
                    'A3', 'A3', 'G3', 'G3', 'Bb3', 'Bb3', 'A3', 'E3'],
            wave: 'sawtooth', vol: 0.10, noteLen: 0.8,
        },
        melody: {
            notes: ['E5', 'Eb5', 'D5', 'B4', 'E5', null, 'G5', 'E5',
                    'A4', 'Bb4', 'A4', 'G4', 'E4', 'G4', 'A4', null],
            wave: 'square', vol: 0.06, noteLen: 0.4,
        },
        arp: {
            notes: ['E4', 'G4', 'Bb4', 'E5', 'Bb4', 'G4', 'E4', 'Bb3',
                    'A3', 'E4', 'A4', 'E5', 'A4', 'E4', 'A3', 'E4'],
            wave: 'sawtooth', vol: 0.03, noteLen: 0.15,
        },
        drums: { pattern: [1,2,2,0, 1,2,1,2, 1,2,2,1, 1,2,1,2] },
    },
];

class BGMTrack {
    constructor(ctx, destination, worldIndex) {
        this.ctx = ctx;
        this.track = WORLD_TRACKS[worldIndex % WORLD_TRACKS.length];
        this.running = false;
        this.step = 0;
        this.stepLen = 60 / this.track.bpm / 2;
        this.nextTime = 0;
        this.scheduleAhead = 0.15;
        this.lookAhead = 25;
        this.bgmGain = ctx.createGain();
        this.bgmGain.gain.value = 0.5;
        this.bgmGain.connect(destination);
        this._timer = null;
        this._nodes = [];
    }

    start() {
        this.running = true;
        this.step = 0;
        this.nextTime = this.ctx.currentTime + 0.1;
        this._schedule();
    }

    stop() {
        this.running = false;
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        try {
            this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, this.ctx.currentTime);
            this.bgmGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
        } catch (e) {}
        for (const n of this._nodes) { try { n.stop(this.ctx.currentTime + 0.3); } catch (e) {} }
        this._nodes = [];
    }

    _schedule() {
        if (!this.running) return;
        while (this.nextTime < this.ctx.currentTime + this.scheduleAhead) {
            this._playStep(this.step, this.nextTime);
            this.step = (this.step + 1) % 16;
            this.nextTime += this.stepLen;
        }
        this._timer = setTimeout(() => this._schedule(), this.lookAhead);
    }

    _playStep(step, time) {
        const t = this.track;
        const bassNote = t.bass.notes[step];
        if (bassNote && NOTE_FREQS[bassNote]) this._playNote(NOTE_FREQS[bassNote], t.bass.wave, t.bass.vol, time, this.stepLen * t.bass.noteLen);
        const melNote = t.melody.notes[step];
        if (melNote && NOTE_FREQS[melNote]) this._playNote(NOTE_FREQS[melNote], t.melody.wave, t.melody.vol, time, this.stepLen * t.melody.noteLen);
        const arpNote = t.arp.notes[step];
        if (arpNote && NOTE_FREQS[arpNote]) this._playNote(NOTE_FREQS[arpNote], t.arp.wave, t.arp.vol, time, this.stepLen * t.arp.noteLen);
        const drumHit = t.drums.pattern[step];
        if (drumHit === 1) this._playKick(time);
        else if (drumHit === 2) this._playHat(time);
    }

    _playNote(freq, wave, vol, time, dur) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(vol, time);
        gain.gain.setValueAtTime(vol * 0.7, time + dur * 0.7);
        gain.gain.linearRampToValueAtTime(0, time + dur);
        osc.connect(gain).connect(this.bgmGain);
        osc.start(time); osc.stop(time + dur + 0.01);
        this._trackNode(osc);
    }

    _playKick(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        osc.connect(gain).connect(this.bgmGain);
        osc.start(time); osc.stop(time + 0.12);
        this._trackNode(osc);
    }

    _playHat(time) {
        const bufSize = this.ctx.sampleRate * 0.04;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 4);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass'; filter.frequency.value = 8000;
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        src.connect(filter).connect(gain).connect(this.bgmGain);
        src.start(time); src.stop(time + 0.05);
        this._trackNode(src);
    }

    _trackNode(node) {
        this._nodes.push(node);
        if (this._nodes.length > 100) this._nodes = this._nodes.slice(-50);
    }
}
