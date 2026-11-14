# Echo Vault

**The dark is listening.** A complete sonar stealth game for one player or two people sharing one device. Built for the Lukas Game repository and GitHub Pages.

Play: https://jenschristianschroder.github.io/Lukas-Game/

Recover three amber relics from a procedurally generated vault, then return to the cyan lift before your oxygen runs out. Sonar temporarily reveals the corridors and the blind creature, but it also tells the creature where you were. Pulse, leave that spot, and remember your route.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD / arrow keys | Left joystick |
| Sneak | Hold Shift | Toggle Quiet, or gently move the joystick |
| Sonar | Space | Pulse |
| Decoy | E | Decoy |
| Pause | Escape / P | Pause button |

In co-op, one player is the runner and the other is the sonar operator. Independent pointer capture supports moving and using equipment simultaneously. There is no online multiplayer or server. Both players share the same expedition, screen, oxygen, and result.

- **Scout:** 240 seconds, slower creature, longer sonar memory.
- **Standard:** 200 seconds, one creature.
- **Deep vault:** 175 seconds, two faster creatures, shorter sonar memory.
- Sonar recharges in 4.5 seconds. The creature searches the pulse's origin, not the player's current location.
- Normal footsteps attract a creature within a short path distance; sneaking is silent.
- Three starting decoys lure creatures to a reachable tile 5–8 steps ahead of your facing direction, including around corners.
- Green + canisters restore up to 25 seconds of oxygen. Green ring crates replenish decoys.
- A faint breadcrumb trail remembers where you walked. Amber bearings point toward relics; after all three are collected, the cyan bearing points to the lift. Bearings do not show the route.
- The lift is a sanctuary. A successful extraction scores 1,500 points, plus remaining oxygen, unused decoys, and efficient sonar use. Partial runs earn 300 points per relic.
- Retry recreates the same vault; a new expedition generates another. Best extraction score and preferred difficulty are saved locally when browser storage is available.
- Sound is synthesized with Web Audio and is optional. Every important audio cue has a visual equivalent. Hidden tabs and focus loss pause the simulation.

## Run and test

No dependencies, bundler, CDN, database, account, or game server are needed.

```sh
python3 -m http.server 4173
# Open http://localhost:4173
npm run check
npm test
```

The engine tests cover generated-map connectivity and reachable objectives across many seeds, reproducible generation, collision, sound pursuit, sonar cooldown and reveal, decoys, pickups, extraction, and failure conditions.

`tests/browser.mjs` is an additional Playwright browser verification script (uses the environment's Playwright installation). Start the local server first, then run `node tests/browser.mjs`. It covers desktop/mobile layouts, pointer controls, a complete extraction, loss and retry, paused oxygen, and offline loading at the GitHub Pages subpath. Set `BASE_URL` to test a different local path. A test-only inspection hook is enabled only on localhost or 127.0.0.1 with `?test`.

## GitHub Pages

The included workflow checks the game and deploys static assets on every push to `main`. In repository **Settings → Pages**, the publishing source must be **GitHub Actions**. All asset paths, the manifest, and the service-worker scope are relative, so `/Lukas-Game/` hosting works without changes.

For a new release, increment the cache version in `sw.js` when changing cached files. Old caches belonging to this game are removed; caches belonging to other games on the same origin are preserved.

## Home-screen and offline play

The install panel explains Safari's Share → Add to Home Screen flow and the Android browser install option. A native install button appears when the browser provides an install prompt. Manifest icons include a maskable icon. After a successful initial online load and service-worker activation, the game can reopen offline. Browser support and install wording vary.

## Structure

- `src/engine.js`: seeded generation, navigation, physics, stealth AI, resources, victory/loss.
- `src/renderer.js`: procedural menu scene and Canvas 2D game rendering.
- `src/app.js`: interface, multitouch and keyboard controls, pause, results, persistence, installation.
- `src/audio.js`: opt-in synthesized audio.
- `style.css`: responsive game interface; portrait, landscape, safe areas, reduced motion.
- `sw.js` and `manifest.webmanifest`: offline cache and home-screen metadata.

All visuals and sounds are created locally with code. There are no external runtime requests, trackers, or uploaded player data.
