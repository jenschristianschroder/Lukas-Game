import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVault, createGame, distanceMap, findPath, isFloor, moveBody, pulse, throwDecoy, step, score, distance } from '../src/engine.js';

function advance(game, seconds, input = {}) { for (let t = 0; t < seconds; t += 1 / 60) step(game, 1 / 60, input); }
function openFixture() {
  const g = createGame({ seed: 123 });
  g.world.floor.fill(0);
  for (let y = 1; y < g.world.height - 1; y++) for (let x = 1; x < g.world.width - 1; x++) g.world.floor[y * g.world.width + x] = 1;
  g.world.candidates = [];
  for (let y = 1; y < g.world.height - 1; y++) for (let x = 1; x < g.world.width - 1; x++) g.world.candidates.push({ x: x + .5, y: y + .5 });
  g.world.relics = [{ x: 20.5, y: 20.5 }, { x: 22.5, y: 20.5 }, { x: 24.5, y: 20.5 }];
  g.world.supplies = []; g.player = { x: 9.5, y: 10.5, angle: 0 };
  g.enemies = [{ x: 18.5, y: 10.5, target: null, path: [], alert: 0, state: 'patrol', repath: 0, patrolWait: 999, visibleUntil: 0 }];
  return g;
}

test('300 procedural vaults are connected, bounded, and have three distinct, reachable relics', () => {
  for (let seed = 0; seed < 300; seed++) {
    const w = generateVault(seed), d = distanceMap(w, w.exit);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
      const i = y * w.width + x;
      if (x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1) assert.equal(w.floor[i], 0, `boundary ${seed}`);
      if (w.floor[i]) assert.ok(d[i] >= 0, `disconnected seed ${seed}, ${x},${y}`);
    }
    assert.equal(new Set(w.relics.map(p => `${p.x},${p.y}`)).size, 3);
    for (const relic of w.relics) {
      assert.ok(d[Math.floor(relic.y) * w.width + Math.floor(relic.x)] >= 8);
      const path = findPath(w, w.exit, relic); assert.ok(path.length >= 8);
      let previous = w.exit;
      for (const p of path) { assert.equal(distance(previous, p), 1); assert.ok(isFloor(w, p.x, p.y)); previous = p; }
      assert.deepEqual(previous, { x: relic.x, y: relic.y });
    }
    for (const supply of w.supplies) assert.ok(d[Math.floor(supply.y) * w.width + Math.floor(supply.x)] > 0);
  }
});
test('same seed recreates the exact vault and a different seed changes it', () => {
  const a = generateVault(924), b = generateVault(924), c = generateVault(925);
  assert.deepEqual(a, b); assert.notDeepEqual(a.floor, c.floor);
});
test('all difficulties spawn creatures far from the sanctuary', () => {
  for (let seed = 1; seed < 60; seed++) for (const difficulty of ['scout', 'standard', 'deep']) {
    const g = createGame({ seed, difficulty }); assert.equal(g.enemies.length, difficulty === 'deep' ? 2 : 1);
    for (const e of g.enemies) { assert.ok(isFloor(g.world, e.x, e.y)); assert.ok(distance(e, g.player) > 10); }
  }
});
test('collisions prevent wall tunnelling and diagonal corner clipping', () => {
  const g = openFixture();
  for (let y = 1; y < g.world.height - 1; y++) g.world.floor[y * g.world.width + 11] = 0;
  const body = { x: 9.5, y: 8.5 }; moveBody(g.world, body, 30, 0);
  assert.ok(body.x < 10.78); assert.equal(body.y, 8.5);
  moveBody(g.world, body, 8, 3); assert.ok(body.x < 10.78); assert.ok(body.y > 11);
  assert.ok(isFloor(g.world, body.x + .23, body.y + .23));
});
test('sonar expands outward, fades, recharges, and draws the creature to its origin', () => {
  const g = openFixture(), initial = { ...g.player };
  assert.ok(pulse(g)); assert.equal(pulse(g), false); assert.equal(g.pulseCount, 1);
  assert.equal(g.enemies[0].state, 'searching'); assert.deepEqual(g.enemies[0].target, { x: initial.x, y: initial.y });
  const index = 10 * g.world.width + 17;
  assert.ok(g.reveal[index] < g.time);
  advance(g, .85); assert.ok(g.reveal[index] > g.time); assert.ok(g.enemies[0].x < 18.5);
  g.enemies = []; advance(g, 5); assert.ok(g.reveal[index] < g.time); assert.ok(pulse(g));
});
test('the creature investigates sound positions instead of tracking silently moving players', () => {
  const g = openFixture(); pulse(g); const origin = { ...g.enemies[0].target };
  advance(g, 1, { x: 0, y: 1, sneak: true });
  assert.ok(g.player.y > 11); assert.deepEqual(g.enemies[0].target, origin);
});
test('normal nearby footsteps attract the creature and sneaking does not', () => {
  const normal = openFixture(); normal.enemies[0].x = 13.5;
  advance(normal, .2, { x: 0, y: 1 }); assert.equal(normal.enemies[0].state, 'searching');
  const quiet = openFixture(); quiet.enemies[0].x = 13.5;
  advance(quiet, .2, { x: 0, y: 1, sneak: true }); assert.equal(quiet.enemies[0].state, 'patrol');
});
test('decoys consume a charge and attract enemies to a different reachable position', () => {
  const g = openFixture(); assert.ok(throwDecoy(g)); assert.equal(g.decoys, 2); assert.equal(g.enemies[0].state, 'lured');
  const lure = g.lures[0]; assert.ok(lure.x > g.player.x); assert.ok(findPath(g.world, g.player, lure).length >= 5);
  assert.equal(throwDecoy(g), false); assert.equal(g.decoys, 2);
  advance(g, 2.1); assert.ok(throwDecoy(g));
  g.decoys = 0; g.decoyCooldown = 0; assert.equal(throwDecoy(g), false);
});
test('air and decoy pickups are collected only once and respect resource limits', () => {
  const g = openFixture(); g.enemies = []; g.remaining = 50;
  g.world.supplies = [{ ...g.player, type: 'air', taken: false }];
  advance(g, .1); assert.ok(g.remaining > 74 && g.remaining < 75); advance(g, .1); assert.ok(g.remaining < 75);
  g.world.supplies = [{ ...g.player, type: 'decoy', taken: false }];
  g.decoys = 5; step(g, .01); assert.equal(g.decoys, 5); assert.equal(g.world.supplies[0].taken, false);
  g.decoys = 4; step(g, .01); assert.equal(g.decoys, 5); assert.equal(g.world.supplies[0].taken, true);
});
test('relics are unique pickups; extraction requires all three and the lift', () => {
  const g = openFixture(); g.enemies = []; g.player = { ...g.world.exit, angle: 0 }; step(g, .01); assert.equal(g.status, 'playing');
  for (const relic of g.world.relics) { Object.assign(g.player, relic); step(g, .01); }
  assert.equal(g.collected, 3); assert.equal(g.status, 'playing'); step(g, .01); assert.equal(g.collected, 3);
  Object.assign(g.player, g.world.exit); step(g, .01); assert.equal(g.status, 'won'); assert.ok(score(g) >= 1500);
  const time = g.time; advance(g, 1); assert.equal(g.time, time);
});
test('capture, lift safety, and oxygen exhaustion produce the correct outcomes', () => {
  const caught = openFixture(); Object.assign(caught.enemies[0], caught.player); step(caught, .01); assert.equal(caught.reason, 'caught'); assert.equal(caught.status, 'lost');
  const safe = openFixture(); Object.assign(safe.player, safe.world.exit); Object.assign(safe.enemies[0], safe.world.exit); step(safe, .01); assert.equal(safe.status, 'playing');
  const air = openFixture(); air.remaining = .01; step(air, .02); assert.equal(air.reason, 'air'); assert.equal(air.status, 'lost');
});
test('simulation time is bounded after delayed frames', () => {
  const g = openFixture(); const before = g.remaining; step(g, 90); assert.ok(before - g.remaining <= .051);
});
