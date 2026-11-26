// Sky Courier — keyboard and mouse input. Keys drive bank, pitch and
// throttle; the mouse steers toward the pointer when it moves, and a click
// (or Space) toggles the airbrake. Nothing here reads the clock.
import { FIELD } from './config.js';

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: FIELD.width / 2, y: FIELD.height / 2, active: false, down: false };
  let airbrake = false;

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') airbrake = !airbrake;
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * FIELD.width;
    mouse.y = ((e.clientY - r.top) / r.height) * FIELD.height;
    mouse.active = true;
  }
  function onMouseDown(e) {
    if (e.button === 0) mouse.down = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  const has = (...codes) => codes.some((c) => keys.has(c));

  /** Read the current control deflection: bank/pitch in [-1, 1], throttle in [0, 1]. */
  function read(throttle) {
    let bank = 0;
    let pitch = 0;
    if (has('ArrowLeft', 'KeyA')) bank -= 1;
    if (has('ArrowRight', 'KeyD')) bank += 1;
    if (has('ArrowUp', 'KeyW')) pitch += 1;
    if (has('ArrowDown', 'KeyS')) pitch -= 1;
    if (bank === 0 && pitch === 0 && mouse.active && !mouse.down) {
      // Mouse steering: the pointer's offset from centre is the deflection.
      bank = (mouse.x - FIELD.width / 2) / (FIELD.width / 2);
      pitch = -((mouse.y - FIELD.height / 2) / (FIELD.height / 2)) * 0.8;
    }
    let thr = throttle;
    if (has('ShiftLeft', 'ShiftRight')) thr = Math.min(1, thr + 0.016);
    if (has('ControlLeft', 'ControlRight')) thr = Math.max(0, thr - 0.016);
    if (has('KeyR') && !read._rHeld) {
      read._rHeld = true;
      read.restart = true;
    } else if (!has('KeyR')) {
      read._rHeld = false;
      read.restart = false;
    }
    if (airbrake) thr = Math.min(thr, 0.25);
    return { bank, pitch, throttle: thr, airbrake };
  }

  function pressed(code) {
    const hit = keys.has(code);
    if (hit) keys.delete(code);
    return hit;
  }

  return { keys, mouse, read, pressed, get airbrake() { return airbrake; } };
}
