// Declarative Cutscene Compiler & Scenario Trigger Director (zero-eval bridge onto src/game/cinema.js).
// Supports camera tracking/fitting/pans, hero paperdoll & cast portraits, procedural blip voices, title cards,
// scripted straight & A* actor movement, door/portal state toggles, spatial/interact/combat triggers, and
// co-op party-wide lock-and-play synchronization matching Sky/Sea Battles.
import { G } from '../state.js';
import { Cine, drawHeroCutscenePortrait, getHeroCutscenePortrait } from './cinema.js';
import { camera, isoX, isoY, HH } from '../core/view.js';
import { clamp, dist } from '../core/util.js';
import { sfx, playMusic, setAmbience, audioCtx, audioOut } from '../core/audio.js';
import { addEffect, Ring, Column, sparkle, floatText } from '../gfx/vfx.js';
import { enemyImage } from '../core/enemyart.js';
import { townSprite } from './render.js';
import { TOWN_FRAME_W, TOWN_FRAME_H } from './townsfolkvisuals.js';
import { SWAPS } from '../data/bestiary.js';
import { CLASSES } from '../data/classes.js';
import { makeMonster } from './monster.js';
import { depthLevel } from '../data/depth.js';
import { UI } from '../ui/ui.js';
import { net } from '../net/network.js';

const HS = 4; // 4 world px per terrain level

/** Audition the syllable-blip voice directly (used by Studio's "Test Voice" button). */
export function auditionVoice(text, v = {}) {
  const ac = audioCtx(), out = audioOut();
  if (!ac || !out) return false;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const words = String(text || 'Hear my words, mortal!').split(/\s+/).filter(Boolean).slice(0, 24);
  let t = ac.currentTime + 0.02;
  const base = 180 * (v.pitch || 1);
  for (const w of words) {
    const syl = Math.max(1, Math.min(4, Math.round(w.replace(/[^a-z]/gi, '').length / 3)));
    const loud = /[A-Z]{3,}|!/.test(w) ? 1.6 : 1;
    for (let s = 0; s < syl; s++) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = v.wave || 'square';
      const f = base * (0.85 + Math.random() * 0.35) * (w.endsWith('?') && s === syl - 1 ? 1.35 : 1);
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 0.9, t + 0.06);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045 * loud, t + 0.01);
      g.gain.linearRampToValueAtTime(0, t + 0.07);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.08);
      t += 0.075;
    }
    t += 0.05;
  }
  return true;
}

function faceOfEntity(e, k = 0.62) {
  if (!e) return [camera.x, camera.y];
  const h = e.isPlayer ? 60 : e.townsfolkSpriteId ? 57 : (e.artH || 52) * (e.scale || 1);
  return [isoX(e.x, e.y), isoY(e.x, e.y) - (e.z || 0) - (e.lift || 0) - h * k];
}

function makePortraitDrawer(actor, step) {
  if (!actor || actor.isPlayer || step.who === 'hero') return drawHeroCutscenePortrait;
  if (actor.townsfolkSpriteId || actor.spriteId) {
    const sid = actor.townsfolkSpriteId || actor.spriteId;
    const pal = actor.pal || null;
    return (ctx, x, y, w, h) => {
      const sheet = townSprite(sid, pal);
      if (!sheet) return;
      // Crop upper torso & face from idle pose 0 of the 256x200 cell
      const sx = 64, sy = 14, sw = 128, sh = 128;
      ctx.drawImage(sheet, sx, sy, Math.min(sw, TOWN_FRAME_W), Math.min(sh, TOWN_FRAME_H), x, y, w, h);
    };
  }
  const artId = step.portraitArt || actor.art || actor.look?.art;
  const swap = step.portraitSwap ? SWAPS[step.portraitSwap] : (actor.look?.swap || null);
  if (artId) {
    return (ctx, x, y, w, h) => {
      const img = enemyImage(artId, swap);
      if (!img) return;
      const nw = img.naturalWidth || img.width || 64;
      const nh = img.naturalHeight || img.height || 64;
      const sc = Math.min(w / nw, h / nh) * 1.15;
      const dw = nw * sc, dh = nh * sc;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2 + dh * 0.06, dw, dh);
    };
  }
  return null;
}

/** Expand {hero}, {class}, and {@castKey} tokens in cutscene text. */
export function expandCutsceneTokens(text, world, doc) {
  if (!text) return '';
  const heroName = G.char?.name || world?.player?.name || 'Adventurer';
  const clsId = G.char?.classId || world?.player?.classId || 'paladin';
  const clsName = clsId === 'arcane_sorcerer' ? 'Astronomer' : (CLASSES[clsId]?.name || 'Hero');
  return String(text)
    .replace(/\{hero\}/gi, heroName)
    .replace(/\{class\}/gi, clsName)
    .replace(/\{@([a-zA-Z0-9_-]+)\}/g, (_, key) => {
      const c = world?.creatures?.find((q) => q.castKey === key);
      if (c && c.name) return c.name;
      const n = world?.npcs?.find((q) => q.castKey === key);
      if (n && n.name) return n.name;
      const sp = doc?.entities?.spawns?.find((q) => q.castKey === key);
      if (sp && sp.name) return sp.name;
      return key;
    });
}

/**
 * Compile a declarative cutscene object from .velscen.json into executable Cine.play() steps.
 */
export function compileCutsceneSteps(cine, runtime) {
  const { world, doc, walkActor, pathActor, scriptedCount, toggleDoor, unsealExit } = runtime;
  const p = () => world.player || G.player;

  const findActor = (who) => {
    if (!who || who === 'hero') return p();
    const key = String(who).replace(/^@/, '');
    const m = world.creatures.find((c) => c.castKey === key && !c.dead) || world.creatures.find((c) => c.castKey === key);
    if (m) return m;
    const n = world.npcs.find((c) => c.castKey === key);
    if (n) return n;
    return null;
  };

  const findPoint = (ref) => {
    if (!ref) return faceOfEntity(p(), 0.45);
    const key = String(ref).replace(/^@/, '');
    if (world.skyDirector) {
      const vp = world.skyDirector.vesselScreenPos?.(key);
      if (vp) return vp;
      if (key === 'flagship') return world.skyDirector.flagshipScreenPos();
      if (key === 'skiff') return world.skyDirector.skiffScreenPos();
      if (key === 'gate') return world.skyDirector.gateScreenPos();
    }
    const act = findActor(key);
    if (act) return faceOfEntity(act);
    const mk = (doc.entities?.marks || []).find((q) => q.id === key || q.name === key);
    if (mk) return [isoX(mk.x, mk.y), isoY(mk.x, mk.y) - 24];
    return faceOfEntity(p(), 0.45);
  };

  const resolveTileCoords = (step) => {
    if (step.markId) {
      const mk = (doc.entities?.marks || []).find((q) => q.id === step.markId);
      if (mk) return [mk.x, mk.y];
    }
    return [Number(step.x) || 0, Number(step.y) || 0];
  };

  getHeroCutscenePortrait(160, 160);
  const steps = [];

  for (const st of cine.steps || []) {
    if (!st || st.enabled === false) continue;
    switch (st.type) {
      case 'card': {
        const t1 = expandCutsceneTokens(st.title || '', world, doc);
        const t2 = expandCutsceneTokens(st.sub || '', world, doc);
        steps.push({ card: [t1, t2], dur: st.dur ?? 2.6, block: !!st.block });
        break;
      }
      case 'cam': {
        const zoom = Number(st.zoom) || 1.4;
        const dur = Number(st.dur) ?? 1.4;
        const ease = st.ease || 'io';
        const wait = st.wait !== false;
        const push = Number(st.push) || 0;
        const drift = Array.isArray(st.drift) ? st.drift : undefined;
        const pace = Number(st.pace) || undefined;

        if (st.mode === 'return_hero') {
          steps.push({ cam: { on: () => faceOfEntity(p(), 0.4), zoom: 1, dur: st.dur ?? 0.9, ease: 'io', wait: true } });
        } else if (st.mode === 'actor') {
          const who = st.who || 'hero';
          const lookTo = st.lookTo || null;
          steps.push({
            cam: {
              on: () => {
                const a = findPoint(who);
                if (!lookTo) return a;
                const b = findPoint(lookTo);
                return Math.hypot(b[0] - a[0], b[1] - a[1]) < 420
                  ? [a[0] + (b[0] - a[0]) * 0.22, a[1] + (b[1] - a[1]) * 0.22]
                  : a;
              },
              zoom,
              dur,
              pace,
              ease,
              wait,
              push,
              drift,
            },
          });
        } else if (st.mode === 'fit') {
          const refs = Array.isArray(st.actors) && st.actors.length ? st.actors : ['hero'];
          steps.push({
            cam: {
              fit: () => refs.map(findPoint),
              zoom,
              dur,
              pace,
              ease,
              wait,
              push,
              drift,
              margin: st.margin ?? 0.62,
              min: st.min ?? 0.45,
            },
          });
        } else {
          const [tx, ty] = resolveTileCoords(st);
          steps.push({
            cam: {
              x: tx,
              y: ty,
              lv: st.lv !== undefined && st.lv !== null && st.lv !== '' ? Number(st.lv) : undefined,
              up: st.up ?? 24,
              zoom,
              dur,
              pace,
              ease,
              wait,
              push,
              drift,
            },
          });
        }
        break;
      }
      case 'say': {
        const whoKey = String(st.who || 'hero').replace(/^@/, '');
        const isHero = whoKey === 'hero';
        const speakerObj = findActor(whoKey);
        const speakerName = st.customName
          ? expandCutsceneTokens(st.customName, world, doc)
          : isHero
            ? (G.char?.name || p()?.name || 'Hero')
            : (speakerObj?.name || whoKey);
        const color = st.color || (isHero ? '#9fd0ff' : speakerObj?.rank === 'boss' ? '#ff8a70' : '#ffd9a0');
        const text = expandCutsceneTokens(st.text || '...', world, doc);
        if (st.autoFrame !== false) {
          steps.push({
            cam: {
              on: () => findPoint(whoKey),
              zoom: Number(st.zoom) || (isHero ? 2.4 : 2.1),
              dur: 0.75,
              pace: 750,
              push: 0.02,
              wait: false,
            },
          });
        }
        steps.push({
          say: {
            who: isHero ? 'hero' : whoKey,
            isHero,
            isNPC: !isHero,
            name: speakerName,
            color,
            portrait: makePortraitDrawer(speakerObj, st),
            text,
            mark: st.markWord ? { word: st.markWord, color: st.markColor || '#ffd860' } : null,
            voice: {
              pitch: Number(st.voice?.pitch) || 1.0,
              wave: st.voice?.wave || 'square',
            },
            focus: () => findPoint(whoKey),
            onStart: () => {
              const act = findActor(whoKey);
              if (act && st.act) {
                act.emotion = st.act;
                act.emotionT = 2.5;
              }
            },
          },
          dur: st.dur ? Number(st.dur) : undefined,
        });
        break;
      }
      case 'walk': {
        const [tx, ty] = resolveTileCoords(st);
        const dur = Number(st.dur) || 1.2;
        if (world.skyDirector?.hasVessel?.(st.who)) {
          let vRef = null;
          steps.push({
            do: () => {
              vRef = world.skyDirector.sailPlacedVessel(st.who, {
                toX: tx,
                toY: ty,
                toLv: Number.isFinite(Number(st.lv)) ? Number(st.lv) : undefined,
                fromClouds: !!st.fromClouds,
                dur,
              });
            },
          });
          if (st.wait !== false) {
            steps.push({ until: () => !vRef || !vRef._sail, max: dur + 2 });
          }
          break;
        }
        steps.push({
          do: () => {
            const act = findActor(st.who || 'hero');
            if (!act) return;
            if (st.pathfind) pathActor(act, [tx, ty], Number(st.speed) || 4.0);
            else walkActor(act, [tx, ty], dur, !!st.fadeIn);
          },
        });
        if (st.wait) {
          steps.push({ until: () => scriptedCount() === 0, max: Math.max(4, dur + 4) });
        }
        break;
      }
      case 'emote': {
        steps.push({
          do: () => {
            const act = findActor(st.who || 'hero');
            if (!act) return;
            if (st.emotion) {
              if (typeof act.feel === 'function') act.feel(st.emotion, st.dur || 2.2, false);
              else { act.emotion = st.emotion; act.emotionT = st.dur || 2.2; }
            }
            if (st.alpha !== undefined) act.alpha = Number(st.alpha);
            if (st.faceTo) {
              const pt = findActor(st.faceTo);
              if (pt && act.face) {
                if (act.isPlayer) act.face(Math.atan2(pt.y - act.y, pt.x - act.x));
                else act.face(pt.x, pt.y);
              }
            }
          },
        });
        break;
      }
      case 'shake': {
        steps.push({ shake: Number(st.px) || 6 });
        break;
      }
      case 'sfx': {
        steps.push({ do: () => sfx(st.sound || 'boss', Number(st.vol) || 0.75) });
        break;
      }
      case 'music': {
        steps.push({
          do: () => {
            if (st.music) playMusic(st.music);
            if (st.ambience) setAmbience(st.ambience);
          },
        });
        break;
      }
      case 'vfx': {
        const [tx, ty] = resolveTileCoords(st);
        const col = st.color || '#ffb060';
        steps.push({
          do: () => {
            const [x, y] = st.who ? (() => { const a = findActor(st.who); return a ? [a.x, a.y] : [tx, ty]; })() : [tx, ty];
            const kind = st.vfx || 'sparkle';
            if (kind === 'ring') addEffect(new Ring(x, y, 0.2, st.radius || 3.5, st.dur || 0.9, col, 6));
            else if (kind === 'column') addEffect(new Column(x, y, col, st.dur || 0.9, 28, 320));
            else if (kind === 'text') floatText(x, y, 64, expandCutsceneTokens(st.text || '!', world, doc), col, 14, { life: 1.8 });
            else sparkle(x, y, 28, col, st.count || 24, st.dur || 0.7);
          },
        });
        break;
      }
      case 'door': {
        steps.push({
          do: () => {
            if (st.target === 'exit') unsealExit();
            else toggleDoor(st.doorIndex ?? 0, st.open !== false);
          },
        });
        break;
      }
      case 'spawn': {
        const [tx, ty] = resolveTileCoords(st);
        steps.push({
          do: () => {
            if (st.wakeCast) {
              const m = world.creatures.find((c) => c.castKey === st.wakeCast && !c.dead);
              if (m) m.awake = true;
              return;
            }
            const lvl = depthLevel(world.depth || 1);
            const n = Math.max(1, Math.min(12, st.n || 3));
            for (let i = 0; i < n; i++) {
              const [mx, my] = i === 0 ? [tx, ty] : world.map.randomNear(tx, ty, 1.8);
              const m = makeMonster(world, st.arch || (world.biome?.roster?.[0] || 'skeleton'), world.biome, lvl, st.rank || 'normal', mx, my, 0);
              if (m) {
                m.awake = true;
                if (st.castKey && i === 0) m.castKey = st.castKey;
                if (st.name && i === 0) m.name = st.name;
                world.add(m);
              }
            }
            addEffect(new Ring(tx, ty, 0.2, 2.8, 0.7, '#ff5040', 5));
            sfx('boss', 0.5);
          },
        });
        break;
      }
      case 'wait': {
        steps.push({ wait: Math.max(0.05, Number(st.dur) || 1.0) });
        break;
      }
      case 'until_arrived': {
        steps.push({ until: () => scriptedCount() === 0, max: Number(st.max) || 15 });
        break;
      }
      case 'until_cleared': {
        steps.push({
          until: () => !world.creatures.some((c) => c.team === 'enemy' && !c.dead && c.awake),
          max: Number(st.max) || 60,
        });
        break;
      }
      case 'sky_skiff': {
        let boatRef = null;
        steps.push({
          do: () => {
            boatRef = world.skyDirector?.launchSkiff({
              boatKind: st.boatKind || 'cutter',
              dock: st.dock || 'auto',
              count: st.count ?? 4,
              rank: st.rank || 'normal',
              captainId: st.captainId || '',
              castKey: st.castKey || '',
            });
          },
        });
        if (st.wait !== false) {
          steps.push({
            until: () => !boatRef || boatRef.st === 'dock' || boatRef.st === 'out' || !world.sky?.boats?.includes(boatRef),
            max: 6.5,
          });
        }
        break;
      }
      case 'sky_flagship': {
        const action = st.action || 'arrive';
        const dur = Number(st.dur) || 3.2;
        steps.push({
          do: () => {
            world.skyDirector?.controlFlagship({
              action,
              dur,
              captainA: st.captainA || 'ap_admiral_veyl',
              captainB: st.captainB || 'ap_red_gale_corsair',
            });
          },
        });
        if (st.wait !== false && action === 'arrive') {
          steps.push({
            until: () => !world.sky?.galleon || (world.sky.galleon.k || 0) >= 0.98,
            max: dur + 2.0,
          });
        }
        break;
      }
      case 'sky_hooks': {
        const action = st.action || 'throw_and_lash';
        const cnt = Number(st.count ?? 4);
        steps.push({
          do: () => {
            world.skyDirector?.controlHooks({ action, count: cnt, vesselKey: st.vesselKey || '' });
          },
        });
        if (st.wait !== false && (action === 'throw_and_lash' || action === 'throw')) {
          steps.push({ wait: action === 'throw_and_lash' ? (0.95 + cnt * 0.16) : 0.8 });
        }
        break;
      }
      case 'sky_volley': {
        const action = st.action || 'flagship_volley';
        let capEntity = null;
        steps.push({
          do: () => {
            capEntity = world.skyDirector?.fireVolley({
              action,
              count: st.count ?? 4,
              captainId: st.captainId || 'ap_admiral_veyl',
              castKey: st.castKey || '',
              dz: st.dz ?? 0,
            });
          },
        });
        if (st.wait) {
          if (action === 'captain_leap' || action === 'captain_swing') {
            steps.push({ until: () => !capEntity || !capEntity.entering, max: 4.5 });
          } else {
            steps.push({ wait: Math.max(0.8, (Number(st.count ?? 4)) * 0.28 + 1.0) });
          }
        }
        break;
      }
    }
  }
  void HS;
  return steps;
}

function pointInZone(x, y, z) {
  if (!z) return false;
  if (z.shape === 'circle') {
    const r = z.r || Math.max(z.w || 4, z.h || 4) / 2;
    return dist(x, y, z.x, z.y) <= r;
  }
  return x >= z.x && y >= z.y && x <= z.x + (z.w || 1) && y <= z.y + (z.h || 1);
}

/**
 * Attaches a full Scenario & Cutscene Director to `world`, managing objectives, spatial zones,
 * combat triggers, scripted actor movement during G.cine, and party-wide lock-and-play cutscene playback.
 */
export function createScenarioDirector(world, doc, opts = {}) {
  const scripted = [];
  const fired = new Set();
  const pendingClearTriggers = new Set();
  const insideZones = new Set();
  const bossAwakeSeen = new Set();
  const deadSeen = new Set();
  const doneObjectives = new Set();
  const trackedEnemies = new Set();
  let arrivalPending = !opts.skipArrival;
  let arrivalDelay = 0.25;

  const syncTrackedEnemies = () => {
    for (const c of world.creatures || []) {
      if (c && c.team === 'enemy') trackedEnemies.add(c);
    }
  };
  syncTrackedEnemies();

  const isCombatClear = () => {
    const hero = world.player || G.player;
    if (!hero) return true;
    return !world.creatures.some((c) => {
      if (c.team !== 'enemy' || c.dead || !c.awake || c.clutter) return false;
      const d = Math.hypot(c.x - hero.x, c.y - hero.y);
      return d <= 5.5 && world.map.los(hero.x, hero.y, c.x, c.y);
    });
  };

  const orientActor = (who, fx, fy, tx, ty) => {
    const dx = tx - fx, dy = ty - fy;
    if (Math.hypot(dx, dy) < 1e-3) return;
    if (who.sprite === 'townsfolk' || ('walking' in who && !('moving' in who))) {
      if (typeof who.face === 'function') who.face(tx, ty);
    } else {
      const ang = Math.atan2(dy, dx);
      who.facing = ang;
      const sx = Math.cos(ang) - Math.sin(ang);
      if (Math.abs(sx) > 0.12) {
        who.flip = sx < 0;
        who.flipAt = -1;
      }
    }
  };

  const walkActor = (who, to, dur = 1.0, fadeIn = false, then = null) => {
    const fx = who.x, fy = who.y;
    let t = 0;
    const total = Math.max(0.05, dur);
    const isFolk = !!(who.sprite === 'townsfolk' || ('walking' in who && !('moving' in who)));
    orientActor(who, fx, fy, to[0], to[1]);
    const inCineAtStart = !!G.cine;
    scripted.push((dt) => {
      if (inCineAtStart && !G.cine) {
        who.going = false;
        if (isFolk) { who.walking = false; who.walkT = 0; }
        else who.moving = false;
        return false;
      }
      t += dt;
      const k = clamp(t / total, 0, 1);
      const active = k < 1;
      who.x = fx + (to[0] - fx) * k;
      who.y = fy + (to[1] - fy) * k;
      if (fadeIn) who.alpha = active ? k : 1;
      if (!active && then) then();
      const keepMoving = active || !!who.going;
      if (isFolk) {
        who.walking = keepMoving;
        if (keepMoving) who.walkT = (who.walkT || 0) + dt;
        else who.walkT = 0;
      } else {
        who.animT = (who.animT || 0) + dt;
        who.moving = keepMoving;
        if (who.isPlayer) {
          who.moveTarget = null;
          who.path = null;
          who.attackTarget = null;
        }
      }
      return active;
    });
  };

  const pathActor = (who, to, speed = 4.0, then = null) => {
    const legs = (world.map.findPath(who.x, who.y, to[0], to[1], 12000) || []).slice();
    if (!legs.length || Math.hypot(legs[legs.length - 1][0] - to[0], legs[legs.length - 1][1] - to[1]) > 0.05) {
      legs.push(to);
    }
    who.going = true;
    const next = () => {
      const q = legs.shift();
      if (!q) {
        who.going = false;
        if (then) then();
        return;
      }
      const d = Math.hypot(q[0] - who.x, q[1] - who.y);
      walkActor(who, q, Math.max(0.05, d / Math.max(0.5, speed)), false, next);
    };
    next();
  };

  const toggleDoor = (idx, open = true) => {
    const d = world.map.doors && world.map.doors[idx];
    if (!d) return;
    d.open = open;
    const tx = Math.floor(d.x), ty = Math.floor(d.y);
    if (world.map.inb(tx, ty)) world.map.block[ty * world.map.w + tx] = open ? 0 : 1;
    world.map._stepMask = null;
    world.map._los = null;
    world.map.flowFrom = [-999, -999];
    sfx('door', 0.7);
  };

  const unsealExit = () => {
    const ex = world.portals?.find((q) => q.type === 'exit');
    if (ex && !ex.active) {
      ex.active = true;
      ex.color = '#40a0ff';
      ex.label = doc.entities?.exit?.continueToBiome ? `Continue to ${doc.entities.exit.continueToBiome}` : 'Exit — continue';
      addEffect(new Ring(ex.x, ex.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate');
      if (opts.onWin) opts.onWin();
    }
  };

  const runtime = {
    world,
    doc,
    walkActor,
    pathActor,
    scriptedCount: () => scripted.length,
    toggleDoor,
    unsealExit,
  };

  const seenKeyFor = (cineId) => `scen:${doc.meta?.id || 'custom'}:${cineId}`;

  /** Play a cutscene locally (either initiated locally or received via party lock-and-play relay). */
  function playCutsceneById(cineId, { forceNormalSpeed = false, onEnd = null } = {}) {
    const cine = (doc.cutscenes || []).find((c) => c.id === cineId);
    if (!cine) return false;
    const steps = compileCutsceneSteps(cine, runtime);
    if (!steps.length) return false;

    const c = G.char;
    const sk = seenKeyFor(cineId);
    const localSeen = !!(c && c.scenCineSeen && c.scenCineSeen[sk]);
    const canFast = cine.allowFastForward !== false && !forceNormalSpeed && localSeen && !G.settings?.noSkipCine && !opts.isEditorPreview;

    Cine.play(
      [
        { do: () => { Cine.fast = canFast; } },
        ...steps,
        {
          do: () => {
            Cine.fast = false;
            if (c && !opts.isEditorPreview) {
              (c.scenCineSeen ||= {})[sk] = 1;
            }
          },
        },
      ],
      onEnd
    );
    return true;
  }

  function fireTrigger(tr, fromNetwork = false) {
    if (!tr || tr.enabled === false) return false;
    if (tr.once && fired.has(tr.id)) return false;
    if (!fromNetwork && tr.requireCombatClear && !isCombatClear()) {
      if (!pendingClearTriggers.has(tr)) {
        pendingClearTriggers.add(tr);
        const hero = world.player || G.player;
        if (hero) floatText(hero.x, hero.y, 52, 'Defeat remaining foes nearby!', '#ffd080', 12);
      }
      return false;
    }
    pendingClearTriggers.delete(tr);
    if (tr.once) fired.add(tr.id);

    // Broadcast to co-op party so everyone on this floor locks & plays simultaneously (like Sky/Sea Battles)
    let partyNeedsFullSpeed = false;
    if (!fromNetwork && !opts.isEditorPreview && G.room && net.connected && typeof net.sendCineTrigger === 'function') {
      const sk = tr.runCutscene ? seenKeyFor(tr.runCutscene) : '';
      const localSeen = !!(sk && G.char?.scenCineSeen?.[sk] && !G.settings?.noSkipCine);
      net.sendCineTrigger(world.depth || 0, tr.id, tr.runCutscene || null, localSeen);
      // If any peer hasn't confirmed seen, keep 1x speed in co-op unless everyone has seen it
      partyNeedsFullSpeed = !localSeen;
    }

    if (tr.unsealExit) unsealExit();
    if (typeof tr.openDoorIndex === 'number') toggleDoor(tr.openDoorIndex, true);
    if (tr.logText) UI.log(expandCutsceneTokens(tr.logText, world, doc), '#ffe2a0');
    if (tr.runCutscene) {
      playCutsceneById(tr.runCutscene, { forceNormalSpeed: partyNeedsFullSpeed });
    }
    return true;
  }

  const director = {
    id: doc.meta?.id || 'custom',
    type: 'custom_scenario',
    completed: false,
    failed: false,
    active: true,
    fired,
    get title() {
      return director.completed ? `${doc.meta?.name || 'Scenario'} — Cleared` : (doc.meta?.name || 'Custom Scenario');
    },
    get description() {
      if (director.completed) return 'The way onward stands open.';
      const nextObj = (doc.objectives || []).find((o, idx) => !doneObjectives.has(o.id || idx));
      return nextObj ? nextObj.text : (doc.meta?.blurb || 'Explore the area and defeat its guardian.');
    },
    get objective() {
      const ex = world.portals?.find((q) => q.type === 'exit');
      if (director.completed && ex) return { x: ex.x, y: ex.y, reach: 1.5 };
      const boss = world.creatures.find((c) => c.team === 'enemy' && !c.dead && (c.rank === 'boss' || c.rank === 'raid'));
      if (boss) return { x: boss.x, y: boss.y, reach: 2.0 };
      return ex ? { x: ex.x, y: ex.y, reach: 1.5 } : null;
    },
    playCutscene: (cineId, playOpts = {}) => playCutsceneById(cineId, playOpts),
    fireTriggerById: (trigId, fromNetwork = false, partyAllSeen = false) => {
      const tr = (doc.triggers || []).find((q) => q.id === trigId);
      if (!tr) return false;
      if (tr.once && fired.has(tr.id)) return false;
      if (tr.once) fired.add(tr.id);
      if (tr.unsealExit) unsealExit();
      if (typeof tr.openDoorIndex === 'number') toggleDoor(tr.openDoorIndex, true);
      if (tr.runCutscene) {
        playCutsceneById(tr.runCutscene, { forceNormalSpeed: !partyAllSeen });
      }
      return true;
    },
    tickScripted(dt) {
      syncTrackedEnemies();
      world.skyDirector?.tick(dt);
      for (let i = scripted.length - 1; i >= 0; i--) {
        if (!scripted[i](dt)) scripted.splice(i, 1);
      }
    },
    update(dt) {
      director.tickScripted(dt);
      const p = world.player || G.player;
      if (!p || p.dead) return;

      if (arrivalPending) {
        arrivalDelay -= dt;
        if (arrivalDelay <= 0) {
          arrivalPending = false;
          for (const tr of doc.triggers || []) {
            if (tr.event === 'onArrival') fireTrigger(tr);
          }
        }
      }

      if (G.cine) return;

      // Retry any triggers (such as onEntityDeath with Combat Clear) once nearby combat clears
      if (pendingClearTriggers.size && isCombatClear()) {
        for (const tr of [...pendingClearTriggers]) {
          fireTrigger(tr);
          if (G.cine) return;
        }
      }

      // Spatial zone triggers
      for (const z of doc.entities?.zones || []) {
        const inside = pointInZone(p.x, p.y, z);
        const wasInside = insideZones.has(z.id);
        if (inside && !wasInside) {
          insideZones.add(z.id);
          for (const tr of doc.triggers || []) {
            if (tr.event === 'onEnterZone' && tr.zoneId === z.id) fireTrigger(tr);
          }
        } else if (!inside && wasInside) {
          insideZones.delete(z.id);
          for (const tr of doc.triggers || []) {
            if (tr.event === 'onExitZone' && tr.zoneId === z.id) fireTrigger(tr);
          }
        }
      }

      // Combat & cast lifecycle triggers (iterating trackedEnemies so creatures spliced out 0.05s after death are never missed!)
      const normKey = (k) => String(k || '').replace(/^@/, '').trim();
      for (const c of trackedEnemies) {
        if (c.team !== 'enemy') continue;
        const key = normKey(c.castKey);
        if (c.awake && !c.dead && key && !bossAwakeSeen.has(c)) {
          bossAwakeSeen.add(c);
          for (const tr of doc.triggers || []) {
            const tk = normKey(tr.targetKey);
            if (tr.event === 'onBossAwake' && (!tk || tk === key)) fireTrigger(tr);
          }
        }
        if (!c.dead && c.maxHp > 0) {
          const pct = (c.hp / c.maxHp) * 100;
          for (const tr of doc.triggers || []) {
            const tk = normKey(tr.targetKey);
            if (tr.event === 'onBossHpBelow' && (!tk || tk === key) && pct <= (tr.hpPct ?? 50)) {
              fireTrigger(tr);
            }
          }
        }
        if (c.dead && !deadSeen.has(c)) {
          deadSeen.add(c);
          for (const tr of doc.triggers || []) {
            const tk = normKey(tr.targetKey);
            if (tr.event === 'onEntityDeath' && (!tk || tk === key)) fireTrigger(tr);
          }
        }
      }

      // Objective completion check (tracked locally without mutating doc.objectives)
      let allDone = true;
      for (let oi = 0; oi < (doc.objectives || []).length; oi++) {
        const obj = doc.objectives[oi];
        const oid = obj.id || oi;
        if (doneObjectives.has(oid)) continue;
        if (obj.kind === 'kill_bosses') {
          const alive = world.creatures.some((c) => c.team === 'enemy' && !c.dead && (c.rank === 'boss' || c.rank === 'raid'));
          if (!alive) doneObjectives.add(oid);
        } else if (obj.kind === 'kill_cast') {
          const tgt = normKey(obj.target);
          const alive = world.creatures.some((c) => c.team === 'enemy' && !c.dead && normKey(c.castKey) === tgt);
          if (!alive) doneObjectives.add(oid);
        } else if (obj.kind === 'kill_all') {
          const alive = world.creatures.some((c) => c.team === 'enemy' && !c.dead && !c.clutter);
          if (!alive) doneObjectives.add(oid);
        } else if (obj.kind === 'reach_zone') {
          const z = (doc.entities?.zones || []).find((q) => q.id === obj.zoneId);
          if (z && pointInZone(p.x, p.y, z)) doneObjectives.add(oid);
        }
        if (!doneObjectives.has(oid)) allDone = false;
      }

      const waitingUnseal = [...pendingClearTriggers].some((tr) => tr.unsealExit);
      if (!director.completed && !waitingUnseal && (doc.objectives?.length ? allDone : false)) {
        director.completed = true;
        for (const tr of doc.triggers || []) {
          if (tr.event === 'onScenarioWin') fireTrigger(tr);
        }
        if (doc.entities?.exit?.unsealOn !== 'manual') {
          unsealExit();
        }
      }
    },
  };

  world.customDirector = director;
  world.overworldScenario = director;
  return director;
}
