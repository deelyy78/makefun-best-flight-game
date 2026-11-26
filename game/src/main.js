// Sky Courier — boot and main loop. Fixed-step simulation (60 Hz), a
// canvas scaled to the window, screenshot scenes via ?shot=, and the
// window.__game handle the verification harness reads.
import { FIELD, STEP, BEST_KEY } from './config.js';
import { createWorld, MODE_TITLE, MODE_PLAYING, MODE_LANDED, MODE_DONE, MODE_OVER, EVENT_RING, EVENT_LANDED, EVENT_CRASH } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createSound } from './sound.js';
import { stageShot, autopilot } from './shots.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || '1') || 1;
const shotName = params.get('shot') || '';

const world = createWorld(seed);
const renderer = createRenderer();
const input = createInput(canvas);
const sound = createSound();

let best = 0;
try {
  best = Number(localStorage.getItem(BEST_KEY) || '0') || 0;
} catch { best = 0; }

const ui = {
  world,
  state: null,
  paused: false,
  time: 0,
  debugAutopilot: false,
  muted: false,
  frozen: false,
};
window.__game = ui;

function fitCanvas() {
  const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  canvas.style.width = Math.floor(FIELD.width * scale) + 'px';
  canvas.style.height = Math.floor(FIELD.height * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function saveBest() {
  if (world.state.score > best) {
    best = world.state.score;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* ignore */ }
  }
}

function restartSortie(keepScore) {
  const sortie = world.state.sortie;
  world.reset(sortie, keepScore);
  ui.paused = false;
  world.startSortie();
  sound.ensure();
}

function nextSortie() {
  const score = world.state.score;
  const done = world.state.sortiesDone;
  world.reset(world.state.sortie + 1, true);
  world.state.score = score;
  world.state.sortiesDone = done;
  ui.paused = false;
  world.startSortie();
}

function handleEvents(events) {
  if (events & EVENT_RING) sound.ring();
  if (events & EVENT_LANDED) { sound.land(); saveBest(); }
  if (events & EVENT_CRASH) { sound.crash(); saveBest(); }
}

function update(dt) {
  const s = world.state;
  ui.state = s;
  if (input.pressed('Enter')) {
    sound.ensure();
    if (s.mode === MODE_TITLE) world.startSortie();
    else if (s.mode === MODE_LANDED) nextSortie();
    else if (s.mode === MODE_DONE || s.mode === MODE_OVER) { world.reset(0, false); world.startSortie(); }
  }
  if (input.pressed('KeyP') || input.pressed('Escape')) {
    if (s.mode === MODE_PLAYING) { ui.paused = !ui.paused; sound.click(); }
  }
  if (input.pressed('KeyM')) {
    sound.ensure();
    ui.muted = sound.toggleMute();
  }
  if (input.pressed('KeyR') || input.read.restart) {
    restartSortie(false);
    return;
  }
  if (ui.paused || s.mode !== MODE_PLAYING) return;
  const ctl = ui.debugAutopilot
    ? autopilot(s, nextTargetFor(s))
    : input.read(s.plane.throttle);
  const events = world.step(dt, ctl);
  handleEvents(events);
  sound.engine(s.plane.throttle, s.plane.speed);
  if (s.mode === MODE_PLAYING && s.plane.speed < 58 && !s.plane.onGround && Math.floor(ui.time * 2) !== Math.floor((ui.time - dt) * 2)) {
    sound.warn();
  }
}

function nextTargetFor(s) {
  const ring = s.rings[s.ringIndex];
  if (ring) return { x: ring.x, y: ring.y, z: ring.z, flare: false };
  const p = s.plane;
  const touchdownZ = 4300;
  const dist = touchdownZ - p.z;
  if (dist < 0) return { x: 0, y: Math.max(2, Math.abs(p.x) * 0.4), z: p.z + 250, flare: true };
  return { x: 0, y: Math.max(2, dist * 0.07) + Math.min(80, Math.abs(p.x) * 0.4), z: touchdownZ, flare: dist < 1400 };
}

function render() {
  renderer.draw(ctx, world, best, ui.paused, ui.time);
  const s = world.state;
  const p = s.plane;
  const line = s.mode === MODE_PLAYING
    ? 'Flying sortie ' + (s.sortie + 1) + ': score ' + s.score + ', rings ' + s.ringIndex + ' of ' + s.rings.length
      + ', altitude ' + Math.round(p.alt) + ' feet, speed ' + Math.round(p.speed) + ' knots, fuel ' + Math.round(p.fuel) + ' percent.'
    : s.mode === MODE_TITLE
      ? 'Sky Courier. Press Enter to fly.'
      : s.mode;
  if (statusEl.textContent !== line) statusEl.textContent = line;
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!ui.frozen) {
    acc += elapsed;
    while (acc >= STEP) {
      ui.time += STEP;
      update(STEP);
      acc -= STEP;
    }
  }
  render();
  requestAnimationFrame(frame);
}

if (shotName) {
  // Screenshot scene: stage the world, draw it, and keep the frame loop
  // running (frozen) so the compositor actually presents the canvas —
  // a single synchronous draw during parse never reaches a screenshot.
  world.reset(0, false);
  stageShot(shotName, world);
  ui.state = world.state;
  ui.time = shotName === 'cover' ? 13 : shotName === 'flight' ? 20 : shotName === 'end' ? 120 : 2;
  ui.frozen = true;
  requestAnimationFrame(frame);
} else {
  world.reset(0, false);
  ui.state = world.state;
  requestAnimationFrame(frame);
}
