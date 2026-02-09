// ─── Input Manager ───
import { GAME_W, GAME_H } from './config.js';

export class Input {
    constructor(canvas) {
        this.keys = {};
        this.canvas = canvas;
        this._scale = 1;
        this._offsetX = 0;
        this._offsetY = 0;
        this._tapCallback = null;

        // Touch state (multi-touch: move + fire)
        this.moveTouch = null;
        this.fireTouch = false;

        // Mouse state
        this._mouseDown = false;
        this._mousePos = { x: 0, y: 0 };

        // Is this a touch device?
        this.isTouchDevice = false;

        // Fire button zone (bottom-right)
        this.fireZone = { x: GAME_W - 90, y: GAME_H - 90, w: 80, h: 80 };
        // Bomb button zone (bottom-left)
        this.bombZone = { x: 0, y: GAME_H - 105, w: 70, h: 70 };
        this.bombTap = false;

        // ─── Gamepad state ───
        this.gamepad = null;
        this.gpAxes = { x: 0, y: 0 };
        this.gpButtons = { fire: false, bomb: false, pause: false, tap: false };
        this.gpBombPrev = false; // for edge detection
        this.gpPausePrev = false;
        this.gpConnected = false;
        this.gpDebug = null;

        // ─── Keyboard ───
        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });

        // ─── Touch ───
        canvas.addEventListener('touchstart', e => { this.isTouchDevice = true; this._onTouchStart(e); }, { passive: false });
        canvas.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', e => this._onTouchEnd(e), { passive: false });
        canvas.addEventListener('touchcancel', e => this._onTouchEnd(e), { passive: false });

        // ─── Mouse (desktop: click = fire, WASD = move) ───
        canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        canvas.addEventListener('mouseup', e => this._onMouseUp(e));
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        // ─── Gamepad events ───
        window.addEventListener('gamepadconnected', e => {
            const gp = e.gamepad;
            console.log(`🎮 Gamepad connected: "${gp.id}" | mapping: ${gp.mapping} | ${gp.buttons.length} buttons, ${gp.axes.length} axes`);
            // Only show connected if it looks like a real gamepad
            if (gp.buttons.length >= 8 && gp.axes.length >= 4) {
                this.gpConnected = true;
            } else {
                console.log('🎮 Skipping (likely headset/dongle) — need 8+ buttons & 4+ axes');
            }
        });
        window.addEventListener('gamepaddisconnected', e => {
            console.log('🎮 Gamepad disconnected');
            this.gpConnected = false;
            this.gamepad = null;
        });
    }

    setScale(scale, offsetX, offsetY) {
        this._scale = scale;
        this._offsetX = offsetX;
        this._offsetY = offsetY;
    }

    onTap(cb) { this._tapCallback = cb; }

    _gameCoords(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left - this._offsetX) / this._scale,
            y: (clientY - rect.top - this._offsetY) / this._scale,
        };
    }

    _isInFireZone(gx, gy) {
        const fz = this.fireZone;
        return gx >= fz.x && gx <= fz.x + fz.w && gy >= fz.y && gy <= fz.y + fz.h;
    }

    _isInBombZone(gx, gy) {
        const bz = this.bombZone;
        return gx >= bz.x && gx <= bz.x + bz.w && gy >= bz.y && gy <= bz.y + bz.h;
    }

    // ─── Touch (multi-touch: left side moves, fire button fires) ───
    _onTouchStart(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            const pos = this._gameCoords(t.clientX, t.clientY);
            if (this._tapCallback) this._tapCallback(pos.x, pos.y);

            if (this._isInFireZone(pos.x, pos.y)) {
                this.fireTouch = true;
            } else if (this._isInBombZone(pos.x, pos.y)) {
                this.bombTap = true;
            } else if (!this.moveTouch) {
                this.moveTouch = {
                    id: t.identifier,
                    x: pos.x,
                    y: pos.y,
                };
            }
        }
    }

    _onTouchMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (this.moveTouch && t.identifier === this.moveTouch.id) {
                const pos = this._gameCoords(t.clientX, t.clientY);
                this.moveTouch.x = pos.x;
                this.moveTouch.y = pos.y;
            }
        }
    }

    _onTouchEnd(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (this.moveTouch && t.identifier === this.moveTouch.id) {
                this.moveTouch = null;
            }
        }
        // Recheck fire zone from remaining touches
        let stillFiring = false;
        for (const t of e.touches) {
            const pos = this._gameCoords(t.clientX, t.clientY);
            if (this._isInFireZone(pos.x, pos.y)) stillFiring = true;
        }
        this.fireTouch = stillFiring;

        // Verify move touch still active
        if (this.moveTouch) {
            let found = false;
            for (const t of e.touches) {
                if (t.identifier === this.moveTouch.id) found = true;
            }
            if (!found) this.moveTouch = null;
        }
    }

    // ─── Mouse (desktop: click anywhere = fire) ───
    _onMouseDown(e) {
        const pos = this._gameCoords(e.clientX, e.clientY);
        if (this._tapCallback) this._tapCallback(pos.x, pos.y);
        this._mouseDown = true;
    }

    _onMouseMove(e) {
        const pos = this._gameCoords(e.clientX, e.clientY);
        this._mousePos = pos;
    }

    _onMouseUp() {
        this._mouseDown = false;
    }

    // ─── Gamepad polling (call once per frame) ───
    pollGamepad() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        this.gamepad = null;

        // Find best gamepad: prefer standard mapping, require 4+ axes and 8+ buttons
        // This filters out headset dongles and other non-gamepad HID devices
        let fallback = null;
        for (const gp of gamepads) {
            if (!gp || !gp.connected) continue;
            const hasEnoughButtons = gp.buttons.length >= 8;
            const hasEnoughAxes = gp.axes.length >= 4;
            if (gp.mapping === 'standard' && hasEnoughButtons) {
                this.gamepad = gp;
                break;
            }
            if (hasEnoughButtons && hasEnoughAxes && !fallback) {
                fallback = gp;
            }
        }
        if (!this.gamepad) this.gamepad = fallback;
        this.gpConnected = !!this.gamepad;
        if (!this.gamepad) {
            this.gpAxes = { x: 0, y: 0 };
            this.gpButtons = { fire: false, bomb: false, pause: false, tap: false };
            this.gpDebug = null;
            return;
        }

        const gp = this.gamepad;
        const deadzone = 0.15;
        const isStandard = gp.mapping === 'standard';

        // ── Axes ──
        let lx = gp.axes[0] || 0;
        let ly = gp.axes[1] || 0;
        if (Math.abs(lx) < deadzone) lx = 0;
        if (Math.abs(ly) < deadzone) ly = 0;

        // ── D-pad ──
        // Standard mapping: buttons 12-15
        // D-input / 8BitDo: D-pad may be on axes[6]/axes[7] or axes[9] (hat switch)
        let dpUp = false, dpDown = false, dpLeft = false, dpRight = false;

        if (isStandard) {
            dpUp = gp.buttons[12] ? gp.buttons[12].pressed : false;
            dpDown = gp.buttons[13] ? gp.buttons[13].pressed : false;
            dpLeft = gp.buttons[14] ? gp.buttons[14].pressed : false;
            dpRight = gp.buttons[15] ? gp.buttons[15].pressed : false;
        } else {
            // Non-standard: check extra axes for D-pad hat switch
            // Many controllers use axes[6]/axes[7] or axes[9]
            for (let ai = 2; ai < gp.axes.length; ai++) {
                const val = gp.axes[ai];
                // Hat switch typically: -1=up, 1=down on one axis, -1=left, 1=right on another
                // Some use single axis with cardinal directions
                if (ai % 2 === 0 && Math.abs(val) > 0.5) {
                    if (val < -0.5) dpLeft = true;
                    if (val > 0.5) dpRight = true;
                }
                if (ai % 2 === 1 && Math.abs(val) > 0.5) {
                    if (val < -0.5) dpUp = true;
                    if (val > 0.5) dpDown = true;
                }
            }
            // Also check buttons 12-15 if they exist
            if (gp.buttons[12]) dpUp = dpUp || gp.buttons[12].pressed;
            if (gp.buttons[13]) dpDown = dpDown || gp.buttons[13].pressed;
            if (gp.buttons[14]) dpLeft = dpLeft || gp.buttons[14].pressed;
            if (gp.buttons[15]) dpRight = dpRight || gp.buttons[15].pressed;
        }

        let ax = lx, ay = ly;
        if (dpLeft) ax = -1;
        if (dpRight) ax = 1;
        if (dpUp) ay = -1;
        if (dpDown) ay = 1;

        this.gpAxes = { x: ax, y: ay };

        // ── Buttons: detect ANY pressed button for fire/bomb ──
        const btn = (i) => gp.buttons[i] ? gp.buttons[i].pressed : false;
        const btnVal = (i) => gp.buttons[i] ? gp.buttons[i].value : 0;

        // Detect any button press (for menu/debug)
        let anyPressed = false;
        let pressedList = [];
        for (let i = 0; i < gp.buttons.length; i++) {
            if (btn(i)) {
                anyPressed = true;
                pressedList.push(i);
            }
        }

        if (isStandard) {
            // Standard: A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, Back=8, Start=9
            this.gpButtons = {
                fire: btn(0) || btn(2) || btn(5) || btnVal(7) > 0.3,
                bomb: btn(1) || btn(3) || btn(4) || btnVal(6) > 0.3,
                pause: btn(9),
                tap: btn(0) || btn(9),
            };
        } else {
            // Non-standard (D-input / 8BitDo D-mode):
            // Typically: 0=B, 1=A, 2=Y, 3=X, 4=L, 5=R, 6=Select, 7=Start
            // Or:        0=A, 1=B, 2=X, 3=Y, etc.
            // Be generous: ANY face button = fire, shoulders = bomb
            this.gpButtons = {
                fire: btn(0) || btn(1) || btn(2) || btn(3),      // any face button
                bomb: btn(4) || btn(5) || btn(6) || btn(7),      // shoulders + select/start area
                pause: btn(7) || btn(9) || btn(11),              // start (varies)
                tap: anyPressed,                                   // any button for menu
            };
        }

        // Debug info for troubleshooting
        this.gpDebug = {
            id: gp.id,
            mapping: gp.mapping || 'none',
            axes: gp.axes.map(a => a.toFixed(2)),
            buttons: pressedList,
            numButtons: gp.buttons.length,
            numAxes: gp.axes.length,
        };
    }

    // ─── Vibration ───
    vibrate(duration = 100, weakMag = 0.3, strongMag = 0.5) {
        if (!this.gamepad || !this.gamepad.vibrationActuator) return;
        try {
            this.gamepad.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration,
                weakMagnitude: weakMag,
                strongMagnitude: strongMag,
            });
        } catch (e) { /* not all browsers support this */ }
    }

    // ─── API ───
    getMovement() {
        let dx = 0, dy = 0;

        // Keyboard
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx -= 1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) dx += 1;
        if (this.keys['ArrowUp'] || this.keys['KeyW']) dy -= 1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) dy += 1;

        // Gamepad (add to keyboard, clamped)
        dx += this.gpAxes.x;
        dy += this.gpAxes.y;
        dx = Math.max(-1, Math.min(1, dx));
        dy = Math.max(-1, Math.min(1, dy));

        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 1) { dx /= len; dy /= len; }
        }
        return { dx, dy };
    }

    isFiring() {
        return this.keys['Space'] || this.keys['KeyZ']
            || this.fireTouch
            || this.gpButtons.fire
            || (this._mouseDown && !this.isTouchDevice);
    }

    isBombing() {
        // Touch bomb tap (single trigger)
        if (this.bombTap) {
            this.bombTap = false;
            return true;
        }
        // Gamepad bomb (edge detection — only trigger on press, not hold)
        const gpBomb = this.gpButtons.bomb;
        if (gpBomb && !this.gpBombPrev) {
            this.gpBombPrev = gpBomb;
            return true;
        }
        this.gpBombPrev = gpBomb;

        // Keyboard
        if (this.keys['KeyE'] || this.keys['KeyQ']) {
            // Edge detect: consume
            const pressed = true;
            this.keys['KeyE'] = false;
            this.keys['KeyQ'] = false;
            return pressed;
        }
        return false;
    }

    isPausePressed() {
        // Keyboard ESC or P
        if (this.keys['Escape'] || this.keys['KeyP']) {
            this.keys['Escape'] = false;
            this.keys['KeyP'] = false;
            return true;
        }
        // Gamepad Start
        const gpPause = this.gpButtons.pause;
        if (gpPause && !this.gpPausePrev) {
            this.gpPausePrev = gpPause;
            return true;
        }
        this.gpPausePrev = gpPause;
        return false;
    }

    isTapOrConfirm() {
        return this.gpButtons.tap;
    }

    getTouchMove() {
        return this.moveTouch;
    }

    isPressed(code) {
        return !!this.keys[code];
    }
}
