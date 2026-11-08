import {
  AI_PLANNER,
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
  // Posicoes aproximadas: o empurrao das explosoes nao deve apagar o que a IA aprendeu.
  const coarse = (value) => Math.round(value / 12);
  return [
    attacker.id,
    target.id,
    coarse(attacker.position.x),
    coarse(attacker.position.y),
    coarse(attacker.position.z),
    coarse(target.position.x),
    coarse(target.position.y),
    coarse(target.position.z),
    game.aiDifficulty,
  ].join(":");
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

// Normal padrao (Box-Muller): erros pequenos sao comuns e grandes sao raros, como numa pessoa.
function gaussian() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function applyImprecision(shot, preset, scale) {
  const error = preset.aimError;
  return {
    yaw: wrapDegrees(shot.yaw + gaussian() * error.yaw * scale),
    elevation: clamp(shot.elevation + gaussian() * error.elevation * scale, ELEVATION_LIMITS.min, ELEVATION_LIMITS.max),
    velocity: clamp(shot.velocity * (1 + (gaussian() * error.power * scale) / 100), POWER_MIN_VELOCITY, POWER_MAX_VELOCITY),
  };
}

// Pesado quando acha um tiro certeiro; fragmentacao quando so chega perto.
function chooseWeapon(attacker, score, preset) {
  if (Math.random() >= preset.specialChance) {
    return "standard";
  }
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
  const stateKey = buildStateKey(game, attacker, target);
  const misses = game.aiMissMemory.get(stateKey)?.length ?? 0;
  // A cada erro a IA tambem "le" melhor o vento (o erro de vento e sistematico, nao some com sorte).
  const baseKnowledge = preset.windKnowledge * (ROUND_MODIFIERS[game.modifier]?.aiWindScale ?? 1);
  const knowledge = 1 - (1 - baseKnowledge) * preset.learning ** misses;
  const wind = { x: game.wind.x * knowledge, z: game.wind.z * knowledge };
  const bearing = Math.round(bearingTo(attacker.position, target.position));
  const candidates = [];
  let selected = null;

  search:
  for (let offset = 0; offset <= AI_PLANNER.yawSpan; offset += AI_PLANNER.yawStep) {
    for (const sign of offset === 0 ? [1] : [1, -1]) {
      const yaw = wrapDegrees(bearing + sign * offset);
      for (let elevation = 0; elevation <= 80; elevation += AI_PLANNER.elevationStep) {
        for (let velocity = POWER_MIN_VELOCITY; velocity <= POWER_MAX_VELOCITY; velocity += AI_PLANNER.velocityStep) {
          const shot = { yaw, elevation, velocity };
          const result = simulateShot(world, attacker, target, shot, wind, AI_PLANNER.simulationStep, game.gravity);
          if (result.hitTarget) {
            selected = { ...shot, score: 0 };
            break search;
          }
          candidates.push({ ...shot, score: result.score });
        }
      }
    }
  }

  if (!selected) {
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0] ?? { yaw: attacker.yaw, elevation: 45, velocity: 35, score: Number.POSITIVE_INFINITY };
    selected = refineShot(world, attacker, target, best, wind, game.gravity);
  }

  // Erro humano: diminui a cada erro contra o mesmo alvo, ate o minimo da dificuldade.
  const scale = Math.max(preset.minError, preset.learning ** misses);
  const shot = applyImprecision(selected, preset, scale);
  return {
    weapon: chooseWeapon(attacker, selected.score, preset),
    yaw: shot.yaw,
    elevation: shot.elevation,
    power: velocityToPower(shot.velocity),
    stateKey,
    expectedMiss: selected.score,
    source: { yaw: selected.yaw, elevation: selected.elevation, velocity: selected.velocity },
  };
}
