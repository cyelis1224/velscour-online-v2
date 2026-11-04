// ============================================================================
// DAGYR ONLINE - ENGAGING GOTHIC LOADING SCREEN & SPAWN CONTROLLER
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

  init() {
    if (this.el) return;
    this.el = document.getElementById('loading');
    this.titleEl = document.getElementById('loading-title');
    this.subEl = document.getElementById('loading-sub');
    this.barEl = document.getElementById('loading-bar');
    this.fillEl = document.getElementById('loading-fill');
    this.percentEl = document.getElementById('loading-percent');
    this.textEl = document.getElementById('loading-text');
    this.tipTextEl = document.getElementById('loading-tip-text');
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
      this.titleEl.textContent = opts.title || 'DAGYR ONLINE';
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
        G.loading = false;
        if (G.game) G.game.isLoading = false;
        resolve();
      }, 350);
    });
  }
};

if (typeof window !== 'undefined') {
  window.LoadingScreen = LoadingScreen;
}

