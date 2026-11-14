import { generateVault, isFloor, distance } from './engine.js';
const TAU = Math.PI * 2;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const mono = 'ui-monospace, SFMono-Regular, Consolas, monospace';
function setup(canvas) {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width), h = Math.round(rect.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function diamond(ctx, x, y, radius, color, fill = true) {
  ctx.beginPath(); ctx.moveTo(x, y - radius); ctx.lineTo(x + radius * .7, y); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius * .7, y); ctx.closePath();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  if (fill) ctx.fill(); else ctx.stroke();
}
export class VaultRenderer {
  constructor(canvas) { this.canvas = canvas; this.camera = { x: 0, y: 0 }; this.lastGame = null; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; }
  draw(game, dt = 1 / 60) {
    const { ctx, w, h } = setup(this.canvas);
    if (!w || !h) return;
    const { world, player, time } = game;
    const scale = clamp(Math.min(w / 13, h / 9), 26, 49);
    if (this.lastGame !== game) { this.camera = { ...player }; this.lastGame = game; }
    const smoothing = this.reduced ? 1 : 1 - Math.exp(-dt * 8);
    this.camera.x += (player.x - this.camera.x) * smoothing;
    this.camera.y += (player.y - this.camera.y) * smoothing;
    const offsetX = w / 2 - this.camera.x * scale, offsetY = h / 2 - this.camera.y * scale;
    const screen = p => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });
    const light = (x, y) => {
      const idx = Math.floor(y) * world.width + Math.floor(x);
      return clamp((game.reveal[idx] - time) / game.config.memory * 1.5);
    };
    ctx.fillStyle = '#050e12'; ctx.fillRect(0, 0, w, h);
    // Subtle instrument grid anchors movement when the corridors go dark.
    ctx.strokeStyle = '#28433d19'; ctx.lineWidth = .6;
    for (let x = offsetX % scale; x < w; x += scale) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = offsetY % scale; y < h; y += scale) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
      const px = x * scale + offsetX, py = y * scale + offsetY;
      if (px < -scale || px > w || py < -scale || py > h) continue;
      const visible = light(x, y), idx = y * world.width + x;
      if (!world.floor[idx]) continue;
      const local = clamp(1 - Math.hypot(x + .5 - player.x, y + .5 - player.y) / 2.2);
      const alpha = Math.max(visible, local * .85);
      if (alpha < .01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ((x * 7 + y * 13) % 5 === 0) ? '#153b3a' : '#102d30';
      ctx.fillRect(px + 1, py + 1, scale - 2, scale - 2);
      ctx.strokeStyle = '#264842'; ctx.lineWidth = .6; ctx.strokeRect(px + 3, py + 3, scale - 6, scale - 6);
      ctx.strokeStyle = '#72b7a0'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (!isFloor(world, x, y - 1)) { ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + scale - 1, py + 1); }
      if (!isFloor(world, x, y + 1)) { ctx.moveTo(px + 1, py + scale - 1); ctx.lineTo(px + scale - 1, py + scale - 1); }
      if (!isFloor(world, x - 1, y)) { ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + 1, py + scale - 1); }
      if (!isFloor(world, x + 1, y)) { ctx.moveTo(px + scale - 1, py + 1); ctx.lineTo(px + scale - 1, py + scale - 1); }
      ctx.stroke();
      if ((x * 3 + y * 11) % 17 === 0) {
        ctx.fillStyle = '#54796a'; ctx.fillRect(px + scale / 2 - 3, py + scale / 2, 6, 1); ctx.fillRect(px + scale / 2, py + scale / 2 - 3, 1, 6);
      }
    }
    ctx.globalAlpha = 1;
    // A quiet, persistent breadcrumb route is useful without preserving the entire map.
    ctx.fillStyle = '#5a8e7e';
    for (let i = 0; i < game.trail.length; i += 2) {
      const p = screen(game.trail[i]); ctx.globalAlpha = .15 + (i / game.trail.length) * .17;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const lift = screen(world.exit);
    if (light(world.exit.x, world.exit.y) > .02 || distance(player, world.exit) < 4) {
      const glow = ctx.createRadialGradient(lift.x, lift.y, 0, lift.x, lift.y, scale * 1.7);
      glow.addColorStop(0, '#59d7c026'); glow.addColorStop(1, '#59d7c000'); ctx.fillStyle = glow; ctx.fillRect(lift.x - scale * 2, lift.y - scale * 2, scale * 4, scale * 4);
      ctx.strokeStyle = '#7ce3cb'; ctx.lineWidth = 1.5; ctx.strokeRect(lift.x - scale * .4, lift.y - scale * .4, scale * .8, scale * .8);
      ctx.strokeStyle = '#6cd6c366'; ctx.strokeRect(lift.x - scale * .3, lift.y - scale * .3, scale * .6, scale * .6);
      ctx.beginPath(); ctx.moveTo(lift.x, lift.y - scale * .3); ctx.lineTo(lift.x, lift.y + scale * .3); ctx.stroke();
      ctx.fillStyle = '#98d7c1'; ctx.font = `8px ${mono}`; ctx.textAlign = 'center'; ctx.fillText('LIFT', lift.x, lift.y + scale * .68);
    }
    for (const supply of world.supplies) {
      if (supply.taken || light(supply.x, supply.y) <= .06) continue;
      const p = screen(supply); ctx.globalAlpha = Math.max(.3, light(supply.x, supply.y));
      ctx.strokeStyle = '#9ed0a6'; ctx.lineWidth = 1.4;
      ctx.strokeRect(p.x - 7, p.y - 7, 14, 14);
      if (supply.type === 'air') { ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (const relic of world.relics) {
      if (relic.taken || light(relic.x, relic.y) <= .02) continue;
      const p = screen(relic), bob = this.reduced ? 0 : Math.sin(time * 2 + relic.id) * 2;
      ctx.globalAlpha = clamp(light(relic.x, relic.y) + .1);
      ctx.shadowColor = '#f4bd69'; ctx.shadowBlur = 16; diamond(ctx, p.x, p.y + bob, scale * .22, '#edbe75'); ctx.shadowBlur = 0;
      diamond(ctx, p.x, p.y + bob, scale * .34, '#a57c4666', false);
      ctx.strokeStyle = '#765a33'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y - scale * .22 + bob); ctx.lineTo(p.x, p.y + scale * .22 + bob); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const lure of game.lures) {
      const p = screen(lure); ctx.strokeStyle = '#d1d995'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5 + ((7 - lure.life) % 1.3) * 14, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#d1d995'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    for (const pulse of game.pulses) {
      const p = screen(pulse); ctx.globalAlpha = clamp(1 - pulse.age / 1.35) * .8;
      const grad = ctx.createRadialGradient(p.x, p.y, Math.max(0, pulse.radius * scale - 22), p.x, p.y, Math.max(1, pulse.radius * scale));
      grad.addColorStop(0, '#67d0b000'); grad.addColorStop(1, '#67d0b044');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, pulse.radius * scale, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9ee6c9'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const enemy of game.enemies) {
      const near = distance(player, enemy), visible = enemy.visibleUntil > time || near < 1.7;
      if (!visible) continue;
      const p = screen(enemy); ctx.save(); ctx.translate(p.x, p.y);
      ctx.globalAlpha = near < 1.7 ? 1 : clamp((enemy.visibleUntil - time) / 2);
      const sway = this.reduced ? 0 : Math.sin(time * 9) * 2;
      ctx.shadowColor = '#fb8267'; ctx.shadowBlur = 16; ctx.fillStyle = '#e5907a';
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7 + sway, -4); ctx.lineTo(4, 9); ctx.lineTo(-3, 11); ctx.lineTo(-8 - sway, -3); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#df947d'; ctx.lineWidth = 1.3;
      for (let j = -1; j <= 1; j += 2) { ctx.beginPath(); ctx.moveTo(j * 4, -3); ctx.lineTo(j * 15, 1 + sway); ctx.lineTo(j * 18, 12); ctx.stroke(); }
      ctx.fillStyle = '#2e2220'; ctx.fillRect(-3, -4, 6, 2); ctx.restore();
    }
    const p = screen(player);
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, scale * 1.8);
    halo.addColorStop(0, '#b9e4bc0f'); halo.addColorStop(1, '#b9e4bc00'); ctx.fillStyle = halo; ctx.fillRect(p.x - scale * 2, p.y - scale * 2, scale * 4, scale * 4);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(player.angle);
    ctx.strokeStyle = game.sneaking ? '#9fd9c590' : '#d2e9cf66'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, scale * .37, -.7, .7); ctx.stroke();
    ctx.shadowColor = '#bee3ba'; ctx.shadowBlur = 13; ctx.fillStyle = '#e0edcf';
    ctx.beginPath(); ctx.arc(0, 0, scale * .16, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(scale * .21, -3); ctx.lineTo(scale * .32, 0); ctx.lineTo(scale * .21, 3); ctx.closePath(); ctx.fill(); ctx.restore();
    // Offscreen bearings are deliberate navigation aids, not a route or a full minimap.
    const targets = game.collected === 3 ? [{ ...world.exit, home: true }] : world.relics.filter(r => !r.taken);
    for (const target of targets) {
      const t = screen(target), pad = 32;
      if (t.x > pad && t.x < w - pad && t.y > pad && t.y < h - pad && light(target.x, target.y) > .1) continue;
      const dx = t.x - p.x, dy = t.y - p.y, angle = Math.atan2(dy, dx);
      const boundary = Math.min((w / 2 - pad) / Math.max(.001, Math.abs(Math.cos(angle))), (h / 2 - pad) / Math.max(.001, Math.abs(Math.sin(angle))));
      const bx = w / 2 + Math.cos(angle) * boundary, by = h / 2 + Math.sin(angle) * boundary;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(angle); ctx.strokeStyle = target.home ? '#77d7c2' : '#b99562'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(2, 0); ctx.lineTo(-3, 4); ctx.stroke(); ctx.restore();
      ctx.textAlign = 'center'; ctx.font = `7px ${mono}`; ctx.fillStyle = target.home ? '#87cdb8' : '#b99562';
      ctx.fillText(target.home ? 'LIFT' : '◇', bx - Math.cos(angle) * 14, by - Math.sin(angle) * 14 + 2);
    }
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .65);
    vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#01070b99'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
    if (game.threat > .55) {
      ctx.strokeStyle = `rgba(224,110,82,${(game.threat - .5) * .55})`; ctx.lineWidth = 5; ctx.strokeRect(2, 2, w - 4, h - 4);
    }
  }
}

export class Atmosphere {
  constructor(canvas) { this.canvas = canvas; this.world = generateVault(7043); this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; }
  draw(t) {
    const { ctx, w, h } = setup(this.canvas); if (!w || !h) return;
    if (this.reduced) t = 4;
    const mobile = w <= 760 && h > w;
    ctx.fillStyle = '#091a1c'; ctx.fillRect(0, 0, w, h);
    const cx = w * (mobile ? .91 : .73), cy = h * (mobile ? .32 : .49);
    const unit = mobile ? Math.min(21, w / 20) : Math.min(w / 55, h / 35);
    const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * .65);
    bg.addColorStop(0, '#28473a'); bg.addColorStop(.47, '#102a29'); bg.addColorStop(1, '#071518'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7d9e6c0d'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const project = (x, y, z = 0) => ({ x: cx + (x - 15 - (y - 11)) * unit * .84, y: cy + ((x - 15) + (y - 11)) * unit * .41 - z });
    const polygon = (points, fill, stroke) => {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    const ringCenter = project(15, 11);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.strokeStyle = `rgba(148,191,134,${.045 + (i === 1 ? .04 : 0)})`; ctx.lineWidth = .8;
      ctx.ellipse(ringCenter.x, ringCenter.y, unit * (8 + i * 5), unit * (4 + i * 2.5), 0, 0, TAU); ctx.stroke();
    }
    const sweep = (t * 2.4) % 27;
    for (let sum = 0; sum < 54; sum++) for (let x = 0; x < 31; x++) {
      const y = sum - x; if (y < 0 || y >= 23 || !isFloor(this.world, x, y)) continue;
      const d = Math.hypot(x - 15, y - 11);
      const wave = Math.max(0, 1 - Math.abs(d - sweep) / 3);
      const a = clamp(1 - d / 24) * .65;
      ctx.globalAlpha = a;
      const v = [project(x + .05, y + .05), project(x + .95, y + .05), project(x + .95, y + .95), project(x + .05, y + .95)];
      polygon(v, `rgb(${22 + wave * 20},${54 + wave * 36},${47 + wave * 19})`, `rgba(114,157,107,${.22 + wave * .5})`);
      const depth = unit * .6;
      if (!isFloor(this.world, x + 1, y)) {
        polygon([project(x + 1, y, depth), project(x + 1, y + 1, depth), project(x + 1, y + 1), project(x + 1, y)], '#18362d', '#63835b77');
        polygon([project(x + .88, y, depth), project(x + 1, y, depth), project(x + 1, y + 1, depth), project(x + .88, y + 1, depth)], '#75906366');
      }
      if (!isFloor(this.world, x, y + 1)) {
        polygon([project(x, y + 1, depth), project(x + 1, y + 1, depth), project(x + 1, y + 1), project(x, y + 1)], '#0d2825', '#63835b66');
      }
    }
    ctx.globalAlpha = 1;
    const focal = project(16.5, 11.5), ripple = (t * 28) % (unit * 18);
    ctx.strokeStyle = '#b9c78344'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(focal.x, focal.y, ripple, ripple * .49, 0, 0, TAU); ctx.stroke();
    for (const [x, y] of [[12.5, 8.5], [22.5, 10.5], [18.5, 18.5]]) {
      const p = project(x, y, 10 + Math.sin(t * 1.2 + x) * 2);
      ctx.shadowColor = '#eebf74'; ctx.shadowBlur = 20; diamond(ctx, p.x, p.y, unit * .32, '#edbf79'); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#d8b47844'; ctx.beginPath(); ctx.moveTo(p.x, p.y + 6); ctx.lineTo(p.x, p.y + unit * 1.7); ctx.stroke();
    }
    const p = project(16.5, 11.5, 4);
    ctx.shadowColor = '#c9e1ac'; ctx.shadowBlur = 24; ctx.fillStyle = '#e6ebc2'; ctx.beginPath(); ctx.arc(p.x, p.y, unit * .18, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    // Dust motes give the scene depth without downloaded imagery or textures.
    for (let i = 0; i < 40; i++) {
      const x = (Math.sin(i * 43.3) * .5 + .5) * w, y = ((Math.cos(i * 13.4) * .5 + .5) * h + t * (i % 3 + 1)) % h;
      ctx.fillStyle = `rgba(220,206,141,${.08 + .15 * (Math.sin(t + i) * .5 + .5)})`; ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
    const fade = ctx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, '#071719'); fade.addColorStop(mobile ? .38 : .28, '#071719e8'); fade.addColorStop(mobile ? .84 : .56, '#07171910'); fade.addColorStop(1, '#07171900');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
    if (mobile) {
      const bottom = ctx.createLinearGradient(0, h * .3, 0, h * .75); bottom.addColorStop(0, '#07171900'); bottom.addColorStop(.7, '#071719da'); bottom.addColorStop(1, '#071719'); ctx.fillStyle = bottom; ctx.fillRect(0, h * .3, w, h * .7);
    }
    const vignette = ctx.createRadialGradient(w * .6, h * .5, h * .2, w * .6, h * .5, Math.max(w, h) * .8);
    vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#020d12aa'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  }
}
