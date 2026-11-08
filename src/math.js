export function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians) {
  return (radians * 180) / Math.PI;
}

// Normaliza um angulo em graus para o intervalo (-180, 180].
export function wrapDegrees(degrees) {
  let value = ((degrees + 180) % 360 + 360) % 360 - 180;
  if (value === -180) {
    value = 180;
  }
  return value;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function distance3d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
