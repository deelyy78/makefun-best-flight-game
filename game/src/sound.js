// Sky Courier — tiny synthesised sounds (WebAudio oscillators, no audio
// files). Silent until the first user gesture unlocks the audio context.
export function createSound() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      const t0 = ctx.currentTime + when;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch { /* audio is decoration; never break the game */ }
  }

  return {
    ensure,
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    ring() { tone(880, 0.18, 'sine', 0.22); tone(1318, 0.3, 'sine', 0.18, 0.09); },
    click() { tone(1200, 0.05, 'square', 0.08); },
    warn() { tone(220, 0.22, 'square', 0.12); tone(220, 0.22, 'square', 0.12, 0.28); },
    land() { tone(523, 0.2, 'sine', 0.2); tone(659, 0.2, 'sine', 0.2, 0.12); tone(784, 0.4, 'sine', 0.2, 0.24); },
    crash() { tone(110, 0.7, 'sawtooth', 0.25); tone(55, 0.9, 'sawtooth', 0.2, 0.1); },
    engine(throttle, speed) {
      if (!ctx || !engineOsc || muted) return;
      try {
        engineOsc.frequency.setTargetAtTime(52 + throttle * 70 + speed * 0.12, ctx.currentTime, 0.1);
        engineGain.gain.setTargetAtTime(0.02 + throttle * 0.05, ctx.currentTime, 0.1);
      } catch { /* ignore */ }
    },
  };
}
