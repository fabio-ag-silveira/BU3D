import {
  AI_PRESETS,
  ROUND_MODIFIERS,
  ELEVATION_LIMITS,
  EXPLOSION_RADIUS,
  POWER_MAX_VELOCITY,
  POWER_MIN_VELOCITY,
  TANK,
} from "./config.js";
import { clamp, degToRad, wrapDegrees } from "./math.js";
import {
  bearingTo,
  getLaunchVelocity,
  getMuzzle,
  getTankCenter,
  isOutOfBounds,
  projectileAt,
  velocityToPower,
} from "./physics.js";

const MAX_SIMULATION_TIME = 16;

// Hitbox com seno/cosseno pre-calculados: a busca da IA testa milhares de trajetorias.
function createHitbox(position, yaw) {
  const radians = degToRad(yaw);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return (point) => {
    const dx = point.x - position.x;
    const dz = point.z - position.z;
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const localY = point.y - position.y;
    return Math.abs(localX) <= TANK.halfWidth && Math.abs(localZ) <= TANK.halfLength &&
      localY >= -0.5 && localY <= TANK.height;
  };
}

export function simulateShot(world, attacker, target, shot, wind, simulationStep = 0.05, gravity = undefined) {
  const origin = getMuzzle(attacker.position, shot.yaw, shot.elevation);
  const launch = getLaunchVelocity(shot.yaw, shot.elevation, shot.velocity);
  const targetCenter = getTankCenter(target);
  const selfCenter = getTankCenter(attacker);
  const hitsTarget = createHitbox(target.position, target.yaw);
  const hitsSelf = createHitbox(attacker.position, shot.yaw);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let elapsed = simulationStep; elapsed <= MAX_SIMULATION_TIME; elapsed += simulationStep) {
    const point = projectileAt(origin, launch, wind, elapsed, gravity);
    const dx = point.x - targetCenter.x;
    const dy = point.y - targetCenter.y;
    const dz = point.z - targetCenter.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    bestDistance = Math.min(bestDistance, distance);

    if (hitsTarget(point)) {
      return { hitTarget: true, score: 0 };
    }

    if (world.isSolid(point) || (elapsed > 0.5 && hitsSelf(point))) {
      const selfDistance = Math.hypot(point.x - selfCenter.x, point.y - selfCenter.y, point.z - selfCenter.z);
      if (selfDistance < EXPLOSION_RADIUS) {
        return { hitTarget: false, score: 300 + distance };
      }
      return { hitTarget: distance < EXPLOSION_RADIUS * 0.4, score: distance };
    }

    if (isOutOfBounds(point)) {
      break;
    }
  }

  return { hitTarget: false, score: bestDistance + 40 };
}

function buildStateKey(game, attacker, target) {
  return [
    Math.round(attacker.position.x),
    Math.round(attacker.position.y),
    Math.round(attacker.position.z),
    Math.round(target.position.x),
    Math.round(target.position.y),
    Math.round(target.position.z),
    game.aiDifficulty,
  ].join(":");
}

function sameShot(a, b) {
  return a.yaw === b.yaw && a.elevation === b.elevation && a.velocity === b.velocity;
}

function refineShot(world, attacker, target, seed, wind, gravity) {
  let best = { ...seed };
  for (let yaw = seed.yaw - 3; yaw <= seed.yaw + 3; yaw += 1) {
    for (let elevation = seed.elevation - 4; elevation <= seed.elevation + 4; elevation += 1) {
      for (let velocity = seed.velocity - 3; velocity <= seed.velocity + 3; velocity += 0.5) {
        const shot = {
          yaw: wrapDegrees(yaw),
          elevation: clamp(elevation, ELEVATION_LIMITS.min, ELEVATION_LIMITS.max),
          velocity: clamp(velocity, POWER_MIN_VELOCITY, POWER_MAX_VELOCITY),
        };
        const result = simulateShot(world, attacker, target, shot, wind, 0.02, gravity);
        if (result.hitTarget) {
          return { ...shot, score: 0 };
        }
        if (result.score < best.score) {
          best = { ...shot, score: result.score };
        }
      }
    }
  }
  return best;
}

function applyImprecision(shot, preset) {
  const jitter = (amount) => (Math.random() * 2 - 1) * amount;
  return {
    yaw: wrapDegrees(shot.yaw + jitter(preset.aimJitter.yaw)),
    elevation: clamp(shot.elevation + jitter(preset.aimJitter.elevation), ELEVATION_LIMITS.min, ELEVATION_LIMITS.max),
    velocity: clamp(shot.velocity + jitter(preset.aimJitter.velocity), POWER_MIN_VELOCITY, POWER_MAX_VELOCITY),
  };
}

// Pesado quando acha um tiro certeiro; fragmentacao quando so chega perto.
function chooseWeapon(attacker, score) {
  if (score === 0 && attacker.ammo.heavy > 0) {
    return "heavy";
  }
  if (score > 0 && score < 22 && attacker.ammo.cluster > 0) {
    return "cluster";
  }
  if (score >= 22 && score < 40 && attacker.ammo.bounce > 0 && Math.random() < 0.3) {
    return "bounce";
  }
  return "standard";
}

// Busca em grade por (giro, elevacao, velocidade), considerando vento, predios e crateras.
export function planAiShot(game) {
  const attacker = game.currentPlayer;
  const target = game.pickAiTarget();
  const world = game.world;
  const preset = AI_PRESETS[game.aiDifficulty];
  const knowledge = preset.windKnowledge * (ROUND_MODIFIERS[game.modifier]?.aiWindScale ?? 1);
  const wind = { x: game.wind.x * knowledge, z: game.wind.z * knowledge };
  const stateKey = buildStateKey(game, attacker, target);
  const previousMisses = game.aiMissMemory.get(stateKey) ?? [];
  const bearing = Math.round(bearingTo(attacker.position, target.position));
  const candidates = [];
  let selected = null;

  search:
  for (let offset = 0; offset <= preset.yawSpan; offset += preset.yawStep) {
    for (const sign of offset === 0 ? [1] : [1, -1]) {
      const yaw = wrapDegrees(bearing + sign * offset);
      for (let elevation = 0; elevation <= 80; elevation += preset.elevationStep) {
        for (let velocity = POWER_MIN_VELOCITY; velocity <= POWER_MAX_VELOCITY; velocity += preset.velocityStep) {
          const shot = { yaw, elevation, velocity };
          const result = simulateShot(world, attacker, target, shot, wind, preset.simulationStep, game.gravity);
          if (result.hitTarget && !previousMisses.some((miss) => sameShot(miss, shot))) {
            selected = { ...shot, score: 0 };
            break search;
          }
          const penalty = previousMisses.some((miss) => sameShot(miss, shot)) ? 250 : 0;
          candidates.push({ ...shot, score: result.score + penalty });
        }
      }
    }
  }

  if (!selected) {
    candidates.sort((a, b) => a.score - b.score);
    let best = candidates[0] ?? { yaw: attacker.yaw, elevation: 45, velocity: 35, score: Number.POSITIVE_INFINITY };
    if (preset.refinement) {
      best = refineShot(world, attacker, target, best, wind, game.gravity);
      selected = best;
    } else {
      const pool = candidates.slice(0, Math.max(1, preset.candidatePool));
      selected = pool[Math.floor(Math.random() * pool.length)] ?? best;
    }
  }

  // Cada erro na mesma situacao deixa a mira mais firme (a IA "corrige" o tiro).
  const steadiness = 1 / (1 + previousMisses.length * 0.6);
  const shot = applyImprecision(selected, {
    aimJitter: {
      yaw: preset.aimJitter.yaw * steadiness,
      elevation: preset.aimJitter.elevation * steadiness,
      velocity: preset.aimJitter.velocity * steadiness,
    },
  });
  return {
    weapon: chooseWeapon(attacker, selected.score),
    yaw: shot.yaw,
    elevation: shot.elevation,
    power: velocityToPower(shot.velocity),
    stateKey,
    source: { yaw: selected.yaw, elevation: selected.elevation, velocity: selected.velocity },
  };
}
