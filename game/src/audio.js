// audio.js — all sound is synthesized with the Web Audio API; there are
// no audio files. Engine hum follows the car's speed, the police siren
// is a two-tone wail, crashes are filtered noise bursts, and a quiet
// pad-chord loop plays as ambient music once the game starts.

/** Create the audio engine. Call start() from a user gesture. */
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = null;
  let started = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // engine: sawtooth through a lowpass, pitch follows speed
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // siren: square wave whose frequency wails between two tones
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 700;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'sine';
    sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 240;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function blip(freq, duration, volume, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function playChord(freqs, duration) {
    if (!ctx) return;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.05, ctx.currentTime + duration - 0.4);
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    }
  }

  const CHORDS = [
    [130.81, 164.81, 196.0], // C major
    [110.0, 130.81, 164.81], // A minor
    [87.31, 110.0, 130.81], // F major
    [98.0, 123.47, 146.83], // G major
  ];

  return {
    start() {
      ensure();
      if (!ctx || started) return;
      started = true;
      if (ctx.state === 'suspended') ctx.resume();
      let i = 0;
      musicTimer = setInterval(() => {
        playChord(CHORDS[i % CHORDS.length], 3.6);
        i++;
      }, 3400);
    },
    setEngine(speed, inCar) {
      if (!ctx || !engineGain) return;
      const target = inCar ? 0.05 + Math.min(0.12, Math.abs(speed) * 0.004) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 3.2, ctx.currentTime, 0.1);
    },
    setSiren(on) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },
    crash(strength = 1) {
      noiseBurst(0.25, 0.3 * strength, 900);
      blip(70, 0.18, 0.25, 'sine');
    },
    /** Short tyre screech for a handbrake skid. */
    skid() {
      noiseBurst(0.16, 0.14, 2400);
    },
    horn() {
      blip(370, 0.28, 0.16, 'square');
      blip(466, 0.28, 0.12, 'square');
    },
    punch() {
      noiseBurst(0.09, 0.35, 500);
      blip(120, 0.1, 0.3, 'sine');
    },
    coin() {
      blip(880, 0.12, 0.18, 'sine');
      setTimeout(() => blip(1318, 0.2, 0.18, 'sine'), 90);
    },
    busted() {
      blip(220, 0.5, 0.2, 'sawtooth');
      setTimeout(() => blip(165, 0.7, 0.2, 'sawtooth'), 300);
    },
  };
}
