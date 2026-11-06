// ============================================================================
// VELSCOUR ONLINE - ENGAGING GOTHIC LOADING SCREEN & SPAWN CONTROLLER
// Animated occult runic crest, lore tips carousel, smooth progress bar, and
// player spawn coordination.
// ============================================================================
import { G } from '../state.js';

export const LORE_TIPS = [
  "The deeper you delve, the stronger the Defiance becomes. Slay floor champions to shatter the wall and open the way.",
  "Hold Shift to attack in place, or configure Skill Macros to automatically maintain your buffs while near enemies.",
  "Sealed legendary items contain unrolled latent power. Break their seals in town before venturing into combat.",
  "Herrington Hollow's Reliquary is shared across all your heroes. Stash high-tier gear for your other characters.",
  "The Jewel Box in town safely stores all your gems and runes without taking up precious inventory space.",
  "Ancient Shrines bestow immense temporary blessings. Seek them out before confronting dangerous raid bosses.",
  "Party members share experience, unsealed depths, and loot drops while adventuring together in online rooms.",
  "Gilded critters flee on sight, but reward immense gold and experience to any hero swift enough to catch them.",
  "Ultimate power charges with every foe slain. Unleash your class Ultimate when overwhelmed by swarms.",
  "Elemental resistances dramatically reduce fire, frost, lightning, and void damage from abyssal elites.",
  "The Eternal Breach holds ever-escalating floors. Defeat the Breach Keeper to unseal deeper depths.",
  "Abyssal Rifts challenge heroes against the clock. Faster completions unlock higher tiers and greater rewards.",
  "The town's contact skull whispers words from the abyss. Certain ancient phrases may invoke forgotten secrets.",
  "Equip vanity armor and helmets in your Character Sheet to customize your look without sacrificing combat stats.",
  "Bards compose their own music sheets in Herrington Hollow. Equipped sheets play live melodies during battle.",
  "Potions can be refilled at town wells. Always ensure your belt is stocked before descending into darkness.",
  "Monsters with radiant golden auras are Champions. They possess dangerous affixes but carry rare treasure.",
  "Town Commissions offer lucrative bounties for slaying specific monsters or collecting rare materials.",
  "Death in Herrington Hollow does not erase your hero, but Defiance builds with every fall in the deep.",
  "Three Abyssal Keys unlock the throne of Velscour Unbound. Only the most fortified heroes survive the rematch.",
  "Socket gems into socketed weapons and armor to boost attributes, critical damage, and survivability.",
  "Use the /w and /r chat commands to whisper and reply to fellow adventurers across any game room.",
  "Overworld biomes like the Sea of Sand and Castle Hollow feature massive multi-phase raid encounters.",
  "Every class possesses distinct primary attributes. Strength, Dexterity, and Intellect empower unique archetypes."
];

export const LoadingScreen = {
  el: null,
  titleEl: null,
  subEl: null,
  barEl: null,
  fillEl: null,
  percentEl: null,
  textEl: null,
  tipTextEl: null,
  tipInterval: null,
  lastTipIdx: -1,

  eyeCanvas: null,
  eyeCtx: null,
  eyeRaf: null,
  eyeState: null,
  _onPointerMove: null,

  init() {
    if (!this.el) {
      this.el = document.getElementById('loading');
      this.titleEl = document.getElementById('loading-title');
      this.subEl = document.getElementById('loading-sub');
      this.barEl = document.getElementById('loading-bar');
      this.fillEl = document.getElementById('loading-fill');
      this.percentEl = document.getElementById('loading-percent');
      this.textEl = document.getElementById('loading-text');
      this.tipTextEl = document.getElementById('loading-tip-text');
    }
    this.initEye();
  },

  initEye() {
    if (!this.eyeCanvas) {
      this.eyeCanvas = document.getElementById('loading-eye');
      if (this.eyeCanvas) {
        this.eyeCtx = this.eyeCanvas.getContext('2d');
        if (this.eyeCtx) {
          this.eyeCtx.imageSmoothingEnabled = false;
        }
      }
    }

    if (!this.eyeState && typeof window !== 'undefined') {
      this.eyeState = {
        pointer: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 },
        hasPointer: false,
        gaze: { x: 0, y: 0 },
        dartTimer: 1.5,
        dartDuration: 0,
        dartOffset: null,
        blinkTimer: 2.2,
        blinkProgress: 0,
        lastTime: performance.now(),
      };

      this._onPointerMove = (e) => {
        if (!this.eyeState) return;
        this.eyeState.pointer.x = e.clientX;
        this.eyeState.pointer.y = e.clientY;
        this.eyeState.hasPointer = true;
      };
      window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    }

    if (this.el && !this.el.classList.contains('hidden')) {
      this.startEyeLoop();
    }
  },

  startEyeLoop() {
    if (this.eyeRaf) return;
    if (!this.eyeState) this.initEye();
    if (this.eyeState) this.eyeState.lastTime = performance.now();

    const loop = (now) => {
      if (!this.el || this.el.classList.contains('hidden')) {
        this.eyeRaf = null;
        return;
      }
      const dt = Math.min(0.1, (now - (this.eyeState?.lastTime || now)) / 1000);
      if (this.eyeState) this.eyeState.lastTime = now;
      this.updateAndDrawEye(dt);
      this.eyeRaf = requestAnimationFrame(loop);
    };
    this.eyeRaf = requestAnimationFrame(loop);
  },

  stopEyeLoop() {
    if (this.eyeRaf) {
      cancelAnimationFrame(this.eyeRaf);
      this.eyeRaf = null;
    }
  },

  updateAndDrawEye(dt) {
    const s = this.eyeState;
    const cv = this.eyeCanvas;
    const ctx = this.eyeCtx;
    if (!s || !cv || !ctx) return;

    // 1. Cursor / pointer tracking
    const rect = cv.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;

    let targetGx = 0, targetGy = 0;
    if (s.hasPointer) {
      const dx = s.pointer.x - cx;
      const dy = s.pointer.y - cy;
      const spanX = Math.max(140, window.innerWidth * 0.42);
      const spanY = Math.max(140, window.innerHeight * 0.42);
      targetGx = Math.max(-1, Math.min(1, dx / spanX));
      targetGy = Math.max(-1, Math.min(1, dy / spanY));
    }

    // Occasional subtle demonic saccadic dart
    s.dartTimer -= dt;
    if (s.dartTimer <= 0) {
      s.dartTimer = 1.2 + Math.random() * 2.4;
      s.dartOffset = Math.random() < 0.42 ? [(Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3] : null;
      s.dartDuration = 0.22;
    }
    if (s.dartDuration > 0) {
      s.dartDuration -= dt;
      if (s.dartOffset) {
        targetGx = Math.max(-1, Math.min(1, targetGx + s.dartOffset[0]));
        targetGy = Math.max(-1, Math.min(1, targetGy + s.dartOffset[1]));
      }
    }

    // Smoothly interpolate gaze position
    const gazeSpeed = s.dartDuration > 0 ? 12 : 7.5;
    s.gaze.x += (targetGx - s.gaze.x) * Math.min(1, dt * gazeSpeed);
    s.gaze.y += (targetGy - s.gaze.y) * Math.min(1, dt * gazeSpeed);

    // 2. Periodic natural blink (~0.18s) - eye stays open and never fades out
    s.blinkTimer -= dt;
    let lidOpen = 1.0;
    if (s.blinkTimer <= 0) {
      s.blinkProgress += dt;
      const dur = 0.18;
      if (s.blinkProgress < dur) {
        const p = s.blinkProgress / dur;
        lidOpen = Math.abs(p - 0.5) * 2; // 1 -> 0 -> 1 V-curve
        lidOpen = Math.pow(lidOpen, 0.72);
      } else {
        s.blinkProgress = 0;
        // Schedule next blink in 2.5 - 5.0 seconds (with 20% chance of double blink)
        s.blinkTimer = Math.random() < 0.2 ? 0.35 : (2.5 + Math.random() * 2.8);
        lidOpen = 1.0;
      }
    }

    // 3. Render pixelated eye onto chunky 36x24 canvas
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);

    const midX = W * 0.5;
    const midY = H * 0.5;
    const ew = 24;
    const eh = 12;
    const hw = ew * 0.5;
    const hh = Math.max(0.5, (eh * 0.5) * lidOpen);

    // Ambient fiery red bloom glow
    if (lidOpen > 0.1) {
      const glow = ctx.createRadialGradient(midX, midY, 1, midX, midY, hw * 1.4);
      glow.addColorStop(0, `rgba(226, 80, 42, ${(0.45 * lidOpen).toFixed(3)})`);
      glow.addColorStop(0.5, `rgba(180, 20, 10, ${(0.2 * lidOpen).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(midX, midY, hw * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (lidOpen <= 0.05) {
      // Eyelid line when closed
      ctx.strokeStyle = '#180202';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(midX - hw, midY);
      ctx.lineTo(midX + hw, midY);
      ctx.stroke();
      return;
    }

    ctx.save();
    ctx.translate(midX, midY);

    // Almond eye socket
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    ctx.quadraticCurveTo(0, -hh * 2, hw, 0);
    ctx.quadraticCurveTo(0, hh * 2, -hw, 0);
    ctx.closePath();

    // Iris fiery red gradient (matching titlefx.js)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, hw);
    g.addColorStop(0, 'hsl(20, 100%, 65%)');     // incandescent fiery orange
    g.addColorStop(0.42, 'hsl(4, 100%, 46%)');   // demonic blood crimson
    g.addColorStop(1, 'hsl(356, 95%, 16%)');     // deep wine abyssal border
    ctx.fillStyle = g;
    ctx.fill();

    // Clip to socket for pupil rendering
    ctx.save();
    ctx.clip();

    const px = s.gaze.x * hw * 0.45;
    const py = s.gaze.y * hh * 0.5;

    // Golden pupil aura
    ctx.fillStyle = '#ffd27a';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(px, py, ew * 0.22, eh * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Demonic slit pupil
    ctx.fillStyle = '#050000';
    ctx.beginPath();
    ctx.ellipse(px, py, Math.max(0.75, ew * 0.08), eh * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Specular wet pixel glint
    ctx.fillStyle = 'rgba(255, 245, 230, 0.9)';
    ctx.fillRect(Math.round(px - ew * 0.12), Math.round(py - eh * 0.22), 1, 1);

    ctx.restore();

    // Eyelid edge outline
    ctx.strokeStyle = 'rgba(18, 2, 2, 0.95)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  },

  getRandomTip() {
    let idx = Math.floor(Math.random() * LORE_TIPS.length);
    if (idx === this.lastTipIdx && LORE_TIPS.length > 1) {
      idx = (idx + 1) % LORE_TIPS.length;
    }
    this.lastTipIdx = idx;
    return LORE_TIPS[idx];
  },

  show(opts = {}) {
    this.init();
    if (!this.el) return;

    if (this.titleEl) {
      this.titleEl.textContent = opts.title || 'VELSCOUR ONLINE';
    }
    if (this.subEl) {
      this.subEl.textContent = opts.subtitle || 'The Abyss Awaits';
    }
    if (this.textEl) {
      this.textEl.innerHTML = opts.text || 'Preparing the descent&hellip;';
    }
    if (this.tipTextEl) {
      this.tipTextEl.textContent = opts.tip || this.getRandomTip();
    }

    this.setProgress(opts.progress || 0);

    this.el.classList.remove('hidden', 'fading');
    this.el.style.opacity = '1';
    this.el.style.visibility = 'visible';
    this.startEyeLoop();

    // Cycle tips if loading takes a long time
    if (this.tipInterval) clearInterval(this.tipInterval);
    this.tipInterval = setInterval(() => {
      if (this.tipTextEl && !this.el.classList.contains('hidden')) {
        this.tipTextEl.style.opacity = '0';
        setTimeout(() => {
          if (this.tipTextEl) {
            this.tipTextEl.textContent = this.getRandomTip();
            this.tipTextEl.style.opacity = '1';
          }
        }, 300);
      }
    }, 7000);

    G.loading = true;
    if (G.game) G.game.isLoading = true;
    if (G.player) {
      G.player.spawned = false;
      G.player.targetable = false;
      G.player.invuln = 1e9;
      G.player.alpha = 0;
    }
  },

  setProgress(pct, text = null) {
    this.init();
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (this.fillEl) {
      this.fillEl.style.width = `${clamped}%`;
    }
    if (this.percentEl) {
      this.percentEl.textContent = `${clamped}%`;
    }
    if (text && this.textEl) {
      this.textEl.innerHTML = text;
    }
  },

  async hide() {
    this.init();
    if (this.tipInterval) {
      clearInterval(this.tipInterval);
      this.tipInterval = null;
    }
    if (!this.el) return;

    this.setProgress(100);

    return new Promise((resolve) => {
      this.el.classList.add('fading');
      setTimeout(() => {
        this.el.classList.add('hidden');
        this.el.classList.remove('fading');
        this.el.style.opacity = '';
        this.el.style.visibility = '';
        this.stopEyeLoop();
        G.loading = false;
        if (G.game) G.game.isLoading = false;
        resolve();
      }, 350);
    });
  }
};

if (typeof window !== 'undefined') {
  window.LoadingScreen = LoadingScreen;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LoadingScreen.init());
  } else {
    LoadingScreen.init();
  }
}

