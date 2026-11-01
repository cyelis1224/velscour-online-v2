// Class Ultimates High-Fidelity Visual Effects
// Implements bespoke multi-phase animations for each of the 9 class ultimates:
// - Paladin: Consecrated ground sigil, cathedral god-rays, 4 cardinal cross beams
// - Barbarian: Jagged tectonic magma fissures, erupting rock slabs, volcanic geysers
// - Lancer: Runic lock crosshair, supersonic celestial lightning lance, branching electric arcs
// - Ranger: Woodland vortex, staggered skyfall arrow storm, swooping spirit raptors
// - Gunner: Red flare beacon, heavy siege mortar shell drop, concussive mushroom cloud & shrapnel
// - Bard: Spiraling musical staff lines, treble clefs, glass-shattering acoustic pressure rings
// - Wizard: Gravitational cosmic singularity collapse, 8-point diffraction starburst supernova
// - Necromancer: Abyssal soul void, erupting ivory bone pikes, grasping skeletal arms, soul siphon
// - Carrion Witch: Occult burning pentagram, shrieking crow cyclone, bubbling caustic bile burst
import { G } from '../state.js';
import { isoX, isoY, HW, HH } from '../core/view.js';
import { rand, randi, TAU, clamp } from '../core/util.js';
import { addEffect, spawn, burst, sparkle, smoke, gibs, addDecal, glowSprite } from './vfx.js';

// -----------------------------------------------------------------------------
// 1. PALADIN: Consecrated Holy Sigil & Cathedral Ray Cascade
// -----------------------------------------------------------------------------
export class PaladinHolySigil {
  constructor(x, y, r, dur = 2.2) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'floor', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.min(1, this.t / 0.25) * Math.max(0, 1 - (k - 0.6) / 0.4);
    if (alpha <= 0) return;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.r * HW * 1.41;
    const rot = this.t * 0.5;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, HH / HW);

    // Consecrated golden floor aura
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
    grad.addColorStop(0, `rgba(255, 230, 140, ${0.45 * alpha})`);
    grad.addColorStop(0.65, `rgba(255, 180, 50, ${0.25 * alpha})`);
    grad.addColorStop(1, 'rgba(255, 150, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.05, 0, TAU);
    ctx.fill();

    // Ornate outer and inner celestial rings
    ctx.strokeStyle = `rgba(255, 240, 180, ${0.85 * alpha})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.arc(0, 0, R * 0.82, 0, TAU);
    ctx.stroke();

    // Sacred Templar Cross arms radiating from center
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * TAU) / 4;
      const cos = Math.cos(a), sin = Math.sin(a);
      ctx.moveTo(cos * R * 0.15, sin * R * 0.15);
      ctx.lineTo(cos * R * 0.78, sin * R * 0.78);
      // Crossbar
      const perpCos = -sin, perpSin = cos;
      const midR = R * 0.55;
      ctx.moveTo(cos * midR - perpCos * R * 0.16, sin * midR - perpSin * R * 0.16);
      ctx.lineTo(cos * midR + perpCos * R * 0.16, sin * midR + perpSin * R * 0.16);
    }
    ctx.stroke();

    // Ancient counter-rotating rune ticks between rings
    ctx.strokeStyle = `rgba(255, 215, 90, ${0.75 * alpha})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = -rot * 0.7 + (i * TAU) / 16;
      ctx.moveTo(Math.cos(a) * R * 0.84, Math.sin(a) * R * 0.84);
      ctx.lineTo(Math.cos(a + 0.04) * R * 0.96, Math.sin(a + 0.04) * R * 0.96);
    }
    ctx.stroke();

    ctx.restore();
  }
}

export class PaladinCathedralShaft {
  constructor(x, y, r, dur = 1.2) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'top', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.min(1, this.t / 0.12) * Math.max(0, 1 - Math.pow(k, 2));
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const w = this.r * HW * 0.85 * (1 - k * 0.3);
    const top = py - 700;

    ctx.save();
    // Radiant core light shaft
    const g = ctx.createLinearGradient(px, top, px, py);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.35, `rgba(255, 240, 170, ${0.45 * alpha})`);
    g.addColorStop(0.85, `rgba(255, 210, 80, ${0.75 * alpha})`);
    g.addColorStop(1, `rgba(255, 255, 255, ${0.95 * alpha})`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(px - w, top);
    ctx.lineTo(px + w, top);
    ctx.ellipse(px, py, w, w * HH / HW, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();

    // Pure white central core beam
    const coreW = w * 0.35;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(px - coreW, top);
    ctx.lineTo(px + coreW, top);
    ctx.ellipse(px, py, coreW, coreW * HH / HW, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// 2. BARBARIAN: Tectonic Magma Fissures & Erupting Rock Monoliths
// -----------------------------------------------------------------------------
export class BarbarianTectonicFissure {
  constructor(x, y, r, dur = 2.4) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'floor', add: true });
    // Generate organic branching fracture lines once
    this.fissures = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      const baseAng = (i / count) * TAU + rand(-0.25, 0.25);
      const pts = [[0, 0]];
      let curDist = 0;
      let curAng = baseAng;
      const targetDist = this.r * HW * 1.35 * rand(0.7, 1.0);
      while (curDist < targetDist) {
        curDist += rand(14, 28);
        curAng += rand(-0.35, 0.35);
        pts.push([Math.cos(curAng) * curDist, Math.sin(curAng) * curDist]);
      }
      this.fissures.push(pts);
    }
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const growth = Math.min(1, this.t / 0.18);
    const alpha = growth * Math.max(0, 1 - (k - 0.5) / 0.5);
    if (alpha <= 0) return;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, HH / HW);

    // Deep glowing subterranean magma bloom under cracks
    for (let pass = 0; pass < 3; pass++) {
      ctx.lineWidth = pass === 0 ? 8 : pass === 1 ? 4 : 1.8;
      ctx.strokeStyle = pass === 0
        ? `rgba(180, 30, 0, ${0.65 * alpha})`
        : pass === 1
        ? `rgba(255, 100, 20, ${0.9 * alpha})`
        : `rgba(255, 235, 120, ${1.0 * alpha})`;

      ctx.beginPath();
      for (const pts of this.fissures) {
        const n = Math.floor(pts.length * growth);
        if (n < 2) continue;
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < n; j++) {
          ctx.lineTo(pts[j][0], pts[j][1]);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class BarbarianStoneSpikes {
  constructor(x, y, r, dur = 1.4) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'top', add: true });
    // Jagged earthen slabs erupting from the ground
    this.slabs = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rand(-0.2, 0.2);
      const dist = rand(0.35, r * 0.85);
      this.slabs.push({
        ox: Math.cos(a) * dist,
        oy: Math.sin(a) * dist,
        maxH: rand(45, 95),
        w: rand(16, 28),
        tilt: rand(-0.4, 0.4),
        delay: rand(0, 0.08)
      });
    }
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    ctx.save();

    for (const slab of this.slabs) {
      const st = Math.max(0, this.t - slab.delay);
      const riseProgress = Math.min(1, st / 0.12);
      const fadeProgress = Math.max(0, 1 - (k - 0.5) / 0.5);
      if (riseProgress <= 0 || fadeProgress <= 0) continue;

      const px = isoX(this.x + slab.ox, this.y + slab.oy);
      const py = isoY(this.x + slab.ox, this.y + slab.oy);
      const curH = slab.maxH * Math.sin(riseProgress * Math.PI * 0.5);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(slab.tilt);

      // Shaded 3D stone monolith
      const grad = ctx.createLinearGradient(-slab.w * 0.5, -curH, slab.w * 0.5, 0);
      grad.addColorStop(0, '#f07828');
      grad.addColorStop(0.3, '#783818');
      grad.addColorStop(0.7, '#381c10');
      grad.addColorStop(1, '#180a06');

      ctx.fillStyle = grad;
      ctx.strokeStyle = '#ffa040';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(0, -curH);
      ctx.lineTo(slab.w * 0.5, -curH * 0.3);
      ctx.lineTo(slab.w * 0.4, 4);
      ctx.lineTo(-slab.w * 0.4, 4);
      ctx.lineTo(-slab.w * 0.5, -curH * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// 3. LANCER: Runic Crosshair Lock & Supersonic Celestial Javelin
// -----------------------------------------------------------------------------
export class LancerRunicLock {
  constructor(x, y, r, dur = 1.6) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'floor', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.min(1, this.t / 0.15) * Math.max(0, 1 - (k - 0.6) / 0.4);
    if (alpha <= 0) return;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.r * HW * 1.35;
    const rot = this.t * 1.5;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, HH / HW);

    // Glowing electric blue floor reticle
    ctx.strokeStyle = `rgba(130, 220, 255, ${0.85 * alpha})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.arc(0, 0, R * 0.55, 0, TAU);
    ctx.stroke();

    // 4 Locking High-Tech Chevrons
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * alpha})`;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * TAU) / 4;
      const cos = Math.cos(a), sin = Math.sin(a);
      const tipR = R * 0.9;
      const wingR = R * 1.08;
      ctx.moveTo(Math.cos(a - 0.12) * wingR, Math.sin(a - 0.12) * wingR);
      ctx.lineTo(cos * tipR, sin * tipR);
      ctx.lineTo(Math.cos(a + 0.12) * wingR, Math.sin(a + 0.12) * wingR);
    }
    ctx.stroke();

    ctx.restore();
  }
}

export class LancerCelestialJavelin {
  constructor(x, y, dur = 0.9) {
    Object.assign(this, { x, y, dur, t: 0, layer: 'top', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);

    // Plunges straight down from 750px in the first 0.28s, then impaled into ground
    const plungeT = Math.min(1, this.t / 0.28);
    const dropY = (1 - Math.pow(plungeT, 3)) * 750;
    const spearTipY = py - dropY;
    const alpha = Math.max(0, 1 - (k - 0.5) / 0.5);

    ctx.save();
    ctx.translate(px, spearTipY);

    // Supersonic motion blur / contrail while falling
    if (dropY > 5) {
      const trail = ctx.createLinearGradient(0, -180, 0, 0);
      trail.addColorStop(0, 'rgba(160, 230, 255, 0)');
      trail.addColorStop(0.7, 'rgba(120, 210, 255, 0.45)');
      trail.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
      ctx.fillStyle = trail;
      ctx.fillRect(-5, -180, 10, 180);
    }

    // Titanic Winged Lightning Spear
    const len = 90;
    const spear = ctx.createLinearGradient(-10, -len, 10, 0);
    spear.addColorStop(0, '#ffffff');
    spear.addColorStop(0.3, '#a0e4ff');
    spear.addColorStop(0.7, '#3888d8');
    spear.addColorStop(1, '#0e3868');

    ctx.fillStyle = spear;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, 0); // Spear tip
    ctx.lineTo(12, -len * 0.45);
    ctx.lineTo(6, -len * 0.4);
    ctx.lineTo(3, -len);
    ctx.lineTo(-3, -len);
    ctx.lineTo(-6, -len * 0.4);
    ctx.lineTo(-12, -len * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// 4. RANGER: Woodland Wind Vortex & Skyfall Arrow Rain + Raptors
// -----------------------------------------------------------------------------
export class RangerWindVortex {
  constructor(x, y, r, dur = 2.0) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'floor', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.min(1, this.t / 0.2) * Math.max(0, 1 - (k - 0.6) / 0.4);
    if (alpha <= 0) return;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.r * HW * 1.4;
    const rot = this.t * 3.0;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, HH / HW);

    // Spiraling wind trails
    ctx.strokeStyle = `rgba(130, 240, 90, ${0.65 * alpha})`;
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) {
      const startA = rot + (i * TAU) / 4;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.85, startA, startA + 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class RangerArrowRain {
  constructor(x, y, r, dur = 1.3) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'top', add: true });
    // 40 falling arrows staggered in time
    this.arrows = [];
    for (let i = 0; i < 42; i++) {
      const a = rand(TAU), dist = rand(0.2, r * 0.9);
      this.arrows.push({
        ox: Math.cos(a) * dist,
        oy: Math.sin(a) * dist,
        startT: rand(0, 0.45),
        fallDur: rand(0.2, 0.28),
        speed: rand(600, 850),
        angle: 1.15 + rand(-0.15, 0.15),
        stuck: false
      });
    }
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    ctx.save();
    for (const arr of this.arrows) {
      if (this.t < arr.startT) continue;
      const life = this.t - arr.startT;
      const groundX = isoX(this.x + arr.ox, this.y + arr.oy);
      const groundY = isoY(this.x + arr.ox, this.y + arr.oy);

      if (life < arr.fallDur) {
        // Falling through air
        const dropFraction = life / arr.fallDur;
        const curY = groundY - (1 - dropFraction) * 450;
        const curX = groundX - (1 - dropFraction) * 120;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(curX, curY);
        ctx.lineTo(curX + 18, curY + 45);
        ctx.stroke();

        ctx.strokeStyle = '#7ad850';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(curX - 6, curY - 14);
        ctx.lineTo(curX, curY);
        ctx.stroke();
      } else {
        // Stuck in ground vibrating
        const fade = Math.max(0, 1 - (this.t - arr.startT - arr.fallDur) / 0.5);
        if (fade <= 0) continue;
        ctx.strokeStyle = `rgba(230, 220, 200, ${fade})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(groundX, groundY);
        ctx.lineTo(groundX - 10, groundY - 26);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// 5. GUNNER: Red Flare Beacon & Siege Artillery High-Explosive Shell
// -----------------------------------------------------------------------------
export class GunnerFlareBeacon {
  constructor(x, y, r, dur = 2.0) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'floor', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.max(0, 1 - (k - 0.6) / 0.4);
    if (alpha <= 0) return;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.r * HW * 1.35;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, HH / HW);

    // Flashing red artillery targeting ring
    const flash = 0.6 + 0.4 * Math.sin(this.t * 16);
    ctx.strokeStyle = `rgba(255, 40, 20, ${flash * alpha})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();

    // Red flare core on the ground
    ctx.fillStyle = `rgba(255, 60, 30, ${alpha})`;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}

export class GunnerArtilleryShell {
  constructor(x, y, dur = 0.8) {
    Object.assign(this, { x, y, dur, t: 0, layer: 'top', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const plungeT = Math.min(1, this.t / 0.35);
    if (plungeT >= 1) return; // Exploded!

    const dropH = (1 - Math.pow(plungeT, 2)) * 650;
    const shellY = py - dropH;
    const shellX = px - dropH * 0.25;

    ctx.save();
    ctx.translate(shellX, shellY);
    ctx.rotate(0.95);

    // Heavy black-iron artillery shell
    const grad = ctx.createLinearGradient(-8, -25, 8, 25);
    grad.addColorStop(0, '#f0d060'); // Glowing aerodynamic tip
    grad.addColorStop(0.3, '#78828a');
    grad.addColorStop(1, '#242a30');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(8, 6);
    ctx.lineTo(8, -18);
    ctx.lineTo(-8, -18);
    ctx.lineTo(-8, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// 6. BARD: Spiraling Musical Staff Lines & Acoustic Shockwave
// -----------------------------------------------------------------------------
export class BardStaffSpiral {
  constructor(x, y, r, dur = 2.2) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'floor', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.min(1, this.t / 0.2) * Math.max(0, 1 - (k - 0.6) / 0.4);
    if (alpha <= 0) return;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.r * HW * 1.35;
    const rot = this.t * 0.8;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, HH / HW);

    // 5 Concentric Golden Musical Staff Lines
    ctx.strokeStyle = `rgba(255, 180, 80, ${0.75 * alpha})`;
    ctx.lineWidth = 1.6;
    for (let line = 0; line < 5; line++) {
      const curR = R * (0.55 + line * 0.1);
      ctx.beginPath();
      ctx.arc(0, 0, curR, 0, TAU);
      ctx.stroke();
    }

    // Glowing Treble Clef and Musical Notes etched along staff
    ctx.fillStyle = `rgba(255, 110, 170, ${0.9 * alpha})`;
    ctx.font = `bold ${Math.round(20)}px serif`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 6; i++) {
      const a = rot + (i * TAU) / 6;
      const noteR = R * 0.75;
      const nx = Math.cos(a) * noteR;
      const ny = Math.sin(a) * noteR;
      ctx.fillText(i % 2 === 0 ? '𝄞' : '𝄢', nx, ny);
    }
    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// 7. WIZARD: Cosmic Singularity Collapse & Supernova Diffraction Blast
// -----------------------------------------------------------------------------
export class WizardSingularity {
  constructor(x, y, r, dur = 1.0) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'top', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.r * HW * 1.35;

    ctx.save();
    ctx.translate(px, py);

    // Phase 1: Inward gravitational collapse (t < 0.38)
    if (this.t < 0.38) {
      const inK = this.t / 0.38;
      const curR = R * (1 - Math.pow(inK, 2));

      // Sucking spiral arms
      ctx.strokeStyle = 'rgba(255, 120, 40, 0.65)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const a = inK * 6 + (i * TAU) / 4;
        ctx.beginPath();
        ctx.arc(0, 0, curR, a, a + 1.2);
        ctx.stroke();
      }

      // Dense dense white-violet singularity core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3, 14 * (1 - inK)), 0, TAU);
      ctx.fill();
    } else {
      // Phase 2: Supernova outward detonation (t >= 0.38)
      const outK = (this.t - 0.38) / (this.dur - 0.38);
      const alpha = Math.max(0, 1 - outK);
      const blastR = R * 1.6 * Math.sqrt(outK);

      // 8-Point Cosmic Diffraction Star Rays
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
      ctx.lineWidth = 3.5 * alpha;
      ctx.beginPath();
      ctx.moveTo(0, -blastR * 1.4); ctx.lineTo(0, blastR * 1.4);
      ctx.moveTo(-blastR * 1.4, 0); ctx.lineTo(blastR * 1.4, 0);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 180, 60, ${0.75 * alpha})`;
      ctx.lineWidth = 2.0 * alpha;
      ctx.beginPath();
      ctx.moveTo(-blastR, -blastR); ctx.lineTo(blastR, blastR);
      ctx.moveTo(blastR, -blastR); ctx.lineTo(-blastR, blastR);
      ctx.stroke();

      // Searing core starfire orb
      const star = ctx.createRadialGradient(0, 0, 0, 0, 0, blastR);
      star.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      star.addColorStop(0.35, `rgba(255, 200, 70, ${0.8 * alpha})`);
      star.addColorStop(0.7, `rgba(255, 70, 10, ${0.45 * alpha})`);
      star.addColorStop(1, 'rgba(160, 10, 0, 0)');

      ctx.fillStyle = star;
      ctx.beginPath();
      ctx.arc(0, 0, blastR, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// 8. NECROMANCER: Abyssal Soul Void & Erupting Ivory Bone Pikes
// -----------------------------------------------------------------------------
export class NecroAbyssPool {
  constructor(x, y, r, dur = 2.4) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'floor', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.min(1, this.t / 0.2) * Math.max(0, 1 - (k - 0.6) / 0.4);
    if (alpha <= 0) return;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.r * HW * 1.35;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, HH / HW);

    // Swirling black void with necrotic violet border
    const abyss = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    abyss.addColorStop(0, `rgba(6, 1, 10, ${0.9 * alpha})`);
    abyss.addColorStop(0.7, `rgba(40, 10, 60, ${0.75 * alpha})`);
    abyss.addColorStop(1, 'rgba(120, 40, 200, 0)');
    ctx.fillStyle = abyss;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();

    // Necrotic soul runes
    ctx.strokeStyle = `rgba(170, 90, 255, ${0.75 * alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.85, 0, TAU);
    ctx.stroke();

    ctx.restore();
  }
}

export class NecroBonePikes {
  constructor(x, y, r, dur = 1.3) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'top', add: true });
    // Multiple giant ivory bone spikes erupting upward
    this.pikes = [];
    for (let i = 0; i < 11; i++) {
      const a = rand(TAU), dist = rand(0.2, r * 0.85);
      this.pikes.push({
        ox: Math.cos(a) * dist,
        oy: Math.sin(a) * dist,
        maxH: rand(60, 110),
        tilt: rand(-0.35, 0.35),
        delay: rand(0, 0.08)
      });
    }
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    ctx.save();

    for (const pike of this.pikes) {
      const st = Math.max(0, this.t - pike.delay);
      const riseProgress = Math.min(1, st / 0.12);
      const fadeProgress = Math.max(0, 1 - (k - 0.5) / 0.5);
      if (riseProgress <= 0 || fadeProgress <= 0) continue;

      const px = isoX(this.x + pike.ox, this.y + pike.oy);
      const py = isoY(this.x + pike.ox, this.y + pike.oy);
      const curH = pike.maxH * Math.sin(riseProgress * Math.PI * 0.5);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(pike.tilt);

      // Serrated ivory bone spike with dark marrow shading
      const bone = ctx.createLinearGradient(-6, -curH, 6, 0);
      bone.addColorStop(0, '#ffffff');
      bone.addColorStop(0.5, '#e4dec8');
      bone.addColorStop(1, '#685c72');

      ctx.fillStyle = bone;
      ctx.strokeStyle = '#382a44';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(0, -curH); // Sharp tip
      ctx.lineTo(7, -curH * 0.4);
      ctx.lineTo(9, 0);
      ctx.lineTo(-9, 0);
      ctx.lineTo(-7, -curH * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// 9. CARRION WITCH: Occult Pentagram & Screeching Crow Cyclone
// -----------------------------------------------------------------------------
export class WitchPentagram {
  constructor(x, y, r, dur = 2.4) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'floor', add: true });
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.min(1, this.t / 0.2) * Math.max(0, 1 - (k - 0.6) / 0.4);
    if (alpha <= 0) return;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const R = this.r * HW * 1.35;
    const rot = -this.t * 0.6;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, HH / HW);

    // Bubbling toxic miasma pool
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    pool.addColorStop(0, `rgba(30, 60, 10, ${0.65 * alpha})`);
    pool.addColorStop(0.7, `rgba(15, 30, 5, ${0.45 * alpha})`);
    pool.addColorStop(1, 'rgba(80, 160, 20, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();

    // Burning toxic green 5-pointed occult pentagram
    ctx.strokeStyle = `rgba(140, 240, 40, ${0.85 * alpha})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.9, 0, TAU);

    // 5-point star
    for (let i = 0; i < 5; i++) {
      const a1 = rot + (i * 2 * TAU) / 5;
      const a2 = rot + (((i + 1) % 5) * 2 * TAU) / 5;
      ctx.moveTo(Math.cos(a1) * R * 0.88, Math.sin(a1) * R * 0.88);
      ctx.lineTo(Math.cos(a2) * R * 0.88, Math.sin(a2) * R * 0.88);
    }
    ctx.stroke();

    ctx.restore();
  }
}

export class WitchCrowCyclone {
  constructor(x, y, r, dur = 1.4) {
    Object.assign(this, { x, y, r, dur, t: 0, layer: 'top', add: true });
    // 24 animated raven / crow silhouettes circling in a feeding frenzy
    this.crows = [];
    for (let i = 0; i < 24; i++) {
      this.crows.push({
        baseAngle: (i / 24) * TAU,
        orbitR: rand(0.3, r * 0.85),
        speed: rand(5.0, 8.5),
        height: rand(20, 70),
        wingSpeed: rand(18, 30),
        size: rand(10, 16)
      });
    }
  }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx) {
    const k = this.t / this.dur;
    const alpha = Math.min(1, this.t / 0.15) * Math.max(0, 1 - (k - 0.6) / 0.4);
    if (alpha <= 0) return;

    ctx.save();
    for (const crow of this.crows) {
      const curAng = crow.baseAngle + this.t * crow.speed;
      // Spiraling inward as they dive
      const curDist = crow.orbitR * HW * (1 - k * 0.45);
      const px = isoX(this.x, this.y) + Math.cos(curAng) * curDist;
      const py = isoY(this.x, this.y) + Math.sin(curAng) * curDist * (HH / HW) - crow.height * (1 - k * 0.7);

      // Flapping wing angle
      const flap = Math.sin(this.t * crow.wingSpeed);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(curAng + Math.PI / 2);

      // Jet-black raven silhouette
      ctx.fillStyle = `rgba(16, 20, 14, ${alpha})`;
      ctx.strokeStyle = `rgba(100, 200, 40, ${0.6 * alpha})`;
      ctx.lineWidth = 1;

      const s = crow.size * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, s * 1.4); // Beak
      ctx.lineTo(s * 1.5, flap * s); // Right wing tip
      ctx.lineTo(s * 0.4, 0);
      ctx.lineTo(0, -s); // Tail
      ctx.lineTo(-s * 0.4, 0);
      ctx.lineTo(-s * 1.5, flap * s); // Left wing tip
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }
}

