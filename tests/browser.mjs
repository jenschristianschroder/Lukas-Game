import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
async function open(viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}?test`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__echoVault);
  return { page, context };
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ scroll: [document.body.scrollWidth, document.body.scrollHeight], view: [innerWidth, innerHeight] }));
  assert.ok(dimensions.scroll[0] <= dimensions.view[0] + 1, 'horizontal overflow');
  assert.ok(dimensions.scroll[1] <= dimensions.view[1] + 1, 'vertical overflow');
  for (const selector of ['#startButton', '#installButton', '#helpButton']) {
    const b = await page.locator(selector).boundingBox();
    assert.ok(b && b.y >= 0 && b.y + b.height <= dimensions.view[1], `${selector} is outside the viewport`);
  }
}
try {
  const { page, context } = await open({ width: 1440, height: 900 });
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/menu-desktop.png' });
  await page.getByRole('button', { name: 'FIELD GUIDE', exact: false }).click();
  await page.getByRole('button', { name: 'UNDERSTOOD' }).click();
  await page.getByRole('button', { name: 'ENTER THE VAULT' }).click();
  const before = await page.evaluate(() => ({ ...window.__echoVault.game.player }));
  await page.keyboard.down('KeyD'); await page.waitForTimeout(200); await page.keyboard.up('KeyD');
  const after = await page.evaluate(() => ({ ...window.__echoVault.game.player }));
  assert.ok(after.x > before.x, 'keyboard movement changes position');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__echoVault.game.pulseCount === 1);
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/game-desktop.png' });
  await page.keyboard.press('Escape');
  assert.ok(await page.getByRole('heading', { name: 'Take a breath.' }).isVisible());
  const oxygen = await page.evaluate(() => window.__echoVault.game.remaining);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__echoVault.game.remaining), oxygen, 'pause freezes oxygen');
  await page.getByRole('button', { name: 'RESUME EXPEDITION' }).click();
  // Walk a generated route through the real simulation to test the result UI. Enemies are
  // removed only in this deterministic extraction test; pursuit is tested in engine.test.js.
  await page.evaluate(async () => {
    const { findPath, distance } = await import('./src/engine.js');
    const api = window.__echoVault;
    api.start(7043); const g = api.game; g.enemies = [];
    for (const target of [...g.world.relics, g.world.exit]) {
      const route = findPath(g.world, g.player, target);
      for (const waypoint of route) {
        let guard = 0;
        while (distance(g.player, waypoint) > .055 && guard++ < 200) {
          const d = distance(g.player, waypoint);
          const dt = Math.min(1 / 60, d / 2.85);
          api.step(dt, { x: (waypoint.x - g.player.x) / d, y: (waypoint.y - g.player.y) / d });
          if (g.status !== 'playing') break;
        }
        if (guard >= 200) throw new Error('Route movement stalled');
        if (g.status !== 'playing') break;
      }
    }
    if (g.status !== 'won') throw new Error(`Extraction failed: ${g.status}, relics ${g.collected}`);
  });
  assert.ok(await page.getByRole('heading', { name: 'Back in the light.' }).isVisible());
  await page.screenshot({ path: 'test-results/extraction.png' });
  await page.getByRole('button', { name: 'RETRY THIS VAULT' }).click();
  assert.equal(await page.evaluate(() => window.__echoVault.game.seed), 7043);
  await page.evaluate(() => { window.__echoVault.game.remaining = .01; window.__echoVault.step(.02); });
  assert.ok(await page.getByRole('heading', { name: 'One breath short.' }).isVisible());
  await page.getByRole('button', { name: 'RETURN TO SURFACE', exact: true }).click();
  await page.getByRole('button', { name: 'CO-OP' }).click();
  await page.getByRole('button', { name: 'ENTER THE VAULT' }).click();
  assert.equal(await page.evaluate(() => window.__echoVault.game.mode), 'duo');
  assert.match(await page.locator('#runnerLabel').textContent(), /RUNNER/);
  assert.match(await page.locator('#operatorLabel').textContent(), /OPERATOR/);
  await context.close();
  console.log('PASS desktop movement, sonar, pause, extraction, loss, retry, and co-op');

  for (const [name, width, height] of [['mobile', 390, 844], ['small', 360, 640], ['landscape', 844, 390]]) {
    const { page, context } = await open({ width, height }, true);
    await noOverflow(page); await page.screenshot({ path: `test-results/menu-${name}.png` });
    await page.getByRole('button', { name: 'CO-OP' }).tap();
    await page.getByRole('button', { name: 'ENTER THE VAULT' }).tap();
    const stick = await page.locator('#joystick').boundingBox(), sonar = await page.locator('#pulseButton').boundingBox();
    assert.ok(stick.y + stick.height <= height && sonar.y + sonar.height <= height, 'touch controls in viewport');
    const client = await context.newCDPSession(page);
    const moveTouch = { x: stick.x + stick.width * .82, y: stick.y + stick.height / 2, id: 1 };
    const pulseTouch = { x: sonar.x + sonar.width / 2, y: sonar.y + sonar.height / 2, id: 2 };
    const x = await page.evaluate(() => window.__echoVault.game.player.x);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moveTouch] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moveTouch, pulseTouch] });
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => window.__echoVault.game.player.x) > x, 'movement persists with a second finger');
    assert.equal(await page.evaluate(() => window.__echoVault.game.pulseCount), 1, 'second finger sends pulse');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
    const stopped = await page.evaluate(() => window.__echoVault.game.player.x);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.__echoVault.game.player.x), stopped, 'movement releases with finger');
    await page.waitForTimeout(600); await page.screenshot({ path: `test-results/game-${name}.png` });
    await page.getByRole('button', { name: 'Pause game' }).tap();
    await page.getByRole('button', { name: 'RETURN TO SURFACE' }).tap();
    await page.getByRole('button', { name: 'ADD TO HOME SCREEN' }).tap();
    await page.waitForFunction(() => document.getElementById('offlineStatus').textContent.includes('Ready for offline'));
    await page.getByRole('button', { name: 'GOT IT' }).tap();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: 'ENTER THE VAULT' }).tap();
    assert.ok(await page.locator('#gameScreen').isVisible(), 'offline game starts');
    assert.ok(await page.evaluate(() => !!window.__echoVault.game), 'offline modules loaded');
    await context.close(); console.log(`PASS ${name} fit, simultaneous touch, release, install panel, and offline subpath`);
  }
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('All browser checks passed.');
} finally { await browser.close(); }
