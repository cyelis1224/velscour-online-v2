// Ambient animal directors for Herrington Hollow and Sunscorch Oasis. Act I cats, dogs, chickens, and outskirts wildlife
// use the town-life agent system; Act II desert critters use a small world-local walker. All reuse the People and Animals pack.
import { G } from '../state.js';
import { dist, rand, randi, pick, chance, TAU, RNG } from '../core/util.js';
import { ANIMALS } from '../data/townsfolk.js';
import { sfx } from '../core/audio.js';
import { townFacingFlip } from './townsfolkvisuals.js';

export const ANIMAL_CHANCE = { cat: 0.6, dog: 0.55, rabbit: 0.45, rat: 0.35, deer: 0.3 };
const SOUNDS = { dog: ['Woof!', 'Arf!', 'Ruff ruff!', 'Wuff.'], cat: ['Mrrow.', 'Mew?', 'Prrrr...', 'Mrrp!'],
  chicken: ['Cluck!', 'Bawk bawk!', 'Brrrrk!'] };
const heroDist = (a) => (G.player ? dist(G.player.x, G.player.y, a.x, a.y) : 99);

/** Put this visit's animals in town. `force` (tests): { species: count }. */
export function addTownAnimals(d, rng, force = G.townAnimalsForce) {
  const { map, t } = d, C = t.center, P = t.portal;
  // the outskirts: open ground between the last houses and the treeline, away from the portal road
  const R0 = 15, R1 = Math.min(map.w, map.h) / 2 - 1.5;
  const edge = [];
  for (let y = 2; y < map.h - 2; y++) for (let x = 2; x < map.w - 2; x++) {
    const r = dist(x, y, C.x, C.y);
    if (r > R0 && r < R1 && dist(x, y, P.x, P.y) > 5 && map.walkable(x + 0.5, y + 0.5) && map.circleFree(x + 0.5, y + 0.5, 0.3)) edge.push([x + 0.5, y + 0.5]);
  }
  d.edge = edge;
  d.edgeSpot = (near, r = 6) => {
    if (!edge.length) return d.randomSpot();
    if (!near) return pick(edge);
    const close = edge.filter(([x, y]) => dist(x, y, near[0], near[1]) < r);
    return close.length ? pick(close) : pick(edge);
  };
  // Build a small, visit-local garden/paddock territory from the generated dirt
  // patches and their feeding props. Fallbacks stay on the outer walkable lanes.
  const services = [...(d.world?.npcs || []).filter((n) => n.vendor || n.stash || n.reliquary || n.jewelBox || n.altar || n.waypoint),
    ...(d.vendors || [])];
  const chickenRestricted = (x, y) => dist(x, y, C.x, C.y) < 7.5 || dist(x, y, P.x, P.y) < 4.5 ||
    (t.breach && dist(x, y, t.breach.x, t.breach.y) < 4) || (t.altar && dist(x, y, t.altar.x, t.altar.y) < 3.5) ||
    services.some((n) => Number.isFinite(n.x) && dist(x, y, n.x, n.y) < (n.vendor ? 3.6 : 3.1));
  const feedProps = (t.props || []).filter((p) => p.kind === 'scatter' && /vegetable_basket|wildflowers|water_bucket|hay_bale|grain_sacks|horse_trough/i.test(p.spr?.name || ''));
  const chickenSpots = [];
  for (let y = 2; y < map.h - 2; y++) for (let x = 2; x < map.w - 2; x++) {
    const px = x + 0.5, py = y + 0.5, tile = map.v?.[y * map.w + x];
    const nearFeed = feedProps.some((p) => dist(px, py, p.x, p.y) < 3.8);
    const dirt = tile === 2 || tile === 3;
    if ((!nearFeed && !(dirt && dist(px, py, C.x, C.y) > 8.5)) || chickenRestricted(px, py) ||
        !map.walkable(px, py) || !map.circleFree(px, py, 0.3)) continue;
    chickenSpots.push([px, py]);
  }
  if (!chickenSpots.length) for (const [x, y] of edge) if (!chickenRestricted(x, y) && map.circleFree(x, y, 0.3)) chickenSpots.push([x, y]);
  d.chickenSpots = chickenSpots;
  d.chickenSpot = (near = null, minDistance = 0, awayFrom = null) => {
    const hens = (d.agents || []).filter((a) => a.species === 'chicken' && !a.hidden);
    const separated = chickenSpots.filter(([x, y]) => hens.every((a) => dist(x, y, a.x, a.y) >= 2.2));
    const pool = separated.length ? separated : chickenSpots;
    const candidates = pool.filter(([x, y]) => (!near || dist(x, y, near[0], near[1]) >= minDistance) &&
      (!awayFrom || dist(x, y, awayFrom.x, awayFrom.y) > 3.1));
    return candidates.length ? pick(candidates) : null;
  };
  d.chickenGoal = (a, q, run = false) => {
    if (!q || chickenRestricted(q[0], q[1])) return false;
    const path = map.findPath(a.x, a.y, q[0], q[1], 4000, 0.25);
    if (!path?.length || path.some(([x, y]) => chickenRestricted(x, y))) return false;
    a.path = path; a.goal = [q[0], q[1]]; a.running = run; a.stuckT = 0;
    return true;
  };
  const species = (s) => ANIMALS.filter((v) => v.species === s);
  const counts = force || {
    cat: rng.chance(ANIMAL_CHANCE.cat) ? rng.int(1, 2) : 0, dog: rng.chance(ANIMAL_CHANCE.dog) ? rng.int(1, 2) : 0,
    rabbit: rng.chance(ANIMAL_CHANCE.rabbit) ? rng.int(1, 3) : 0, rat: rng.chance(ANIMAL_CHANCE.rat) ? rng.int(1, 2) : 0,
    deer: rng.chance(ANIMAL_CHANCE.deer) ? rng.int(1, 2) : 0,
    chicken: d.world?.biome?.id === 'town' ? rng.int(3, 5) : 0,
  };
  for (const [s, n] of Object.entries(counts)) {
    const kinds = species(s);
    if (!kinds.length) continue;
    // deer come as a doe and a stag; cats, dogs, and chickens have distinct sprites; rabbits and rats repeat
    const start = rng.int(0, kinds.length - 1);
    let herd = null;
    for (let i = 0; i < n; i++) {
      const v = kinds[(start + i) % kinds.length];
      const at = s === 'chicken' ? (d.chickenSpot(herd, 2.8) || d.chickenSpot()) : v.where === 'edge' ? d.edgeSpot(herd, 4) : d.randomSpot();
      if (!at) continue;
      herd = herd || at;
      makeAnimal(d, v, at[0] + (s === 'chicken' ? 0 : rand(-0.4, 0.4)), at[1] + (s === 'chicken' ? 0 : rand(-0.4, 0.4)), s === 'chicken' ? { targetable: false, hostile: false, flip: false } : {});
    }
  }
}

/** Add a small, visit-local wildlife population to Sunscorch Oasis. */
export function startAct2AmbientCritters(world, town) {
  if (!world || world.townId !== 'act2_town' || world._act2CrittersStarted) return 0;
  world._act2CrittersStarted = true;
  const map = world.map;
  if (!map?.walkable || !map?.circleFree || !map?.findPath) return 0;
  const rng = new RNG(((town?.seed || 1) ^ 0x2f84c5ab) >>> 0);
  const nearProps = (pattern) => (world.props || []).filter((p) => pattern.test(p.spr?.name || p.name || ''));
  const rocks = nearProps(/boulder|basalt|cairn|rock|rubble|wall|outcrop|cliff/i);
  const shade = nearProps(/acacia|palm|awning|shade|tent|market_cloth/i);
  const vegetation = nearProps(/cactus|shrub|grass|succulent|date_palm|palm|bush/i);
  const services = (world.npcs || []).filter((n) => n.vendor || n.stash || n.jewelBox || n.reliquary || n.altar || n.waypoint || n.portal);
  const center = town?.center || { x: map.w / 2, y: map.h / 2 };
  const restricted = (x, y) => Math.hypot(center.x - x, center.y - y) < 6.5 ||
    (world.portals || []).some((p) => Math.hypot(p.x - x, p.y - y) < 2.8) ||
    (town?.altar && Math.hypot(town.altar.x - x, town.altar.y - y) < 3.5) ||
    services.some((n) => Number.isFinite(n.x) && Math.hypot(n.x - x, n.y - y) < 3.1);
  const safe = (x, y) => map.walkable(x, y) && map.circleFree(x, y, 0.16) && !restricted(x, y) &&
    !(world.npcs || []).some((n) => n.townCritter && Number.isFinite(n.x) && Math.hypot(n.x - x, n.y - y) < 1.1) &&
    !(G.player && Math.hypot(G.player.x - x, G.player.y - y) < 2.1);
  const land = [];
  // This one-time map scan supplies all species with safe, walkable resting points.
  for (let y = 3; y < map.h - 3; y += 1) for (let x = 3; x < map.w - 3; x += 1) {
    const px = x + 0.5, py = y + 0.5;
    if (safe(px, py)) land.push({ x: px, y: py });
  }
  const counts = { scorpion: rng.int(2, 3), scarab: rng.int(4, 6), snake: rng.int(1, 2) };
  const habitats = {
    scorpion: land.filter((p) => rocks.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 2.8)),
    scarab: land.filter((p) => (map.v?.[Math.floor(p.y) * map.w + Math.floor(p.x)] ?? 0) < 30 || vegetation.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 3.2)),
    snake: land.filter((p) => shade.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 3.1)),
  };
  // Keep the preferred habitats where available, falling back to safe open ground on unusual maps.
  for (const species of Object.keys(counts)) if (habitats[species].length < counts[species] * 2) habitats[species] = land;
  const placed = [];
  for (const [species, count] of Object.entries(counts)) {
    const variants = ANIMALS.filter((v) => v.species === species), spots = habitats[species];
    if (!variants.length || !spots.length) continue;
    for (let i = 0; i < count; i++) {
      const open = spots.filter((p) => placed.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= 0.9));
      const candidates = open.length ? open : spots;
      const at = candidates[rng.int(0, candidates.length - 1)];
      if (!at) continue;
      const v = variants[0], a = {
        id: `act2_${species}_${i}`, name: v.name, role: species, group: 'animal', townAgent: true,
        townCritter: true, animal: true, species, wild: false, passive: true,
        targetable: false, hostile: false, sprite: 'townsfolk', townsfolkSpriteId: v.spriteId, spriteId: v.spriteId,
        townsfolkId: v.id, frameCount: v.frame.count, idleH: v.h, speed: v.speed, runSpeed: v.run,
        x: at.x, y: at.y, flip: false, animT: rand(0, 6), walkT: 0, idleSeed: randi(0, 9),
        walking: false, running: false, path: null, goal: null, waitT: rand(1, 5), turnT: 0,
        renderScale: species === 'scorpion' ? 0.20 : species === 'scarab' ? 0.12 : 0.30,
        talkText: '', talkT: 0, talkAge: 0, icon: null, iconT: 0, iconAge: 0,
        nextReactionAt: 0, nextTalkAt: 0,
        use() {
          if (species === 'snake' && Math.random() < 0.65 && (G.time || 0) >= a.nextTalkAt) {
            a.nextTalkAt = (G.time || 0) + rand(5, 10); a.talkText = 'Ssssss...'; a.talkT = 2.2; a.talkAge = 0; a.iconT = 0;
          }
        },
      };
      a.update = (dt) => updateDesertCritter(a, dt, map, spots, rng, restricted);
      world.npcs.push(a); placed.push(a);
    }
  }
  return placed.length;
}

function updateDesertCritter(a, dt, map, spots, rng, restricted) {
  a.animT += dt;
  a.iconAge += dt; a.talkAge += dt;
  a.iconT = Math.max(0, a.iconT - dt); a.talkT = Math.max(0, a.talkT - dt);
  a.waitT = Math.max(0, a.waitT - dt);
  a.turnT = Math.max(0, a.turnT - dt);
  a.scorpionDefendT = Math.max(0, (a.scorpionDefendT || 0) - dt);
  a.snakeDefendT = Math.max(0, (a.snakeDefendT || 0) - dt);
  a.walking = false;
  const player = G.player, playerDistance = player ? Math.hypot(player.x - a.x, player.y - a.y) : Infinity;
  const close = a.species === 'scarab' ? 3.0 : a.species === 'snake' ? 1.9 : 2.25;
  if (player && playerDistance < close && (G.time || 0) >= a.nextReactionAt) {
    const reaction = a.species === 'scarab' ? rand(6, 10) : a.species === 'snake' ? rand(10, 16) : rand(7, 12);
    a.nextReactionAt = (G.time || 0) + reaction;
    a.icon = a.species === 'scarab' ? 'surprise' : 'alarm'; a.iconT = a.species === 'snake' ? 1.25 : 1.4; a.iconAge = 0;
    if (a.species === 'scorpion') a.scorpionDefendT = 1.2;
    if (a.species === 'snake') a.snakeDefendT = 0.55;
    const awayX = a.x + (a.x - player.x) / Math.max(0.1, playerDistance), awayY = a.y + (a.y - player.y) / Math.max(0.1, playerDistance);
    const minRetreat = a.species === 'scorpion' ? 2.2 : a.species === 'scarab' ? 3.2 : 1.8;
    let retreat = null;
    for (let i = 0; i < 10; i++) {
      const q = spots[rng.int(0, spots.length - 1)];
      if (Math.hypot(q.x - a.x, q.y - a.y) < minRetreat || Math.hypot(q.x - player.x, q.y - player.y) < close + 1.2) continue;
      const path = map.findPath(a.x, a.y, q.x, q.y, 900, 0.16);
      if (!path?.length || path.some(([x, y]) => restricted(x, y))) continue;
      if (!retreat || Math.hypot(q.x - awayX, q.y - awayY) < Math.hypot(retreat.goal[0] - awayX, retreat.goal[1] - awayY)) retreat = { path, goal: [q.x, q.y] };
    }
    if (retreat) {
      a.path = retreat.path; a.goal = retreat.goal; a.waitT = a.species === 'scarab' ? 0 : 0.25;
      a.turnT = a.species === 'scarab' ? 0.08 : a.species === 'snake' ? 0.55 : 0.2;
      a.running = a.species === 'scarab';
    }
  }
  if (a.goal && a.path?.length && a.turnT <= 0) {
    const [tx, ty] = a.path[0], dx = tx - a.x, dy = ty - a.y, length = Math.hypot(dx, dy);
    if (length < 0.1) { a.path.shift(); if (!a.path.length) { a.goal = null; a.running = false; a.waitT = a.species === 'snake' ? rand(4, 9) : rand(2, 6); } }
    else {
      const step = Math.min(length, (a.running ? a.runSpeed : a.speed) * dt), x = a.x + dx / length * step, y = a.y + dy / length * step;
      if (G.player && Math.hypot(G.player.x - x, G.player.y - y) < 0.78) {
        a.goal = a.path = null; a.waitT = 1.2;
      } else if (map.walkable(x, y) && map.circleFree(x, y, 0.14) && !restricted(x, y)) {
        a.flip = townFacingFlip(x - a.x, y - a.y, a.flip);
        a.x = x; a.y = y; a.walking = true; a.walkT += dt;
      } else { a.goal = a.path = null; a.running = false; a.waitT = 1.5; }
    }
  } else if (a.waitT <= 0 && spots.length) {
    for (let tries = 0; tries < 4; tries++) {
      const q = spots[rng.int(0, spots.length - 1)];
      if (Math.hypot(q.x - a.x, q.y - a.y) < 2.2) continue;
      const path = map.findPath(a.x, a.y, q.x, q.y, 900, 0.16);
      if (!path?.length || path.some(([x, y]) => restricted(x, y))) continue;
      a.path = path; a.goal = [q.x, q.y]; a.waitT = rand(5, 10); a.turnT = 0.4;
      a.running = false;
      break;
    }
    if (!a.goal) a.waitT = rand(3, 6);
  }
  if (!a.walking) a.walkT = 0;
}

export function makeAnimal(d, v, x, y, opts = {}) {
  if (!d.map.walkable(x, y)) [x, y] = d.map.randomNear(x, y, 1.5) || [x, y];
  return d.makeAgent(v, x, y, { animal: true, species: v.species, wild: v.where === 'edge', speed: v.speed, runSpeed: v.run, idleH: v.h,
    name: v.name.startsWith('a ') ? v.name[2].toUpperCase() + v.name.slice(3) : v.name, reach: 1.3, ...opts });
}

/** A click or a passing hero: dogs wag and bark, cats purr or stalk off, wild things bolt. */
export function animalGreet(d, a, clicked) {
  if (a.wild) { if (clicked || heroDist(a) < 3) bolt(d, a); return; }
  if (a.species === 'chicken') {
    if (clicked && a.talkT <= 0 && d.time >= (a.nextChickenTalkAt || 0)) {
      a.nextChickenTalkAt = d.time + rand(2.5, 4.5); d.face(a, G.player?.x ?? a.x, G.player?.y ?? a.y);
      d.say(a, pick(SOUNDS.chicken), null, 1.45);
    }
    return;
  }
  d.face(a, G.player?.x ?? a.x, G.player?.y ?? a.y);
  if (a.species === 'dog') { d.feel(a, chance(0.5) ? 'excited' : 'happy', 3); if (clicked || chance(0.5)) d.say(a, pick(SOUNDS.dog), null, 1.6); }
  else { d.feel(a, chance(0.7) ? 'love' : 'suspicious', 3); if (clicked) d.say(a, pick(SOUNDS.cat), null, 1.6); }
}

/** Run from the hero (or `from`): a startle, then a bound to somewhere far. */
function bolt(d, a, from = G.player) {
  if (!from || a.boltT > d.time) return;
  a.boltT = d.time + (a.species === 'chicken' ? rand(5.5, 8) : 4);
  const ang = Math.atan2(a.y - from.y, a.x - from.x) + rand(-0.5, 0.5), far = a.species === 'deer' ? 11 : 7;
  const goal = a.species === 'chicken' ? d.chickenSpot([a.x + Math.cos(ang) * 5, a.y + Math.sin(ang) * 5], 1.5, from) :
    a.wild ? d.edgeSpot([a.x + Math.cos(ang) * far, a.y + Math.sin(ang) * far], 6) : d.map.randomNear(a.x + Math.cos(ang) * far, a.y + Math.sin(ang) * far, 2) || d.randomSpot();
  if (a.species === 'chicken' && !goal) return;
  if (a.species === 'chicken') { a.icon = 'chicken'; a.iconT = 1.1; a.iconAge = 0; }
  else d.feel(a, 'scared', 0.7);
  a.fleeing = true;
  setTimeout0(d, a.species === 'chicken' ? 0.12 : 0.45, () => {
    if (a.species === 'chicken') {
      let moved = d.chickenGoal(a, goal, true);
      for (let i = 0; !moved && i < 6; i++) moved = d.chickenGoal(a, d.chickenSpot([a.x, a.y], 1.5, from), true);
      a.fleeing = moved;
    } else { d.go(a, goal[0], goal[1], true); a.fleeing = true; }
  });
}
// a delayed call on the director's clock (scenes are generators; this is a one-liner)
function setTimeout0(d, s, fn) { d.run((function* () { yield s; fn(); })(), []); }

/** The routine of a free animal (townlife.js pickRoutine hands animals here). */
export function* animalRoutine(d, a) {
  if (a.wild) return yield* wildRoutine(d, a);
  if (a.species === 'chicken') return yield* chickenRoutine(d, a);
  const r = Math.random();
  const people = d.agents.filter((q) => !q.animal && !q.adv && !q.hidden && !q.busy && dist(q.x, q.y, a.x, a.y) < 10);
  if (a.species === 'cat') {
    const dog = d.agents.find((q) => q.species === 'dog' && !q.hidden && dist(q.x, q.y, a.x, a.y) < 3.5);
    if (dog) { d.face(a, dog); d.feel(a, 'angry', 1.6); yield 1.6; const [x, y] = d.randomSpot(); yield d.go(a, x, y, true); d.feel(a, 'suspicious', 3); yield 3; return; }
    if (r < 0.3) { const spot = d.spots.benches.length && chance(0.5) ? pick(d.spots.benches) : null; if (spot) yield d.go(a, spot.x + rand(0.5, 0.9), spot.y + rand(0.5, 0.9)); const dur = rand(14, 30); d.feel(a, 'sleep', dur); yield dur; return; }
    if (r < 0.55 && people.length) { yield* nuzzle(d, a, pick(people), 'Aww, puss!'); return; }
    if (r < 0.7) { d.feel(a, 'happy', rand(3, 5)); yield 4; return; } // a wash
  } else {
    // dogs
    const cat = d.agents.find((q) => q.species === 'cat' && !q.hidden && !q.busy && dist(q.x, q.y, a.x, a.y) < 9);
    if (cat && r < 0.25) { yield* chaseCat(d, a, cat); return; }
    if (r < 0.45 && G.player && heroDist(a) < 12) {
      yield d.go(a, G.player.x + rand(-1, 1), G.player.y + rand(0.6, 1.2), true);
      d.face(a, G.player.x, G.player.y); d.feel(a, 'excited', 3);
      if (d.canSpeak(a)) d.say(a, pick(SOUNDS.dog), null, 1.6);
      yield 3; return;
    }
    if (r < 0.65 && people.length) { yield* nuzzle(d, a, pick(people), pick(['Good dog!', 'Who\'s a good dog?', 'Sit! ...Close enough.'])); return; }
    if (r < 0.75) { const dur = rand(10, 20); d.feel(a, 'sleep', dur); yield dur; return; }
  }
  // a little stroll, a sniff
  const [x, y] = chance(0.5) ? d.map.randomNear(a.x + rand(-5, 5), a.y + rand(-5, 5), 2) || d.randomSpot() : d.randomSpot();
  yield d.go(a, x, y);
  d.feel(a, a.species === 'dog' ? 'point' : 'curious', 2);
  yield rand(2, 6);
}

/** Chickens keep to walkable town lanes, peck at the ground, and cluck only occasionally. */
function* chickenRoutine(d, a) {
  if (d.time >= (a.nextCluckAt || 0)) {
    a.nextCluckAt = d.time + rand(16, 30);
    if (chance(0.7)) {
      a.chickenCluckT = 0.28;
      sfx('cluck', 0.2, rand(0.92, 1.08), { category: 'ambient', source: 'Act I town chicken', sourceActive: false });
      yield 0.18;
    }
  }
  if (chance(0.62)) {
    a.chickenPeckT = rand(0.75, 1.1);
    a.chickenPeckDuration = a.chickenPeckT;
    yield () => a.chickenPeckT <= 0;
    yield rand(1.2, 2.8);
    return;
  }
  if (a.fleeing) { yield () => !a.goal; a.fleeing = false; yield rand(0.4, 1.1); return; }
  if (chance(0.34)) { yield rand(2.2, 5.5); return; } // a quiet rest between short garden strolls
  let target = null;
  for (let i = 0; i < 8; i++) {
    const q = d.chickenSpot([a.x, a.y], rand(1.5, 4.2), G.player);
    if (q && d.chickenGoal(a, q)) { target = q; break; }
  }
  if (target) yield () => !a.goal;
  else yield rand(1.5, 3.5);
}

function* nuzzle(d, a, q, line) {
  q.busy = a.busy;
  yield d.go(a, q.x + rand(-0.6, 0.6), q.y + rand(0.4, 0.7));
  d.face(a, q); d.face(q, a);
  d.feel(a, a.species === 'dog' ? 'excited' : 'love', 4);
  d.feel(q, 'love', 4);
  if (chance(0.5)) yield* d.line(q, line, 'love', 0, 1.5); else yield 3;
  if (q.busy === a.busy) { q.busy = null; q.nextT = rand(1, 4); }
  yield 1;
}

function* chaseCat(d, a, cat) {
  if (cat.busy) d.release(cat.busy);
  cat.busy = a.busy;
  d.face(cat, a); d.feel(cat, 'angry', 1.2); d.feel(a, 'excited', 1.2);
  if (d.canSpeak(a)) d.say(a, 'WOOF!', null, 1.2);
  yield 1.2;
  for (let i = 0; i < randi(2, 4); i++) {
    const [x, y] = d.randomSpot();
    d.go(cat, x, y, true); d.feel(cat, 'scared', 3);
    yield 0.5;
    d.go(a, cat.x, cat.y, true); d.feel(a, 'excited', 3);
    for (let k = 0; k < 8 && cat.goal; k++) { yield 0.4; d.go(a, cat.x, cat.y, true); }
  }
  // the cat wins: up on a bench or out of reach, glaring
  d.feel(cat, 'suspicious', 4); d.feel(a, 'confused', 3);
  if (cat.busy === a.busy) { cat.busy = null; cat.nextT = rand(3, 6); }
  yield 3;
}

function* wildRoutine(d, a) {
  // graze or sniff a while, a few steps between, always ready to bolt
  const spells = randi(2, 4);
  for (let s = 0; s < spells; s++) {
    const graze = rand(3, 8);
    for (let t = 0; t < graze; t += 0.3) {
      if (heroDist(a) < (a.species === 'deer' ? 6 : 4)) { bolt(d, a); yield () => !a.goal; a.fleeing = false; d.feel(a, a.species === 'deer' ? 'suspicious' : 'scared', 2); yield 2; return; }
      // a rat by people makes them jump
      if (a.species === 'rat' && (a.squeakT = (a.squeakT || 0) - 0.3) <= 0) {
        const q = d.agents.find((p) => !p.animal && !p.adv && !p.hidden && !p.busy && dist(p.x, p.y, a.x, a.y) < 2.2);
        if (q) { a.squeakT = 25; d.face(q, a); d.run((function* () { yield* d.line(q, pick(['Rat!', 'Eek! A rat!', 'Shoo! Shoo!', 'Get out of it!']), 'scared', 0, 1); })(), [q]); bolt(d, a, q); yield () => !a.goal; return; }
      }
      yield 0.3;
    }
    if (chance(0.4)) d.feel(a, a.species === 'rabbit' ? 'happy' : 'curious', 2);
    const [x, y] = d.edgeSpot([a.x, a.y], a.species === 'deer' ? 5 : 3.5);
    yield d.go(a, x, y);
  }
  yield rand(1, 3);
}

/** For events: an animal of a species already in town, or a new one at (x, y). */
export function castAnimal(d, species, x, y, pickOne = null) {
  const have = d.agents.find((a) => a.species === species && !a.eventRole && (!pickOne || a.id === pickOne));
  if (have) { if (have.busy && have.busy !== d.event) d.release(have.busy); return have; }
  const v = pickOne ? ANIMALS.find((q) => q.id === pickOne) : pick(ANIMALS.filter((q) => q.species === species));
  return v ? makeAnimal(d, v, x, y) : null;
}
export { bolt as animalBolt };
