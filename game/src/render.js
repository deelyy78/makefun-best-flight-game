// Sky Courier — the renderer: a chase view over the seeded valley.
// Terrain is drawn column by column (a classic voxel march: for each
// screen column the ray walks out until the ground rises above everything
// drawn so far), then trees, clouds, rings, the aircraft, the HUD and the
// lit instrument panel. All drawing is canvas 2D, no images, no network.
import { FIELD, PALETTE, MONO, FONT, RUNWAYS, LANDING } from './config.js';
import { riverX, MODE_TITLE, MODE_PLAYING, MODE_LANDED, MODE_DONE, MODE_OVER } from './world.js';
import { valueNoise2, hash2 } from './random.js';

const FOCAL = 640;
const CX = FIELD.width / 2;
const CY = FIELD.height / 2;
const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createRenderer() {
  const worldCanvas = document.createElement('canvas');
  worldCanvas.width = FIELD.width;
  worldCanvas.height = FIELD.height;
  const wctx = worldCanvas.getContext('2d');

  /** Project a world point into screen space (before the camera-roll turn). */
  function project(cam, heading, horizonY, x, y, z) {
    const dx = x - cam.x;
    const dz = z - cam.z;
    const fwd = dx * Math.sin(heading) + dz * Math.cos(heading);
    if (fwd < 2) return null;
    const rgt = dx * Math.cos(heading) - dz * Math.sin(heading);
    const sx = CX + (rgt / fwd) * FOCAL;
    const sy = horizonY - ((y - cam.y) / fwd) * FOCAL;
    return { x: sx, y: sy, fwd };
  }

  function drawSky(ctx, horizonY, sunX) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.45, PALETTE.skyMid);
    g.addColorStop(0.62, PALETTE.horizon);
    g.addColorStop(1, '#3d5a3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Dawn sun, low over the valley.
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, horizonY - 46, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 217, 138, 0.25)';
    ctx.beginPath();
    ctx.arc(sunX, horizonY - 46, 58, 0, Math.PI * 2);
    ctx.fill();
  }

  /** One ground sample: height plus the colour the ground shows there. */
  function groundSample(world, x, z) {
    const h = world.terrainHeight(x, z);
    return { h, color: world.terrainColor(x, z) };
  }

  function drawTerrain(ctx, world, cam, heading, horizonY) {
    // Below the horizon the ground is drawn column by column. A screen row
    // shows the ground its ray hits: the lower the row, the nearer the
    // ground — so the march runs near to far, and a sample paints only the
    // band above everything drawn so far (a far hill rising over near
    // ground paints over it; a dip behind a rise stays hidden).
    const colStep = 4;
    for (let sx = 0; sx < FIELD.width; sx += colStep) {
      const r = (sx - CX) / FOCAL;
      const dirX = Math.sin(heading) + Math.cos(heading) * r;
      const dirZ = Math.cos(heading) - Math.sin(heading) * r;
      let maxY = FIELD.height;
      let d = 5;
      while (d < 1400) {
        const wx = cam.x + dirX * d;
        const wz = cam.z + dirZ * d;
        const { h, color } = groundSample(world, wx, wz);
        const sy = horizonY - ((h - cam.y) / d) * FOCAL;
        if (sy < maxY) {
          const top = Math.max(sy, horizonY);
          ctx.fillStyle = color;
          ctx.fillRect(sx, top, colStep, maxY - top);
          maxY = top;
          if (maxY <= horizonY) break;
        }
        d *= 1.045;
      }
    }
  }

  function drawTrees(ctx, world, cam, heading, horizonY) {
    const items = [];
    for (const t of world.trees) {
      const p = project(cam, heading, horizonY, t.x, world.terrainHeight(t.x, t.z), t.z);
      if (!p || p.fwd > 900 || p.x < -40 || p.x > FIELD.width + 40) continue;
      items.push({ p, t });
    }
    items.sort((a, b) => b.p.fwd - a.p.fwd);
    for (const { p, t } of items) {
      const hgt = (20 * t.s * FOCAL) / p.fwd;
      if (hgt < 2) continue;
      const baseY = p.y;
      ctx.fillStyle = PALETTE.treeTrunk;
      ctx.fillRect(p.x - hgt * 0.04, baseY - hgt * 0.25, hgt * 0.08, hgt * 0.25);
      ctx.fillStyle = t.hue > 0.5 ? PALETTE.tree : '#356b31';
      ctx.beginPath();
      ctx.moveTo(p.x, baseY - hgt);
      ctx.lineTo(p.x - hgt * 0.32, baseY - hgt * 0.2);
      ctx.lineTo(p.x + hgt * 0.32, baseY - hgt * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds(ctx, world, cam, heading, horizonY) {
    for (const c of world.clouds) {
      const p = project(cam, heading, horizonY, c.x, c.y, c.z);
      if (!p || p.fwd > 3000 || p.x < -160 || p.x > FIELD.width + 160) continue;
      const s = (46 * c.s * FOCAL) / p.fwd;
      if (s < 4) continue;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.5, p.y + s * 0.08, s * 0.6, s * 0.28, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.5, p.y + s * 0.06, s * 0.65, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRings(ctx, world, cam, heading, horizonY, time) {
    const s = world.state;
    const sorted = s.rings.map((r, i) => ({ r, i })).sort((a, b) => b.r.z - a.r.z);
    for (const { r, i } of sorted) {
      const p = project(cam, heading, horizonY, r.x, r.y, r.z);
      if (!p || p.fwd > 2600) continue;
      const rad = (r.r * FOCAL) / p.fwd;
      if (rad < 2 || p.x < -rad || p.x > FIELD.width + rad) continue;
      const isNext = i === s.ringIndex;
      const color = r.passed ? PALETTE.ringDone : isNext ? PALETTE.ringNext : PALETTE.ringLater;
      const pulse = isNext ? 1 + 0.12 * Math.sin(time * 5) : 1;
      // Guide line down to the ground, for depth.
      const gp = project(cam, heading, horizonY, r.x, world.terrainHeight(r.x, r.z), r.z);
      if (gp) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(gp.x, gp.y);
        ctx.stroke();
      }
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, rad * 0.1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * pulse * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      if (isNext) {
        const dist = Math.max(0, Math.round((r.z - world.state.plane.z) * 3.28));
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px ' + MONO;
        ctx.textAlign = 'center';
        ctx.fillText('RING ' + (i + 1) + ' — ' + dist + ' FT', p.x, p.y - rad - 12);
      }
    }
  }

  function drawPlaneShadow(ctx, world, cam, heading, horizonY) {
    const s = world.state;
    const p = s.plane;
    if (p.onGround || p.alt > 260) return;
    const g = world.terrainHeight(p.x, p.z);
    const sp = project(cam, heading, horizonY, p.x, g + 1, p.z);
    if (!sp) return;
    const w = (60 * FOCAL) / Math.max(30, sp.fwd);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y, w, w * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The courier's prop plane, chase view from behind and above. */
  function drawPlane(ctx, plane, time) {
    const px = CX;
    const py = 512 - plane.pitch * 130;
    const bank = plane.roll * 0.3;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(bank);
    const bob = Math.sin(time * 2.2) * 1.5;
    ctx.translate(0, bob);
    // Propeller blur at the nose (far end, top of the drawing).
    ctx.fillStyle = 'rgba(200, 210, 220, 0.30)';
    ctx.beginPath();
    ctx.ellipse(0, -96, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Fuselage: wide at the tail (near), tapering to the nose (far).
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(0, -104);
    ctx.quadraticCurveTo(20, -70, 22, -18);
    ctx.quadraticCurveTo(24, 30, 16, 62);
    ctx.lineTo(-16, 62);
    ctx.quadraticCurveTo(-24, 30, -22, -18);
    ctx.quadraticCurveTo(-20, -70, 0, -104);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9aa5b5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Red cheatline and blue trim.
    ctx.fillStyle = PALETTE.planeAccent;
    ctx.fillRect(-21, -26, 42, 7);
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.fillRect(-20, 8, 40, 4);
    // Canopy.
    ctx.fillStyle = '#bfe3f2';
    ctx.beginPath();
    ctx.ellipse(0, -58, 11, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a6b7d';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Main wings.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-24, -30);
    ctx.lineTo(-148, 6);
    ctx.lineTo(-148, 26);
    ctx.lineTo(-22, 26);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, -30);
    ctx.lineTo(148, 6);
    ctx.lineTo(148, 26);
    ctx.lineTo(22, 26);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9aa5b5';
    ctx.stroke();
    // Wing tips: red left, green right — the nav lights, lit.
    ctx.save();
    ctx.shadowColor = '#ff3b30';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-148, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = '#39d353';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#39d353';
    ctx.beginPath();
    ctx.arc(148, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Tailplane and fin.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-14, 44);
    ctx.lineTo(-62, 66);
    ctx.lineTo(-62, 76);
    ctx.lineTo(-12, 66);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 44);
    ctx.lineTo(62, 66);
    ctx.lineTo(62, 76);
    ctx.lineTo(12, 66);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeAccent;
    ctx.beginPath();
    ctx.moveTo(0, 34);
    ctx.lineTo(-13, 72);
    ctx.lineTo(13, 72);
    ctx.closePath();
    ctx.fill();
    // Tail light.
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 74, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawHud(ctx, world, time) {
    const s = world.state;
    const p = s.plane;
    const altFt = Math.max(0, Math.round(p.alt));
    const spdKt = Math.round(p.speed);
    const hdg = Math.round(((p.heading / DEG) % 360 + 360) % 360);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Top-left flight data block.
    ctx.fillStyle = 'rgba(10, 14, 20, 0.55)';
    ctx.fillRect(14, 12, 268, 92);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(14.5, 12.5, 268, 92);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '11px ' + MONO;
    ctx.fillText('ALT  FT', 26, 32);
    ctx.fillText('SPD  KT', 26, 58);
    ctx.fillText('HDG  DEG', 26, 84);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px ' + MONO;
    ctx.fillText(String(altFt).padStart(5, ' '), 108, 34);
    ctx.fillText(String(spdKt).padStart(3, ' '), 108, 60);
    ctx.fillText(String(hdg).padStart(3, '0') + '°', 108, 86);

    // Compass tape across the top centre.
    ctx.save();
    ctx.beginPath();
    ctx.rect(CX - 190, 12, 380, 34);
    ctx.clip();
    ctx.fillStyle = 'rgba(10, 14, 20, 0.55)';
    ctx.fillRect(CX - 190, 12, 380, 34);
    ctx.font = 'bold 13px ' + MONO;
    ctx.textAlign = 'center';
    for (let d = -180; d <= 180; d += 15) {
      const a = ((hdg + d) % 360 + 360) % 360;
      const x = CX + d * 2.1;
      const label = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : a % 45 === 0 ? String(a) : null;
      ctx.strokeStyle = a % 45 === 0 ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x, a % 45 === 0 ? 28 : 22);
      ctx.stroke();
      if (label) {
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x, 42);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffc93c';
    ctx.beginPath();
    ctx.moveTo(CX, 48);
    ctx.lineTo(CX - 6, 40);
    ctx.lineTo(CX + 6, 40);
    ctx.closePath();
    ctx.fill();

    // Top-right mission block.
    ctx.fillStyle = 'rgba(10, 14, 20, 0.55)';
    ctx.fillRect(FIELD.width - 282, 12, 268, 92);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(FIELD.width - 281.5, 12.5, 268, 92);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '11px ' + MONO;
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', FIELD.width - 270, 32);
    ctx.fillText('RINGS', FIELD.width - 270, 58);
    ctx.fillText('TIME', FIELD.width - 270, 84);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px ' + MONO;
    ctx.fillText(String(s.score), FIELD.width - 200, 34);
    ctx.fillText(s.ringIndex + '/' + s.rings.length, FIELD.width - 200, 60);
    const tLeft = Math.max(0, Math.ceil(300 - s.time));
    ctx.fillText(Math.floor(tLeft / 60) + ':' + String(tLeft % 60).padStart(2, '0'), FIELD.width - 200, 86);

    // Guidance: where the next ring (or the runway) is.
    if (s.mode === MODE_PLAYING) {
      const ring = s.rings[s.ringIndex];
      let tx = 0;
      let tz = 0;
      let label = '';
      if (ring) {
        tx = ring.x;
        tz = ring.z;
        label = 'NEXT RING';
      } else {
        tx = 0;
        tz = 4300;
        label = 'LAND — RWY 27';
      }
      const rel = Math.atan2(tx - p.x, tz - p.z) - p.heading;
      const arrow = rel > 0.25 ? '▶ TURN RIGHT' : rel < -0.25 ? '◀ TURN LEFT' : '▲ ON COURSE';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffc93c';
      ctx.font = 'bold 16px ' + MONO;
      ctx.fillText(label + '  ·  ' + arrow, CX, 66);
    }

    // Message banner.
    if (s.messageT > 0 && s.message) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillStyle = 'rgba(10, 14, 20, 0.6)';
      const w = ctx.measureText(s.message).width + 36;
      ctx.fillRect(CX - w / 2, 84, w, 34);
      ctx.fillStyle = '#fff';
      ctx.fillText(s.message, CX, 108);
    }

    // Centre crosshair.
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, 300, 10, 0, Math.PI * 2);
    ctx.moveTo(CX - 18, 300);
    ctx.lineTo(CX - 6, 300);
    ctx.moveTo(CX + 6, 300);
    ctx.lineTo(CX + 18, 300);
    ctx.moveTo(CX, 282);
    ctx.lineTo(CX, 294);
    ctx.moveTo(CX, 306);
    ctx.lineTo(CX, 318);
    ctx.stroke();
  }

  function drawGauge(ctx, x, y, r, label, value, min, max, unit) {
    ctx.fillStyle = PALETTE.gaugeFace;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Lit tick ring.
    ctx.strokeStyle = 'rgba(126, 231, 135, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 4, 0, Math.PI * 2);
    ctx.stroke();
    const frac = clamp((value - min) / (max - min), 0, 1);
    const ang = -Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = PALETTE.gaugeLit;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * (r - 8), y + Math.sin(ang) * (r - 8));
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + r + 13);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px ' + MONO;
    ctx.fillText(Math.round(value) + unit, x, y + r - 6);
  }

  function drawPanel(ctx, world, time) {
    const s = world.state;
    const p = s.plane;
    const py = FIELD.height - 104;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, py, FIELD.width, 104);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, py, FIELD.width, 2);

    // Artificial horizon.
    const hx = 78;
    const hy = py + 52;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 36, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-p.roll * 0.7);
    ctx.translate(0, p.pitch * 90);
    ctx.fillStyle = '#3f7ec2';
    ctx.fillRect(-40, -80, 80, 80);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-40, 0, 80, 80);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-40, -1, 80, 2);
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffc93c';
    ctx.beginPath();
    ctx.moveTo(hx - 14, hy);
    ctx.lineTo(hx - 4, hy);
    ctx.lineTo(hx, hy - 4);
    ctx.lineTo(hx + 4, hy);
    ctx.lineTo(hx + 14, hy);
    ctx.lineTo(hx + 4, hy + 3);
    ctx.lineTo(hx - 4, hy + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', hx, hy + 51);

    drawGauge(ctx, 188, hy, 34, 'AIRSPEED', p.speed, 0, 220, '');
    drawGauge(ctx, 288, hy, 34, 'ALTITUDE', Math.max(0, p.alt), 0, 400, '');
    drawGauge(ctx, 388, hy, 34, 'VERT SPEED', p.verticalSpeed, -30, 30, '');

    // Fuel + throttle bars, lit.
    const bx = 470;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', bx, py + 22);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(bx, py + 28, 220, 14);
    ctx.fillStyle = p.fuel < 20 ? PALETTE.gaugeRed : p.fuel < 45 ? PALETTE.gaugeAmber : PALETTE.gaugeLit;
    ctx.fillRect(bx, py + 28, 220 * (p.fuel / 100), 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px ' + MONO;
    ctx.fillText(Math.round(p.fuel) + '%', bx + 228, py + 40);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px ' + MONO;
    ctx.fillText('THROTTLE', bx, py + 62);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(bx, py + 68, 220, 14);
    ctx.fillStyle = '#7db8ff';
    ctx.fillRect(bx, py + 68, 220 * p.throttle, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px ' + MONO;
    ctx.fillText(Math.round(p.throttle * 100) + '%', bx + 228, py + 80);

    // Warning lamps.
    const lx = 760;
    const lamps = [
      { label: 'STALL', on: p.speed < 58 && !p.onGround, color: PALETTE.gaugeRed },
      { label: 'LOW FUEL', on: p.fuel < 20, color: PALETTE.gaugeAmber },
      { label: 'TERRAIN', on: !p.onGround && p.alt - world.terrainHeight(p.x, p.z) < 35, color: PALETTE.gaugeRed },
      { label: 'AIRBRAKE', on: false, color: '#7db8ff' },
    ];
    lamps.forEach((lamp, i) => {
      const x = lx + i * 92;
      const blink = lamp.on && lamp.label !== 'AIRBRAKE' ? (Math.sin(time * 10) > 0 ? 1 : 0.35) : 1;
      ctx.globalAlpha = lamp.on ? blink : 0.25;
      ctx.fillStyle = lamp.color;
      ctx.beginPath();
      ctx.arc(x + 8, py + 36, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = lamp.on ? '#fff' : PALETTE.muted;
      ctx.font = '10px ' + MONO;
      ctx.textAlign = 'center';
      ctx.fillText(lamp.label, x + 8, py + 58);
    });

    // Sortie readout, right side.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '11px ' + MONO;
    ctx.fillText('SORTIE ' + (s.sortie + 1) + ' / 3', FIELD.width - 24, py + 26);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px ' + MONO;
    ctx.fillText('COMBO ×' + s.combo, FIELD.width - 24, py + 50);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '11px ' + MONO;
    ctx.fillText('ARROWS/WASD FLY · SHIFT THROTTLE · MOUSE STEER', FIELD.width - 24, py + 78);
    ctx.fillText('SPACE AIRBRAKE · P PAUSE · M MUTE · R RESTART', FIELD.width - 24, py + 94);
  }

  function drawTitle(ctx, world, best) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.45)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 72px ' + FONT;
    ctx.fillText('SKY COURIER', CX, 190);
    ctx.fillStyle = '#ffc93c';
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText('A DAWN RUN DOWN THE RIVER VALLEY', CX, 232);
    ctx.fillStyle = '#eef1f5';
    ctx.font = '18px ' + FONT;
    ctx.fillText('Fly the rings, mind your fuel, and put her down gently on RWY 27.', CX, 290);
    ctx.fillText('Three sorties. Rings pay 100, chained rings pay more. A clean landing pays 500+.', CX, 318);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText('PRESS ENTER TO FLY', CX, 392);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '16px ' + MONO;
    ctx.fillText('ARROWS / WASD — PITCH & BANK      SHIFT — THROTTLE UP      MOUSE — STEER', CX, 440);
    ctx.fillText('CTRL — THROTTLE DOWN      SPACE — AIRBRAKE      P — PAUSE      M — MUTE', CX, 466);
    if (best > 0) {
      ctx.fillStyle = '#7ee787';
      ctx.font = 'bold 18px ' + MONO;
      ctx.fillText('BEST SCORE  ' + best, CX, 516);
    }
  }

  function drawOverlayPanel(ctx, title, lines, accent) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 52px ' + FONT;
    ctx.fillText(title, CX, 250);
    ctx.fillStyle = '#fff';
    ctx.font = '20px ' + FONT;
    lines.forEach((line, i) => ctx.fillText(line, CX, 310 + i * 34));
  }

  function draw(ctx, world, best, paused, time) {
    const s = world.state;
    const p = s.plane;
    const cam = {
      x: p.x - Math.sin(p.heading) * 10,
      z: p.z - Math.cos(p.heading) * 10,
      y: p.alt + 3.5,
    };
    const horizonY = FIELD.horizonY + p.pitch * 520;

    // World layer, drawn to an offscreen canvas so the camera roll can turn it.
    drawSky(wctx, horizonY, 980);
    drawTerrain(wctx, world, cam, p.heading, horizonY);
    drawClouds(wctx, world, cam, p.heading, horizonY);
    drawTrees(wctx, world, cam, p.heading, horizonY);
    drawPlaneShadow(wctx, world, cam, p.heading, horizonY);
    drawRings(wctx, world, cam, p.heading, horizonY, time);

    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(-p.roll * 0.7);
    ctx.translate(-CX, -CY);
    ctx.drawImage(worldCanvas, 0, 0);
    ctx.restore();

    if (s.mode === MODE_PLAYING || s.mode === MODE_LANDED || s.mode === MODE_DONE || s.mode === MODE_OVER) {
      drawPlane(ctx, p, time);
    }
    drawHud(ctx, world, time);
    drawPanel(ctx, world, time);

    if (s.mode === MODE_TITLE) drawTitle(ctx, world, best);
    if (paused && s.mode === MODE_PLAYING) {
      drawOverlayPanel(ctx, 'PAUSED', ['P or Esc to resume', 'R to restart the sortie'], '#fff');
    }
    if (s.mode === MODE_LANDED) {
      const st = s.landedStats || { fuelBonus: 0, timeBonus: 0, gained: 0, time: 0 };
      drawOverlayPanel(ctx, 'SORTIE COMPLETE', [
        'Clean touchdown on RWY 27  ·  +' + st.gained + ' points',
        'Fuel bonus +' + st.fuelBonus + '   ·   Time bonus +' + st.timeBonus,
        'Score  ' + s.score,
        'Press ENTER for sortie ' + (s.sortie + 2),
      ], PALETTE.gaugeLit);
    }
    if (s.mode === MODE_DONE) {
      const stars = '★'.repeat(s.stars) + '☆'.repeat(3 - s.stars);
      drawOverlayPanel(ctx, 'ALL SORTIES FLOWN', [
        stars,
        'Final score  ' + s.score,
        'The valley is yours, courier. Press R to fly again.',
      ], '#ffc93c');
    }
    if (s.mode === MODE_OVER) {
      drawOverlayPanel(ctx, 'DOWN', [
        s.crashReason,
        'Score  ' + s.score + '   ·   Rings  ' + s.ringIndex + '/' + s.rings.length,
        'Press R to try the sortie again',
      ], PALETTE.gaugeRed);
    }
  }

  return { draw, project };
}
