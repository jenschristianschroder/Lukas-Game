// Pure simulation: seconds, tiles, and a seeded random generator. No DOM or audio.
export const DIFFICULTIES = {
  scout: { name: 'Scout', seconds: 240, speed: 1.18, enemies: 1, memory: 5.6 },
  standard: { name: 'Standard', seconds: 200, speed: 1.48, enemies: 1, memory: 4.3 },
  deep: { name: 'Deep vault', seconds: 175, speed: 1.65, enemies: 2, memory: 3.3 },
};
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function randomFromSeed(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function isFloor(world, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  return x >= 0 && y >= 0 && x < world.width && y < world.height && world.floor[y * world.width + x] === 1;
}
export function distanceMap(world, origin) {
  const d = new Int16Array(world.width * world.height).fill(-1);
  const first = Math.floor(origin.y) * world.width + Math.floor(origin.x);
  if (!world.floor[first]) return d;
  const queue = [first]; d[first] = 0;
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i], x = at % world.width, y = Math.floor(at / world.width);
    for (const [dx, dy] of DIRS) {
      if (!isFloor(world, x + dx, y + dy)) continue;
      const next = (y + dy) * world.width + x + dx;
      if (d[next] < 0) { d[next] = d[at] + 1; queue.push(next); }
    }
  }
  return d;
}
export function findPath(world, from, to) {
  const d = distanceMap(world, to);
  let x = Math.floor(from.x), y = Math.floor(from.y);
  if (d[y * world.width + x] < 0) return [];
  const result = [];
  while (d[y * world.width + x] > 0) {
    const current = d[y * world.width + x];
    const step = DIRS.find(([dx, dy]) => isFloor(world, x + dx, y + dy) && d[(y + dy) * world.width + x + dx] === current - 1);
    if (!step) break;
    x += step[0]; y += step[1]; result.push({ x: x + .5, y: y + .5 });
  }
  return result;
}
export function generateVault(seed) {
  const random = randomFromSeed(seed), width = 31, height = 23;
  const world = { width, height, floor: new Uint8Array(width * height), seed: seed >>> 0 };
  const carve = (x, y) => { world.floor[y * width + x] = 1; };
  const stack = [[1, 1]]; carve(1, 1);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const choices = DIRS.filter(([dx, dy]) => {
      const xx = x + dx * 2, yy = y + dy * 2;
      return xx > 0 && yy > 0 && xx < width - 1 && yy < height - 1 && !isFloor(world, xx, yy);
    });
    if (!choices.length) { stack.pop(); continue; }
    const [dx, dy] = choices[Math.floor(random() * choices.length)];
    carve(x + dx, y + dy); carve(x + dx * 2, y + dy * 2); stack.push([x + dx * 2, y + dy * 2]);
  }
  // Connected rooms and loops keep the maze readable and allow escapes.
  for (let i = 0; i < 10; i++) {
    const x = 1 + Math.floor(random() * 12) * 2, y = 1 + Math.floor(random() * 8) * 2;
    const w = 3 + Math.floor(random() * 2) * 2, h = 3 + Math.floor(random() * 2) * 2;
    for (let yy = y; yy < Math.min(y + h, height - 1); yy++) for (let xx = x; xx < Math.min(x + w, width - 1); xx++) carve(xx, yy);
  }
  for (let i = 0; i < 90; i++) {
    const x = 2 + Math.floor(random() * (width - 4)), y = 2 + Math.floor(random() * (height - 4));
    if ((isFloor(world, x - 1, y) && isFloor(world, x + 1, y)) || (isFloor(world, x, y - 1) && isFloor(world, x, y + 1))) carve(x, y);
  }
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) carve(x, y);
  world.exit = { x: 2.5, y: 2.5 };
  const candidates = [];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) if (isFloor(world, x, y)) candidates.push({ x: x + .5, y: y + .5 });
  const maps = [distanceMap(world, world.exit)];
  const relics = [];
  for (let i = 0; i < 3; i++) {
    let best, bestValue = -1;
    for (const p of candidates) {
      const idx = Math.floor(p.y) * width + Math.floor(p.x);
      const value = Math.min(...maps.map(m => m[idx])) + random() * 3;
      if (value > bestValue) { bestValue = value; best = p; }
    }
    relics.push({ ...best, taken: false, id: i }); maps.push(distanceMap(world, best));
  }
  world.relics = relics;
  const occupied = [world.exit, ...relics];
  world.supplies = [];
  for (let i = 0; i < 5; i++) {
    const valid = candidates.filter(p => occupied.every(o => distance(p, o) > 4));
    if (!valid.length) break;
    const p = valid[Math.floor(random() * valid.length)]; occupied.push(p);
    world.supplies.push({ ...p, taken: false, type: i % 2 ? 'decoy' : 'air' });
  }
  world.candidates = candidates;
  return world;
}
export function createGame({ seed = Date.now() >>> 0, difficulty = 'standard', mode = 'solo' } = {}) {
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.standard, world = generateVault(seed);
  const exitDistances = distanceMap(world, world.exit);
  const far = [...world.candidates].filter(p => exitDistances[Math.floor(p.y) * world.width + Math.floor(p.x)] > 24);
  far.sort((a, b) => distance(b, world.exit) - distance(a, world.exit));
  const game = {
    world, seed: seed >>> 0, difficulty, config, mode, random: randomFromSeed(seed ^ 0x13af),
    player: { ...world.exit, angle: 0 }, enemies: [], time: 0, remaining: config.seconds,
    status: 'playing', reason: '', collected: 0, decoys: 3, pulseCooldown: 0, pulseCount: 0,
    decoyCooldown: 0, pulses: [], lures: [], events: [], footstep: 0, moving: false, sneaking: false,
    reveal: new Float32Array(world.width * world.height).fill(-100),
    seen: new Uint8Array(world.width * world.height), trail: [], trailTimer: 0, threat: 0,
  };
  for (let i = 0; i < config.enemies; i++) {
    const p = far[Math.min(far.length - 1, i * Math.floor(far.length / 2))] || world.relics[i];
    game.enemies.push({ ...p, target: null, path: [], repath: 0, alert: 0, state: 'patrol', visibleUntil: 0, patrolWait: 5 });
  }
  // The lift area is softly lit; the rest must be scanned.
  revealArea(game, world.exit, 4, config.memory);
  return game;
}
function revealArea(game, origin, radius, duration) {
  const { world } = game;
  for (let y = Math.max(0, Math.floor(origin.y - radius)); y <= Math.min(world.height - 1, Math.ceil(origin.y + radius)); y++) {
    for (let x = Math.max(0, Math.floor(origin.x - radius)); x <= Math.min(world.width - 1, Math.ceil(origin.x + radius)); x++) {
      if (Math.hypot(x + .5 - origin.x, y + .5 - origin.y) <= radius) {
        const index = y * world.width + x;
        game.reveal[index] = Math.max(game.reveal[index], game.time + duration);
        game.seen[index] = 1;
      }
    }
  }
}
function emit(game, type, extra = {}) { game.events.push({ type, ...extra }); }
function noise(game, point, radius, duration, kind) {
  const distances = distanceMap(game.world, point);
  for (const enemy of game.enemies) {
    const d = distances[Math.floor(enemy.y) * game.world.width + Math.floor(enemy.x)];
    if (d >= 0 && d <= radius && (kind !== 'step' || enemy.state !== 'lured')) {
      if (!enemy.target || distance(enemy.target, point) > .3) enemy.repath = 0;
      enemy.target = { x: point.x, y: point.y }; enemy.alert = duration;
      enemy.state = kind === 'decoy' ? 'lured' : 'searching';
    }
  }
}
export function pulse(game) {
  if (game.status !== 'playing' || game.pulseCooldown > 0) return false;
  game.pulseCooldown = 4.5; game.pulseCount++;
  game.pulses.push({ ...game.player, age: 0, radius: 0, max: 11 });
  noise(game, game.player, 36, 13, 'pulse');
  emit(game, 'pulse'); return true;
}
export function throwDecoy(game) {
  if (game.status !== 'playing' || game.decoys <= 0 || game.decoyCooldown > 0) return false;
  const d = distanceMap(game.world, game.player), facing = { x: Math.cos(game.player.angle), y: Math.sin(game.player.angle) };
  let target = null, score = -Infinity;
  for (const p of game.world.candidates) {
    const n = d[Math.floor(p.y) * game.world.width + Math.floor(p.x)];
    if (n < 5 || n > 8 || distance(p, game.player) < 3) continue;
    const delta = { x: p.x - game.player.x, y: p.y - game.player.y };
    const value = (delta.x * facing.x + delta.y * facing.y) / distance(p, game.player) * 8 + n * .3;
    if (value > score) { score = value; target = p; }
  }
  if (!target) return false;
  game.decoys--; game.decoyCooldown = 2;
  game.lures.push({ ...target, life: 7, tick: 0 });
  noise(game, target, 48, 8, 'decoy');
  revealArea(game, target, 1.8, 7); emit(game, 'decoy'); return true;
}
function canStand(world, x, y, radius) {
  for (const dx of [-radius, radius]) for (const dy of [-radius, radius]) if (!isFloor(world, x + dx, y + dy)) return false;
  return true;
}
export function moveBody(world, body, dx, dy, radius = .23) {
  // Substeps prevent wall tunnelling even when a frame is delayed.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / .12));
  for (let i = 0; i < steps; i++) {
    if (canStand(world, body.x + dx / steps, body.y, radius)) body.x += dx / steps;
    if (canStand(world, body.x, body.y + dy / steps, radius)) body.y += dy / steps;
  }
}
export function step(game, dt, input = {}) {
  if (game.status !== 'playing') return;
  dt = Math.min(.05, Math.max(0, dt));
  game.time += dt; game.remaining = Math.max(0, game.remaining - dt);
  game.pulseCooldown = Math.max(0, game.pulseCooldown - dt);
  game.decoyCooldown = Math.max(0, game.decoyCooldown - dt);
  let mx = input.x || 0, my = input.y || 0;
  const magnitude = Math.hypot(mx, my);
  if (magnitude > 1) { mx /= magnitude; my /= magnitude; }
  game.moving = magnitude > .08;
  game.sneaking = !!input.sneak || (magnitude > .08 && magnitude < .55);
  if (game.moving) {
    game.player.angle = Math.atan2(my, mx);
    const speed = game.sneaking ? 1.65 : 2.85;
    const before = { ...game.player };
    moveBody(game.world, game.player, mx * speed * dt, my * speed * dt);
    if (distance(before, game.player) > .001) {
      game.footstep -= dt;
      if (game.footstep <= 0) {
        game.footstep = game.sneaking ? .58 : .37;
        if (!game.sneaking) noise(game, game.player, 5.5, 4.5, 'step');
        emit(game, 'step', { quiet: game.sneaking });
      }
    }
  }
  revealArea(game, game.player, 1.8, .6);
  // A faint trail remembers only the route actually walked, not every scanned corridor.
  game.trailTimer -= dt;
  if (game.moving && game.trailTimer <= 0) {
    game.trailTimer = .45; game.trail.push({ x: game.player.x, y: game.player.y });
    if (game.trail.length > 400) game.trail.shift();
  }
  for (const p of game.pulses) {
    p.age += dt; p.radius = Math.min(p.max, p.age * 10);
    // Wave arrival governs reveal timing; rooms gradually fade after the wave passes.
    for (let y = Math.max(0, Math.floor(p.y - p.radius)); y < Math.min(game.world.height, p.y + p.radius + 1); y++) {
      for (let x = Math.max(0, Math.floor(p.x - p.radius)); x < Math.min(game.world.width, p.x + p.radius + 1); x++) {
        const d = Math.hypot(x + .5 - p.x, y + .5 - p.y);
        if (d <= p.radius && d >= p.radius - dt * 10 - .75) {
          const index = y * game.world.width + x;
          game.reveal[index] = game.time + game.config.memory; game.seen[index] = 1;
        }
      }
    }
    for (const enemy of game.enemies) if (distance(enemy, p) <= p.radius && distance(enemy, p) >= p.radius - .9) enemy.visibleUntil = game.time + game.config.memory;
  }
  game.pulses = game.pulses.filter(p => p.age < 1.35);
  for (const lure of game.lures) {
    lure.life -= dt; lure.tick -= dt;
    if (lure.tick <= 0) { lure.tick = 1.3; noise(game, lure, 48, 4, 'decoy'); }
  }
  game.lures = game.lures.filter(l => l.life > 0);
  for (const enemy of game.enemies) {
    enemy.alert = Math.max(0, enemy.alert - dt); enemy.repath -= dt; enemy.patrolWait -= dt;
    if (enemy.alert === 0 && enemy.state !== 'patrol') { enemy.state = 'patrol'; enemy.target = null; enemy.path = []; enemy.patrolWait = 1.2; }
    if (!enemy.target && enemy.patrolWait <= 0) {
      // Patrol excludes the lift sanctuary and uses only connected floor cells.
      const choices = game.world.candidates.filter(p => distance(p, game.world.exit) > 7 && distance(p, enemy) > 3 && distance(p, enemy) < 12);
      enemy.target = choices[Math.floor(game.random() * choices.length)] || game.world.relics[0]; enemy.repath = 0;
    }
    if (enemy.target && enemy.repath <= 0) {
      const route = findPath(game.world, enemy, enemy.target);
      const center = { x: Math.floor(enemy.x) + .5, y: Math.floor(enemy.y) + .5 };
      // Return to the tile center before a turn so path following never clips a corner.
      enemy.path = distance(enemy, center) > .06 ? [center, ...route] : route;
      enemy.repath = Infinity;
    }
    if (enemy.path.length) {
      const next = enemy.path[0], d = distance(enemy, next);
      const speed = game.config.speed * (enemy.state === 'patrol' ? .67 : 1);
      const travel = Math.min(d, speed * dt);
      if (d > .001) moveBody(game.world, enemy, (next.x - enemy.x) / d * travel, (next.y - enemy.y) / d * travel, .19);
      if (distance(enemy, next) < .05) { enemy.x = next.x; enemy.y = next.y; enemy.path.shift(); }
    } else if (enemy.target && distance(enemy, enemy.target) < .8) {
      if (enemy.state === 'patrol') { enemy.target = null; enemy.patrolWait = 1; }
    }
    // The creature cannot capture through walls or while the runner is inside the lift.
    const near = distance(enemy, game.player);
    const midpoint = { x: (enemy.x + game.player.x) / 2, y: (enemy.y + game.player.y) / 2 };
    if (near < .53 && isFloor(game.world, midpoint.x, midpoint.y) && distance(game.player, game.world.exit) > 1.25) {
      game.status = 'lost'; game.reason = 'caught'; emit(game, 'caught');
    }
  }
  if (game.status !== 'playing') return;
  for (const relic of game.world.relics) if (!relic.taken && distance(game.player, relic) < .65) {
    relic.taken = true; game.collected++; emit(game, 'relic', { count: game.collected });
  }
  for (const supply of game.world.supplies) if (!supply.taken && distance(game.player, supply) < .6) {
    if (supply.type === 'decoy' && game.decoys >= 5) continue;
    supply.taken = true;
    if (supply.type === 'air') game.remaining = Math.min(game.config.seconds, game.remaining + 25);
    else game.decoys++;
    emit(game, 'supply', { kind: supply.type });
  }
  const nearest = Math.min(...game.enemies.map(e => distance(e, game.player)));
  game.threat = Math.max(0, Math.min(1, 1 - nearest / 9));
  if (game.collected === 3 && distance(game.player, game.world.exit) < .85) {
    game.status = 'won'; emit(game, 'won');
  } else if (game.remaining <= 0) { game.status = 'lost'; game.reason = 'air'; emit(game, 'air'); }
}
export function score(game) {
  return game.status === 'won' ? 1500 + Math.ceil(game.remaining) * 10 + Math.max(0, 40 - game.pulseCount) * 15 + game.decoys * 100 : game.collected * 300;
}
export function takeEvents(game) { const events = game.events; game.events = []; return events; }
