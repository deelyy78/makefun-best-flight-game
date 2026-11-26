// The screenshot scenes behind ?shot=start|cover|flight|end. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (bank toward the next ring, pitch toward
// its height, throttle to hold cruise speed, flare onto the runway), so the
// frame is what a short game really looks like and the same seed always
// gives the same frame.
import { STEP } from './config.js';
import { MODE_PLAYING, MODE_LANDED, MODE_DONE, MODE_OVER, MODE_TITLE } from './world.js';

const START_SECONDS = 2;
const COVER_SECONDS = 13;
const FLIGHT_SECONDS = 20;
const END_LIMIT_SECONDS = 400;
const SAMPLE = STEP;

/** Steer the plane toward a point (tx, ty, tz) in the world. */
export function autopilot(state, target) {
  const p = state.plane;
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - p.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let bank = Math.max(-1, Math.min(1, diff * 3.5));
  const wantAlt = target.y;
  const altErr = wantAlt - p.alt;
  // On final approach, drop the climb bias so the plane settles instead
  // of floating past the touchdown point.
  const bias = target.flare ? 0.0 : 0.12;
  let pitch = Math.max(-1, Math.min(1, altErr / 60 + bias));
  if (target.flare) {
    // Get down to the deck promptly, then hold a steady ~11 ft/s sink —
    // inside the 14 ft/s touchdown limit — instead of asymptoting to it.
    pitch = p.alt > 30 ? Math.min(pitch, -0.2) : -0.3;
  }
  let throttle = 0.72;
  if (p.speed < 110) throttle = 0.95;
  if (!target.flare) {
    // Slow down for the rings: at cruise speed the turns come too late
    // and the plane crosses the ring plane still sliding sideways.
    const dist = target.z - p.z;
    if (dist < 500) throttle = 0.38;
    else if (dist < 1000) throttle = 0.5;
  }
  if (target.flare) {
    // Landing approach: bleed speed off early — touchdown needs < 95 kt.
    const dist = target.z - p.z;
    throttle = dist > 1200 ? 0.6 : dist > 500 ? 0.42 : 0.22;
  }
  return { bank, pitch, throttle };
}

function nextTarget(state) {
  const ring = state.rings[state.ringIndex];
  if (ring) return { x: ring.x, y: ring.y, z: ring.z, flare: false };
  // No rings left: aim for mid-runway (z 4300) on a shallow glidepath —
  // the rings end well before the threshold, so the descent is gentle.
  // Stay high while off the centreline: descending onto the hillside
  // beside the runway is how approaches end in the terrain.
  // If the touchdown point slips behind, keep a point ahead instead of
  // chasing a point behind (that used to spin the plane into the hills).
  const p = state.plane;
  const touchdownZ = 4300;
  const dist = touchdownZ - p.z;
  if (dist < 0) return { x: 0, y: Math.max(2, Math.abs(p.x) * 0.4), z: p.z + 250, flare: true };
  const y = Math.max(2, dist * 0.07) + Math.min(80, Math.abs(p.x) * 0.4);
  return { x: 0, y, z: touchdownZ, flare: dist < 1400 };
}

/** Run the world forward for `seconds` under the autopilot. */
export function flyAutopilot(world, seconds) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const s = world.state;
    if (s.mode !== MODE_PLAYING) break;
    world.step(SAMPLE, autopilot(s, nextTarget(s)));
  }
}

/**
 * Set `world` to the named scene (start, cover, flight or end; any other
 * name is start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset(0, false);
  if (name !== 'cover' && name !== 'flight' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { bank: 0, pitch: 0, throttle: 0 });
    world.state.mode = MODE_TITLE;
    return { screen: MODE_TITLE };
  }
  world.startSortie();
  if (name === 'cover') {
    flyAutopilot(world, COVER_SECONDS);
    return { screen: MODE_PLAYING };
  }
  if (name === 'flight') {
    flyAutopilot(world, FLIGHT_SECONDS);
    return { screen: MODE_PLAYING };
  }
  // end: fly the whole sortie and land, then show the completion panel.
  flyAutopilot(world, END_LIMIT_SECONDS);
  const s = world.state;
  if (s.mode === MODE_LANDED || s.mode === MODE_DONE) return { screen: s.mode };
  return { screen: MODE_OVER };
}
