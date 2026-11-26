// Sky Courier — the world: a seeded river valley, two runways, checkpoint
// rings, and the arcade flight model. All randomness comes from the seed;
// the fixed-step simulation never reads the clock or Math.random.
import { FIELD, STEP, PLANE, RINGS, LANDING, RUNWAYS, SORTIE, PALETTE } from './config.js';
import { createRandom, hash2, valueNoise2 } from './random.js';

export const MODE_TITLE = 'title';
export const MODE_PLAYING = 'playing';
export const MODE_LANDED = 'landed';
export const MODE_DONE = 'done';
export const MODE_OVER = 'over';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASH = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_SORTIE_DONE = 16;

const KNOTS_TO_FT_S = 1.68781;
const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The river's centreline: a slow S-curve down the valley. */
export function riverX(z) {
  return 140 * Math.sin(z * 0.0009 + 1.7) + 70 * Math.sin(z * 0.0023 + 0.4);
}

function runwayAt(x, z) {
  for (const rw of RUNWAYS) {
    if (z >= rw.z0 && z <= rw.z1 && Math.abs(x) < 18) return rw;
  }
  return null;
}

export function createWorld(seed) {
  const rng = createRandom(seed);
  const phase = rng() * Math.PI * 2;
  const ringPhase = rng() * Math.PI * 2;

  // Fixed scenery, drawn from the seed once: trees and clouds never move.
  const trees = [];
  for (let i = 0; i < 260; i += 1) {
    const x = (rng() * 2 - 1) * 520;
    const z = -300 + rng() * 4600;
    if (runwayAt(x, z)) continue;
    if (Math.abs(x - riverX(z)) < 22) continue;
    trees.push({ x, z, s: 0.7 + rng() * 0.9, hue: rng() });
  }
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: (rng() * 2 - 1) * 900,
      z: rng() * 4200,
      y: 230 + rng() * 130,
      s: 0.8 + rng() * 1.6,
    });
  }

  const world = {
    seed,
    trees,
    clouds,
    state: null,
  };

  /** Terrain height in feet at world (x, z). */
  function terrainHeight(x, z) {
    const valley = smoothstep(260, 900, Math.abs(x)) * 78;
    let h = valley
      + 26 * valueNoise2(x * 0.0035, z * 0.0035, seed)
      + 10 * valueNoise2(x * 0.013 + 40, z * 0.013, seed + 7);
    const dRiver = Math.abs(x - riverX(z));
    if (dRiver < 26) h -= (1 - dRiver / 26) * 16;
    const rw = runwayAt(x, z);
    if (rw) {
      // Flat for |x| < 12, blending to the raw hills by |x| = 18; the
      // ends blend over 12 ft so the deck stays flat almost to the edge.
      const edge = smoothstep(12, 18, Math.abs(x));
      const zEdge = smoothstep(0, 12, Math.min(z - rw.z0, rw.z1 - z));
      h = lerp(0, h, Math.max(edge, 1 - zEdge));
    }
    return Math.max(0, h);
  }

  /** Ground colour at world (x, z): patchwork fields, river, sand, rock, snow. */
  function terrainColor(x, z) {
    const rw = runwayAt(x, z);
    if (rw && Math.abs(x) < 9) {
      const dash = Math.floor(z / 40) % 2 === 0;
      if (Math.abs(x) < 0.9 && dash) return PALETTE.runwayMark;
      if (Math.abs(x) > 7.6) return PALETTE.runwayMark;
      return PALETTE.runway;
    }
    const dRiver = Math.abs(x - riverX(z));
    if (dRiver < 13) return valueNoise2(x * 0.05, z * 0.05, seed + 3) > 0.5 ? PALETTE.river : PALETTE.riverDeep;
    if (dRiver < 17) return PALETTE.sand;
    const h = terrainHeight(x, z);
    if (h > 82) return PALETTE.snow;
    if (h > 58) return PALETTE.rock;
    const cx = Math.floor(x / 110);
    const cz = Math.floor(z / 110);
    const pick = hash2(cx, cz, seed + 11);
    const edge = Math.min(x - cx * 110, (cx + 1) * 110 - x, z - cz * 110, (cz + 1) * 110 - z);
    const fields = [PALETTE.fieldA, PALETTE.fieldB, PALETTE.fieldC, PALETTE.fieldD, PALETTE.fieldE];
    const base = fields[Math.floor(pick * fields.length) % fields.length];
    if (edge < 3) return '#3d5c2c';
    return base;
  }

  function buildRings(sortie) {
    const count = 6 + sortie * 2;
    const rings = [];
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1);
      rings.push({
        x: 130 * Math.sin(i * 1.35 + ringPhase + sortie),
        z: 520 + i * ((2900 - 520) / Math.max(1, count - 1)),
        y: 95 + 38 * Math.sin(i * 0.9 + phase) + sortie * 6,
        r: RINGS.radius,
        passed: false,
        missed: false,
      });
    }
    return rings;
  }

  function reset(sortie, keepScore) {
    const s = {
      mode: MODE_TITLE,
      sortie,
      score: keepScore ? world.state.score : 0,
      best: 0,
      rings: buildRings(sortie),
      ringIndex: 0,
      combo: 0,
      time: 0,
      message: '',
      messageT: 0,
      plane: {
        x: 0, z: -260, alt: 0,
        heading: 0, pitch: 0, roll: 0,
        speed: 0, throttle: 0, fuel: 100,
        verticalSpeed: 0, onGround: true, landed: false,
      },
      events: EVENT_NONE,
      crashReason: '',
      landedStats: null,
      sortiesDone: keepScore ? world.state.sortiesDone : 0,
      stars: 0,
    };
    world.state = s;
    return s;
  }

  function startSortie() {
    const s = world.state;
    s.mode = MODE_PLAYING;
    s.message = 'SORTIE ' + (s.sortie + 1) + ' — FLY THE RINGS, THEN LAND ON RWY 27';
    s.messageT = 5;
  }

  /** One fixed simulation step. `ctl` is {bank, pitch, throttle} in [-1, 1] (throttle [0, 1]). */
  function step(dt, ctl) {
    const s = world.state;
    if (s.mode !== MODE_PLAYING) return EVENT_NONE;
    const p = s.plane;
    let events = EVENT_NONE;
    s.time += dt;
    if (s.messageT > 0) s.messageT -= dt;

    // Throttle: the lever moves toward the commanded setting; fuel burns with it.
    const wantThrottle = clamp(ctl.throttle, 0, 1);
    p.throttle += clamp(wantThrottle - p.throttle, -dt * 1.4, dt * 1.4);
    if (p.fuel > 0) {
      p.fuel = Math.max(0, p.fuel - PLANE.fuelBurn * (0.25 + p.throttle) * dt);
      if (p.fuel === 0) {
        p.throttle = 0;
        events |= EVENT_FUEL_EMPTY;
        s.message = 'FUEL EMPTY — GLIDE HER IN';
        s.messageT = 4;
      }
    }

    // Speed chases the throttle setting; pitch trades speed for climb.
    const targetSpeed = 42 + p.throttle * (PLANE.maxSpeed - 42);
    p.speed += clamp(targetSpeed - p.speed, -PLANE.drag * dt, PLANE.accel * dt);
    const stalled = p.speed < PLANE.stallSpeed && !p.onGround;

    // Bank and pitch ease toward the commanded deflection.
    const wantRoll = clamp(ctl.bank, -1, 1) * PLANE.maxBank;
    p.roll += clamp(wantRoll - p.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
    const wantPitch = clamp(ctl.pitch, -1, 1) * (ctl.pitch >= 0 ? PLANE.maxPitchUp : -PLANE.maxPitchDown);
    p.pitch += clamp(wantPitch - p.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);

    // Turning: heading follows bank, faster when faster. Positive roll is
    // a right bank (right wing down), and a right bank turns the nose
    // right, toward +x — so heading grows with sin(roll).
    p.heading += Math.sin(p.roll) * (p.speed / PLANE.cruiseSpeed) * 0.7 * dt;
    if (p.heading > Math.PI) p.heading -= Math.PI * 2;
    if (p.heading < -Math.PI) p.heading += Math.PI * 2;

    // Climb: pitch sets the climb rate, throttled by speed; a stalled wing sinks.
    let climb = Math.sin(p.pitch) * p.speed * KNOTS_TO_FT_S * 0.9;
    if (stalled) climb -= 26;
    if (p.onGround) climb = Math.max(0, climb);
    p.verticalSpeed = climb;

    const prevZ = p.z;
    const ftS = p.speed * KNOTS_TO_FT_S;
    p.x += Math.sin(p.heading) * ftS * dt;
    p.z += Math.cos(p.heading) * ftS * dt;
    p.alt += climb * dt;

    const ground = terrainHeight(p.x, p.z);
    const rw = runwayAt(p.x, p.z);

    if (p.onGround) {
      p.alt = ground;
      if (p.speed > PLANE.stallSpeed + 6 && p.pitch > 0.06) {
        p.onGround = false;
        s.message = 'AIRBORNE — GEAR UP, FLY THE RINGS';
        s.messageT = 3;
      }
    } else if (p.alt <= ground + 0.4) {
      p.alt = ground;
      // Only a descent can touch down: right after liftoff the climb is
      // positive while the wheels are still at deck height, and that must
      // not count as a landing (the liftoff bounce).
      if (climb >= 0) {
        // Skimming the deck while climbing away — stay airborne, no event.
      } else {
        const aligned = Math.abs(angleDiff(p.heading, 0)) < LANDING.maxHeadingError * DEG;
        const gentle = -climb < LANDING.maxSink;
        const slow = p.speed < LANDING.maxSpeed;
      if (rw && aligned && gentle && slow) {
        p.onGround = true;
        p.landed = true;
        const fuelBonus = Math.round(p.fuel * 2);
        const timeBonus = Math.max(0, Math.round((SORTIE.parSeconds - s.time) * 2));
        const gained = LANDING.basePoints + fuelBonus + timeBonus;
        s.score += gained;
        s.landedStats = { fuelBonus, timeBonus, gained, time: s.time };
        s.sortiesDone += 1;
        events |= EVENT_LANDED;
        if (s.sortie >= 2) {
          s.mode = MODE_DONE;
          s.stars = s.score >= 3200 ? 3 : s.score >= 2200 ? 2 : 1;
          events |= EVENT_SORTIE_DONE;
        } else {
          s.mode = MODE_LANDED;
        }
        s.message = 'TOUCHDOWN — SORTIE COMPLETE +' + gained;
        s.messageT = 6;
      } else {
        s.mode = MODE_OVER;
        s.crashReason = !rw
          ? 'TERRAIN STRIKE — YOU FLEW INTO THE HILLSIDE'
          : !aligned
            ? 'CRASH — LANDED ACROSS THE RUNWAY'
            : !gentle
              ? 'CRASH — CAME DOWN TOO HARD'
              : 'CRASH — TOO FAST TO LAND';
        events |= EVENT_CRASH;
      }
      }
    }

    // Rings: crossing a ring's plane inside its circle scores it.
    const ring = s.rings[s.ringIndex];
    if (ring && !ring.passed && prevZ < ring.z && p.z >= ring.z) {
      const dx = p.x - ring.x;
      const dy = p.alt - ring.y;
      if (Math.hypot(dx, dy) < ring.r) {
        ring.passed = true;
        s.ringIndex += 1;
        s.combo += 1;
        const gained = RINGS.points + (s.combo - 1) * RINGS.comboStep;
        s.score += gained;
        events |= EVENT_RING;
        s.message = s.ringIndex >= s.rings.length
          ? 'ALL RINGS — NOW LAND ON RWY 27'
          : 'RING ' + s.ringIndex + '/' + s.rings.length + '  +' + gained;
        s.messageT = 3;
      } else {
        // Missed: the ring is behind now, so move on to the next one —
        // circling back for it would only end in the hillside.
        ring.missed = true;
        s.ringIndex += 1;
        s.combo = 0;
        s.message = 'RING MISSED — FLY THE NEXT ONE';
        s.messageT = 2.5;
      }
    }

    // Low-altitude warning when skimming the hills (not on final approach
    // over the runway, where being low is the whole point).
    if (!p.onGround && !rw && p.alt - ground < 35 && s.messageT <= 0) {
      s.message = 'PULL UP — TERRAIN';
      s.messageT = 1.2;
    }
    if (s.time > SORTIE.maxSeconds && s.mode === MODE_PLAYING) {
      s.mode = MODE_OVER;
      s.crashReason = 'OUT OF TIME — THE COURIER WINDOW CLOSED';
      events |= EVENT_CRASH;
    }
    s.events = events;
    return events;
  }

  world.terrainHeight = terrainHeight;
  world.terrainColor = terrainColor;
  world.reset = reset;
  world.startSortie = startSortie;
  world.step = step;
  world.FOV = FIELD;
  return world;
}
