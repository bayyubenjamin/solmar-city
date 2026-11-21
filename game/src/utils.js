// utils.js — small shared helpers for SOLMAR: a seeded random number
// generator, clamps, lerps and 2D geometry. Nothing here touches the
// scene; every other module imports what it needs from here.

/** Deterministic PRNG (mulberry32) so a seed always rebuilds the same city. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random number in [min, max) from a PRNG function. */
export function rand(rng, min, max) {
  return min + rng() * (max - min);
}

/** Random integer in [min, max] from a PRNG function. */
export function randInt(rng, min, max) {
  return Math.floor(rand(rng, min, max + 1));
}

/** Pick one element of an array with a PRNG function. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Clamp a value into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Interpolate between two angles, taking the shortest way around. */
export function lerpAngle(a, b, t) {
  return a + angleDiff(a, b) * t;
}

/** 2D distance between two points. */
export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Read a URL query parameter, or null when absent. */
export function queryParam(name) {
  const params = new URLSearchParams(window.location.search);
  const v = params.get(name);
  return v === null ? null : v;
}

/** Format a speed in km/h for the HUD. */
export function kmh(speedUnitsPerSecond) {
  return Math.round(Math.abs(speedUnitsPerSecond) * 3.6);
}
