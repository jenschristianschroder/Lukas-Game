import { createGame, step, pulse, throwDecoy, takeEvents, score } from './engine.js';
import { VaultRenderer, Atmosphere } from './renderer.js';
import { AudioEngine } from './audio.js';

const $ = id => document.getElementById(id);
const storage = {
  get(key, fallback) { try { const raw = localStorage.getItem(`echo-vault:${key}`); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`echo-vault:${key}`, JSON.stringify(value)); } catch { /* Private browsing can disable storage. The game still works. */ } },
};
const renderer = new VaultRenderer($('vault')), atmosphere = new Atmosphere($('atmosphere')), audio = new AudioEngine();
const keys = new Set();
let game = null, mode = 'solo', paused = false, view = 'menu', sneak = false;
let joystick = { x: 0, y: 0, id: null }, lastFrame = 0, accumulator = 0, lastMenuFrame = 0, hudTime = 0;
let toastUntil = 0, warnedAir = false, warningCooldown = 0, pendingInstall = null, previousFocus = null;
let best = storage.get('best', 0); if (typeof best !== 'number' || !Number.isFinite(best)) best = 0;
const fmtTime = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
function updateBest() { $('bestScore').textContent = best > 0 ? `BEST EXTRACTION / ${best.toLocaleString()}` : 'UNEXPLORED TERRITORY'; }
updateBest();
const savedDifficulty = storage.get('difficulty', 'standard');
if (['scout', 'standard', 'deep'].includes(savedDifficulty)) $('difficulty').value = savedDifficulty;

function toast(message, seconds = 4) {
  $('toast').textContent = message; $('toast').classList.add('visible'); toastUntil = performance.now() + seconds * 1000;
}
function resetInputs() {
  keys.clear(); joystick = { x: 0, y: 0, id: null }; $('joystickKnob').style.transform = '';
}
function setSneak(value) { sneak = value; $('sneakButton').setAttribute('aria-pressed', String(sneak)); }
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }
function newSeed() {
  if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
function startGame(seed = newSeed()) {
  closeDialogs(); resetInputs(); setSneak(false);
  const difficulty = $('difficulty').value; storage.set('difficulty', difficulty);
  game = createGame({ seed, mode, difficulty }); warnedAir = false; warningCooldown = 0;
  paused = false; view = 'game'; accumulator = 0; hudTime = 0;
  $('menu').hidden = true; $('gameScreen').hidden = false; $('gameScreen').classList.toggle('duo', mode === 'duo');
  $('runnerLabel').innerHTML = mode === 'duo' ? '01 / RUNNER <kbd>W A S D</kbd>' : 'MOVEMENT <kbd>W A S D</kbd>';
  $('operatorLabel').innerHTML = mode === 'duo' ? '02 / OPERATOR <kbd>SPACE / E</kbd>' : 'EQUIPMENT <kbd>SPACE / E</kbd>';
  $('modeBadge').textContent = mode === 'duo' ? 'CO-OP' : 'SOLO';
  if (audio.enabled) audio.enable(true);
  toast(mode === 'duo' ? 'Runner: move. Operator: pulse. Recover 3 relics and return here.' : 'Recover 3 relics. Return to this lift. Pulse to see the way.', 6);
  updateHud(); renderer.draw(game); $('pauseButton').focus({ preventScroll: true });
}
function showMenu() {
  closeDialogs(); resetInputs(); game = null; paused = false; view = 'menu';
  $('menu').hidden = false; $('gameScreen').hidden = true; updateBest(); $('startButton').focus({ preventScroll: true });
}
function pauseGame() {
  if (!game || game.status !== 'playing' || paused) return;
  paused = true; resetInputs(); previousFocus = document.activeElement;
  $('pauseDialog').showModal(); $('resumeButton').focus();
}
function resumeGame() {
  if (!game || game.status !== 'playing') return;
  $('pauseDialog').close(); paused = false; accumulator = 0; resetInputs();
  if (audio.enabled) audio.enable(true);
  if (previousFocus instanceof HTMLElement && !previousFocus.closest('dialog')) previousFocus.focus({ preventScroll: true });
}
function endGame() {
  resetInputs(); updateHud(); const won = game.status === 'won', points = score(game);
  if (won && points > best) { best = points; storage.set('best', best); }
  $('resultDialog').classList.toggle('lost', !won);
  $('resultEyebrow').textContent = won ? 'EXPEDITION COMPLETE' : 'SIGNAL LOST';
  $('resultTitle').textContent = won ? 'Back in the light.' : game.reason === 'air' ? 'One breath short.' : 'The dark found you.';
  $('resultDescription').textContent = won ? (mode === 'duo' ? 'Two minds. Three relics. One very close escape.' : 'Three relics recovered. Some secrets are better left below.') : game.reason === 'air' ? 'Your oxygen ran out before you reached the lift.' : 'The creature caught up with your last echo.';
  $('resultRelics').textContent = `${game.collected} / 3`; $('resultTime').textContent = fmtTime(game.time); $('resultScore').textContent = points.toLocaleString();
  $('resultTip').textContent = won ? `You used ${game.pulseCount} pulses and escaped with ${Math.ceil(game.remaining)} seconds of oxygen. Fewer pulses and unused decoys earn a higher score.` : game.reason === 'air' ? 'Look for the green + canisters: each adds 25 seconds. Follow your trail back once you have all three relics.' : 'Pulse, then leave that spot. Sneak past danger, or send a decoy ahead and turn back. The creature searches where it heard you.';
  $('resultDialog').showModal(); $('againButton').focus();
}
function updateHud() {
  if (!game) return;
  $('relicCount').innerHTML = `${game.collected}<span> / 3</span>`;
  $('objectiveLabel').textContent = game.collected === 3 ? 'RETURN TO THE LIFT' : 'RECOVER THE RELICS';
  $('airTime').textContent = fmtTime(Math.ceil(game.remaining));
  $('airFill').style.width = `${game.remaining / game.config.seconds * 100}%`;
  document.querySelector('.air-status').classList.toggle('low', game.remaining < 40);
  $('decoyCount').textContent = game.decoys; $('decoyButton').disabled = game.decoys === 0 || game.decoyCooldown > 0;
  $('pulseButton').disabled = game.pulseCooldown > 0;
  $('pulseButton').setAttribute('aria-label', game.pulseCooldown > 0 ? `Sonar recharging, ${game.pulseCooldown.toFixed(1)} seconds` : 'Send sonar pulse (Space)');
  $('pulseLabel').textContent = game.pulseCooldown > 0 ? `${game.pulseCooldown.toFixed(1)}s` : 'PULSE';
  $('pulseProgress').style.setProperty('--cooldown', `${(1 - game.pulseCooldown / 4.5) * 100}%`);
  $('coordinates').textContent = `VAULT ${String(game.seed % 10000).padStart(4, '0')} / ${Math.floor(game.player.x).toString().padStart(2, '0')}:${Math.floor(game.player.y).toString().padStart(2, '0')}`;
  const danger = game.threat > .6;
  $('signalStatus').classList.toggle('danger', danger);
  $('signalStatus').querySelector('span').textContent = danger ? 'SOMETHING IS CLOSE' : game.pulseCooldown > 3.3 ? 'SIGNAL SENT' : game.sneaking && game.moving ? 'QUIET FOOTSTEPS' : game.moving ? 'FOOTSTEPS' : 'LISTENING';
  $('threatFill').style.width = `${Math.floor(game.threat * 100)}%`;
  $('deckHint').innerHTML = game.collected === 3 ? 'ALL RELICS RECOVERED.<br>FOLLOW THE CYAN BEARING.' : mode === 'duo' ? 'RUNNER + OPERATOR.<br>ONE WAY OUT.' : 'SEE WITH SOUND.<br>MOVE IN SILENCE.';
}
function doPulse() { if (!paused && game) pulse(game); }
function doDecoy() {
  if (!paused && game && !throwDecoy(game) && game.decoys === 0) toast('No decoys left. Look for the green ring supply crates.');
}
function handleEvents() {
  for (const event of takeEvents(game)) {
    audio.play(event);
    if (event.type === 'relic') toast(event.count === 3 ? 'All relics recovered. Follow the cyan bearing back to the lift!' : `Relic ${event.count} of 3 recovered. Keep moving.`, 5);
    if (event.type === 'decoy') toast('Decoy deployed ahead. Go the other way.', 2.5);
    if (event.type === 'supply') toast(event.kind === 'air' ? 'Oxygen recovered · +25 seconds' : 'Decoy recovered · +1', 2.5);
    if (['won', 'caught', 'air'].includes(event.type)) endGame();
  }
}
function frame(timestamp) {
  const dt = Math.min(.1, (timestamp - (lastFrame || timestamp)) / 1000); lastFrame = timestamp;
  if (view === 'menu') {
    if (timestamp - lastMenuFrame > 33) { atmosphere.draw(timestamp / 1000); lastMenuFrame = timestamp; }
  } else if (game) {
    if (!paused && game.status === 'playing') {
      accumulator += dt;
      const input = {
        x: joystick.x + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
        y: joystick.y + Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')),
        sneak: sneak || keys.has('ShiftLeft') || keys.has('ShiftRight'),
      };
      while (accumulator >= 1 / 60) { step(game, 1 / 60, input); accumulator -= 1 / 60; }
      handleEvents();
      if (game.remaining < 40 && !warnedAir && game.status === 'playing') { warnedAir = true; toast('Oxygen low. Find a + canister, or head for the lift.', 4); audio.play({ type: 'warning' }); }
      warningCooldown -= dt;
      if (game.threat > .72 && warningCooldown <= 0) { warningCooldown = 5; audio.play({ type: 'warning' }); }
    }
    renderer.draw(game, dt); hudTime -= dt;
    if (hudTime <= 0) { updateHud(); hudTime = .1; }
    if (timestamp > toastUntil) $('toast').classList.remove('visible');
  }
  requestAnimationFrame(frame);
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  $('modeDescription').textContent = mode === 'solo' ? 'Just you, a sonar, and whatever is down there.' : 'One device. One runner. One sonar operator. Talk quietly.';
}));
$('startButton').addEventListener('click', () => startGame());
$('helpButton').addEventListener('click', () => $('guideDialog').showModal());
$('pauseGuideButton').addEventListener('click', () => $('guideDialog').showModal());
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('pauseButton').addEventListener('click', pauseGame); $('resumeButton').addEventListener('click', resumeGame);
$('quitButton').addEventListener('click', showMenu); $('menuButton').addEventListener('click', showMenu);
$('againButton').addEventListener('click', () => startGame()); $('retryButton').addEventListener('click', () => startGame(game.seed));
$('pauseDialog').addEventListener('cancel', event => { event.preventDefault(); resumeGame(); });
$('resultDialog').addEventListener('cancel', event => event.preventDefault());
$('sneakButton').addEventListener('click', () => { if (!paused) setSneak(!sneak); });
// Pointerdown gives sonar an immediate response while another finger holds the stick.
for (const [id, action] of [['pulseButton', doPulse], ['decoyButton', doDecoy]]) {
  $(id).addEventListener('pointerdown', event => { if ($(id).disabled) return; event.preventDefault(); action(); });
  $(id).addEventListener('click', event => { if (event.detail === 0) action(); });
}
const controlledKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight']);
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (view !== 'game' || !game || game.status !== 'playing' || paused || document.querySelector('dialog[open]')) return;
  if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); pauseGame(); return; }
  if (!controlledKeys.has(event.code)) return;
  event.preventDefault(); keys.add(event.code);
  if (!event.repeat && event.code === 'Space') doPulse();
  if (!event.repeat && event.code === 'KeyE') doDecoy();
});
document.addEventListener('keyup', event => keys.delete(event.code));
function updateStick(event) {
  const rect = $('joystick').getBoundingClientRect();
  const radius = rect.width * .34, dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
  const d = Math.hypot(dx, dy), ratio = d > radius ? radius / d : 1;
  joystick.x = d < radius * .12 ? 0 : dx * ratio / radius; joystick.y = d < radius * .12 ? 0 : dy * ratio / radius;
  $('joystickKnob').style.transform = `translate(${dx * ratio}px, ${dy * ratio}px)`;
}
$('joystick').addEventListener('pointerdown', event => {
  if (paused || !game || game.status !== 'playing' || joystick.id !== null) return;
  event.preventDefault(); joystick.id = event.pointerId; $('joystick').setPointerCapture(event.pointerId); updateStick(event);
});
$('joystick').addEventListener('pointermove', event => { if (event.pointerId === joystick.id) { event.preventDefault(); updateStick(event); } });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(type, event => {
  if (joystick.id !== event.pointerId) return;
  joystick = { x: 0, y: 0, id: null }; $('joystickKnob').style.transform = '';
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInputs(); pauseGame(); if (audio.context) audio.context.suspend().catch(() => {}); } });
window.addEventListener('blur', () => { resetInputs(); pauseGame(); });
window.addEventListener('pagehide', resetInputs);
$('fullscreenButton').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else toast('Use Add to Home Screen for a full-screen expedition.'); } catch { toast('Use Add to Home Screen for a full-screen expedition.'); }
});
document.querySelectorAll('.sound-button').forEach(button => button.addEventListener('click', async () => {
  await audio.enable(!audio.enabled);
  document.querySelectorAll('.sound-button').forEach(b => { b.classList.toggle('sound-on', audio.enabled); b.setAttribute('aria-label', audio.enabled ? 'Turn sound off' : 'Turn sound on'); });
  if (audio.enabled) audio.play({ type: 'relic' });
}));
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pendingInstall = event; $('nativeInstallButton').hidden = false; });
$('installButton').addEventListener('click', () => {
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (installed) $('installCopy').textContent = 'Echo Vault is already running from your home screen. You are ready for another expedition.';
  $('installDialog').showModal();
});
$('nativeInstallButton').addEventListener('click', async () => {
  if (!pendingInstall) return;
  await pendingInstall.prompt(); await pendingInstall.userChoice;
  pendingInstall = null; $('nativeInstallButton').hidden = true;
});
window.addEventListener('appinstalled', () => { pendingInstall = null; $('nativeInstallButton').hidden = true; $('installCopy').textContent = 'Echo Vault has been added to your home screen.'; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    $('offlineStatus').textContent = 'Ready for offline expeditions. Your next run needs no connection.';
  }).catch(() => { $('offlineStatus').textContent = 'You can play online. This browser could not enable offline play.'; });
}
// Local-only inspection for automated browser verification. Never enabled on the hosted game.
if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('test')) {
  window.__echoVault = { get game() { return game; }, get paused() { return paused; }, start: startGame, step: (dt, input) => { step(game, dt, input); handleEvents(); updateHud(); }, resetInputs };
}
requestAnimationFrame(frame);
