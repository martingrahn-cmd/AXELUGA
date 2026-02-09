// ─── Procedural Audio System ───
export class Audio {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.masterGain = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
            this._initialized = true;
        } catch (e) {
            this.enabled = false;
        }
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
            // Noise burst
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
}
