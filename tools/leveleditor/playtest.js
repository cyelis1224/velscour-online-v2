// In-Editor Live Playtest Controller (F5): spawns a real playable Hero inside the authored scenario,
// runs full combat, pathfinding, fog-of-war, spatial triggers & Airship-style Cine cutscenes,
// and cleanly restores the Studio authoring state on Exit (Esc / F5).
import { G } from '../../src/state.js';
import { Cine } from '../../src/game/cinema.js';
import { Player } from '../../src/game/player.js';
import { newCharData, migrate } from '../../src/game/save.js';
import { SKILLS, CLASS_SKILLS } from '../../src/data/skills.js';
import { rollItem } from '../../src/data/items.js';
import { CLASSES } from '../../src/data/classes.js';
import { camera, screenDirToTile } from '../../src/core/view.js';
import { updateVfx, clearVfx } from '../../src/gfx/vfx.js';
import { dist } from '../../src/core/util.js';
import { buildCustomScenarioWorld } from '../../src/world/customscenario.js';
import { loadGearArt } from '../../src/core/gearart.js';

export class PlaytestController {
  constructor(studio) {
    this.studio = studio;
    this.active = false;
    this.classId = 'paladin';
    this.level = 20;
    this.godMode = true;
    this.savedCam = null;
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseTile = [0, 0];
  }

  async start(doc) {
    if (this.active) return;
    this.studio.cineEditor?.stopPreview();
    this.savedCam = { x: camera.x, y: camera.y, zoom: camera.zoom };
    this.active = true;
    this.keys.clear();
    await this._spawnSession(doc);
  }

  async restart(doc) {
    if (!this.active) return;
    Cine.abort();
    await this._spawnSession(doc);
  }

  async setHeroConfig({ classId, level }) {
    if (classId) this.classId = classId;
    if (level) this.level = level;
    if (this.active) await this.restart(this.studio.doc);
  }

  async _spawnSession(doc) {
    await loadGearArt(this.classId).catch(() => {});
    const depth = Math.max(1, Math.round(this.level / 2));
    const world = await buildCustomScenarioWorld(doc, {
      depth,
      revealAll: false,
      skipArrival: false,
      isEditorPreview: true,
      onTownPortalUsed: () => {
        this.studio.toast('Stepped through Town Portal — Playtest complete.');
        this.studio.togglePlaytest(false);
      },
      onExitUsed: () => {
        this.studio.toast('🏆 Entered Exit Portal! Scenario cleared.');
      },
    });

    const C = CLASSES[this.classId] || CLASSES.paladin;
    const ch = newCharData(this.classId, 'Studio Hero');
    ch.level = this.level;
    ch.equip.weapon = rollItem(this.level, { slot: 'weapon', base: C.weapon, rarity: 2 });
    ch.equip.body = rollItem(this.level, { slot: 'body', rarity: 2 });
    ch.equip.head = rollItem(this.level, { slot: 'head', rarity: 1 });
    migrate(ch);

    const clsSkills = (CLASS_SKILLS[this.classId] || []).slice(0, 4);
    clsSkills.forEach((sk, i) => {
      ch.skills[sk.id] = Math.max(1, Math.min(10, Math.ceil(this.level / 4)));
      ch.bar[i] = sk.id;
    });

    G.char = ch;
    const player = new Player(ch);
    const [sx, sy] = doc.entities.start || [world.map.w / 2, world.map.h / 2];
    [player.x, player.y] = world.map.nudge(sx, sy, player.r);
    world.player = player;
    world.add(player);
    world.map.reveal(player.x, player.y, 14);

    G.world = world;
    G.player = player;
    G.godMode = !!this.godMode;
    G.hurtFlash = 0;
    G.flash = 0;
    G.hitStop = 0;
    this.studio.world = world;

    camera.computeZoom();
    camera.follow(player.x, player.y, 1, true);
    world.cave?.frame?.(0.016);
    world.tower?.frame?.(0.016);
  }

  async stop() {
    if (!this.active) return;
    this.active = false;
    this.keys.clear();
    this.mouseDown = false;
    Cine.abort();
    clearVfx();
    G.player = null;
    G.godMode = false;
    G.hurtFlash = 0;
    G.flash = 0;
    G.hitStop = 0;
    camera.shakeAmt = 0;
    camera.shakeX = 0;
    camera.shakeY = 0;
    await this.studio.rebuildWorld({ keepCamera: true });
    if (this.savedCam) {
      camera.x = this.savedCam.x;
      camera.y = this.savedCam.y;
      camera.zoom = this.savedCam.zoom;
      this.savedCam = null;
    }
  }

  onKeyDown(e) {
    if (!this.active) return false;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      this.studio.togglePlaytest(false);
      return true;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      this.keys.add(k);
      return true;
    }
    const p = this.studio.world?.player;
    if (!p || p.dead || G.cine) return false;

    if (['1', '2', '3', '4'].includes(k)) {
      const slot = Number(k) - 1;
      const skId = p.char.bar[slot];
      const sk = skId && SKILLS[skId];
      if (sk) {
        const foe = this.studio.world.nearestHostile('player', this.mouseTile[0], this.mouseTile[1], 3.5);
        p.tryUseSkill(sk, foe ? foe.x : this.mouseTile[0], foe ? foe.y : this.mouseTile[1], foe || null);
      }
      return true;
    }
    if (k === 'e' || k === ' ') {
      this._tryInteractNearest(p);
      return true;
    }
    return false;
  }

  onKeyUp(e) {
    if (!this.active) return;
    this.keys.delete(e.key.toLowerCase());
  }

  onPointerDown(e, tx, ty) {
    if (!this.active) return;
    this.mouseTile = [tx, ty];
    const world = this.studio.world;
    const p = world?.player;
    if (!p || p.dead || G.cine) return;

    if (e.button === 2) {
      const sk = SKILLS[p.char.bar[1] || p.char.bar[0]];
      const foe = world.nearestHostile('player', tx, ty, 2.5);
      if (sk) p.tryUseSkill(sk, foe ? foe.x : tx, foe ? foe.y : ty, foe || null);
      return;
    }

    // Check interactables / portals / NPCs near click
    for (const po of world.portals || []) {
      if (dist(tx, ty, po.x, po.y) < 1.6) {
        if (dist(p.x, p.y, po.x, po.y) <= (po.reach || 1.8)) po.use();
        else p.moveTarget = [po.x, po.y];
        return;
      }
    }
    for (const ch of world.chests || []) {
      if (!ch.opened && dist(tx, ty, ch.x, ch.y) < 1.5) {
        if (dist(p.x, p.y, ch.x, ch.y) <= 2.0) ch.use();
        else p.moveTarget = [ch.x, ch.y];
        return;
      }
    }
    for (const n of world.npcs || []) {
      if (dist(tx, ty, n.x, n.y) < 1.5) {
        if (dist(p.x, p.y, n.x, n.y) <= 2.4) n.onUse?.();
        else p.moveTarget = [n.x, n.y];
        return;
      }
    }

    const foe = world.nearestHostile('player', tx, ty, 1.8);
    if (foe) {
      const sk = SKILLS[p.char.bar[0]];
      if (sk) p.tryUseSkill(sk, foe.x, foe.y, foe);
      return;
    }

    this.mouseDown = true;
    p.moveTarget = [tx, ty];
    p.path = world.map.findPath(p.x, p.y, tx, ty, 6000);
  }

  onPointerMove(tx, ty) {
    if (!this.active) return;
    this.mouseTile = [tx, ty];
    const p = this.studio.world?.player;
    if (this.mouseDown && p && !p.dead && !G.cine) {
      p.moveTarget = [tx, ty];
    }
  }

  onPointerUp() {
    this.mouseDown = false;
  }

  _tryInteractNearest(p) {
    const world = this.studio.world;
    for (const po of world.portals || []) {
      if (dist(p.x, p.y, po.x, po.y) <= 2.2) { po.use(); return; }
    }
    for (const ch of world.chests || []) {
      if (!ch.opened && dist(p.x, p.y, ch.x, ch.y) <= 2.2) { ch.use(); return; }
    }
    for (const n of world.npcs || []) {
      if (dist(p.x, p.y, n.x, n.y) <= 2.6) { n.onUse?.(); return; }
    }
  }

  update(dt) {
    const world = this.studio.world;
    if (!this.active || !world) return;
    const p = world.player;

    G.godMode = !!this.godMode;
    if (this.godMode) {
      G.hurtFlash = 0;
    } else if (G.hurtFlash > 0) {
      G.hurtFlash = Math.max(0, G.hurtFlash - dt * 2.5);
    }
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 3.5);

    Cine.update(dt);
    camera.update(dt);

    if (G.cine) {
      world.customDirector?.tickScripted(dt);
      updateVfx(dt);
      world.cave?.frame?.(dt);
      world.tower?.frame?.(dt);
      return;
    }

    if (p && !p.dead) {
      let sx = 0, sy = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) sy -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) sy += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) sx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) sx += 1;
      if (sx || sy) {
        const [vx, vy] = screenDirToTile(sx, sy);
        const len = Math.hypot(vx, vy) || 1;
        p.moveVec = [vx / len, vy / len];
      } else {
        p.moveVec = [0, 0];
      }

      if (this.godMode) {
        p.hp = p.maxHp;
        p.mana = p.maxMana;
        if (p.classId === 'barbarian') p.rage = Math.max(p.rage, 60);
      }
    }

    world.update(dt);
    updateVfx(dt);
    if (p && !p.dead) {
      world.map.reveal(p.x, p.y, 14);
      camera.follow(p.x, p.y, dt);
    }
    world.customDirector?.update(dt);
    world.cave?.frame?.(dt);
    world.tower?.frame?.(dt);
  }

  drawPlaytestHud(ctx) {
    const world = this.studio.world;
    const p = world?.player;
    if (!this.active || !p || G.cine) return;
    const dpr = G.dpr || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Compact HUD card bottom-left
    const x = 14, y = G.H - 76, w = 310, h = 62;
    ctx.fillStyle = 'rgba(11, 7, 6, 0.86)';
    ctx.strokeStyle = '#5c4424';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // HP & Mana bars
    const hpPct = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
    const mpPct = Math.max(0, Math.min(1, p.mana / Math.max(1, p.maxMana)));
    ctx.fillStyle = '#3a110e'; ctx.fillRect(x + 10, y + 10, 140, 10);
    ctx.fillStyle = '#c93428'; ctx.fillRect(x + 10, y + 10, 140 * hpPct, 10);
    ctx.fillStyle = '#101d3b'; ctx.fillRect(x + 160, y + 10, 140, 10);
    ctx.fillStyle = '#3674d9'; ctx.fillRect(x + 160, y + 10, 140 * mpPct, 10);

    // Objective text
    ctx.font = 'bold 12px "Cinzel", serif';
    ctx.fillStyle = '#ffe2a0';
    ctx.textAlign = 'left';
    const desc = world.customDirector?.description || docTitleFallback(world);
    ctx.fillText(`🎯 ${desc}`.slice(0, 44), x + 10, y + 36);

    // Skill bar hints
    ctx.font = '11px "Alegreya Sans", sans-serif';
    ctx.fillStyle = '#a8977c';
    const skillsTxt = p.char.bar.slice(0, 4).map((id, i) => id && SKILLS[id] ? `[${i + 1}] ${SKILLS[id].name}` : '').filter(Boolean).join(' · ');
    ctx.fillText(skillsTxt.slice(0, 54), x + 10, y + 52);

    ctx.restore();
  }
}

function docTitleFallback(world) {
  return world?.overworldScenario?.title || 'Explore & Test Scenario';
}
