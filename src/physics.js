import {
  ARENA,
  ELEVATION_LIMITS,
  GRAVITY,
  OUT_OF_BOUNDS_MARGIN,
  POWER_MAX_VELOCITY,
  POWER_MIN_VELOCITY,
  TANK,
} from "./config.js";
import { clamp, degToRad, radToDeg } from "./math.js";

// Convencao: yaw 0 aponta para +z e yaw 90 aponta para +x (igual a rotation.y do three.js).
export function forwardVector(yawDegrees) {
  const yaw = degToRad(yawDegrees);
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function aimDirection(yawDegrees, elevationDegrees) {
  const yaw = degToRad(yawDegrees);
  const elevation = degToRad(elevationDegrees);
  return {
    x: Math.sin(yaw) * Math.cos(elevation),
    y: Math.sin(elevation),
    z: Math.cos(yaw) * Math.cos(elevation),
  };
}

export function bearingTo(from, to) {
  return radToDeg(Math.atan2(to.x - from.x, to.z - from.z));
}

// Forma fechada da trajetoria: o vento e uma aceleracao horizontal constante.
export function projectileAt(origin, velocity, wind, time, gravity = GRAVITY) {
  const half = (time * time) / 2;
  return {
    x: origin.x + velocity.x * time + wind.x * half,
    y: origin.y + velocity.y * time - gravity * half,
    z: origin.z + velocity.z * time + wind.z * half,
  };
}

export function velocityAt(velocity, wind, time, gravity = GRAVITY) {
  return {
    x: velocity.x + wind.x * time,
    y: velocity.y - gravity * time,
    z: velocity.z + wind.z * time,
  };
}

export function getMuzzle(position, yaw, elevation) {
  const direction = aimDirection(yaw, elevation);
  return {
    x: position.x + direction.x * TANK.barrelLength,
    y: position.y + TANK.pivotHeight + direction.y * TANK.barrelLength,
    z: position.z + direction.z * TANK.barrelLength,
  };
}

export function getLaunchVelocity(yaw, elevation, speed) {
  const direction = aimDirection(yaw, elevation);
  return { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed };
}

export function powerToVelocity(power) {
  return POWER_MIN_VELOCITY + clamp(power, 0, 1) * (POWER_MAX_VELOCITY - POWER_MIN_VELOCITY);
}

export function velocityToPower(velocity) {
  return clamp((velocity - POWER_MIN_VELOCITY) / (POWER_MAX_VELOCITY - POWER_MIN_VELOCITY), 0, 1);
}

export function clampElevation(elevation) {
  return clamp(elevation, ELEVATION_LIMITS.min, ELEVATION_LIMITS.max);
}

// Converte um ponto do mundo para o referencial do carrinho (x lateral, z para frente).
export function toTankLocal(point, position, yawDegrees) {
  const yaw = degToRad(yawDegrees);
  const dx = point.x - position.x;
  const dz = point.z - position.z;
  return {
    x: dx * Math.cos(yaw) - dz * Math.sin(yaw),
    y: point.y - position.y,
    z: dx * Math.sin(yaw) + dz * Math.cos(yaw),
  };
}

export function toTankWorld(local, position, yawDegrees) {
  const yaw = degToRad(yawDegrees);
  return {
    x: position.x + local.x * Math.cos(yaw) + local.z * Math.sin(yaw),
    y: position.y + local.y,
    z: position.z - local.x * Math.sin(yaw) + local.z * Math.cos(yaw),
  };
}

export function isInsideTankHitbox(point, player) {
  const local = toTankLocal(point, player.position, player.yaw);
  return (
    Math.abs(local.x) <= TANK.halfWidth &&
    Math.abs(local.z) <= TANK.halfLength &&
    local.y >= -0.5 &&
    local.y <= TANK.height
  );
}

export function getTankCenter(player) {
  return { x: player.position.x, y: player.position.y + 2.5, z: player.position.z };
}

export function isOutOfBounds(point) {
  return (
    point.y < -10 ||
    point.x < ARENA.minX - OUT_OF_BOUNDS_MARGIN ||
    point.x > ARENA.maxX + OUT_OF_BOUNDS_MARGIN ||
    point.z < ARENA.minZ - OUT_OF_BOUNDS_MARGIN ||
    point.z > ARENA.maxZ + OUT_OF_BOUNDS_MARGIN
  );
}

const SUPPORT_POINTS = [
  { x: 0, z: 0 },
  { x: -TANK.supportInset.x, z: -TANK.supportInset.z },
  { x: TANK.supportInset.x, z: -TANK.supportInset.z },
  { x: -TANK.supportInset.x, z: TANK.supportInset.z },
  { x: TANK.supportInset.x, z: TANK.supportInset.z },
];

export function isTankSupported(world, position, yaw) {
  if (position.y <= 0.001) {
    return true;
  }
  return SUPPORT_POINTS.some((offset) =>
    world.isBuildingSolid(toTankWorld({ x: offset.x, y: -0.5, z: offset.z }, position, yaw)));
}

// Testa se o carrinho cabe na posicao: limites da arena, paredes de predio e o outro carrinho.
export function isTankBlocked(world, position, yaw, direction, other) {
  const margin = Math.max(TANK.halfWidth, TANK.halfLength);
  if (
    position.x < ARENA.minX + margin || position.x > ARENA.maxX - margin ||
    position.z < ARENA.minZ + margin || position.z > ARENA.maxZ - margin
  ) {
    return true;
  }
  if (other && Math.hypot(other.position.x - position.x, other.position.z - position.z) < 11 &&
      Math.abs(other.position.y - position.y) < TANK.height) {
    return true;
  }

  const edgeZ = direction * (TANK.halfLength + 0.2);
  for (const lateral of [-TANK.halfWidth + 0.5, 0, TANK.halfWidth - 0.5]) {
    for (const height of [1, 3.5]) {
      if (world.isBuildingSolid(toTankWorld({ x: lateral, y: height, z: edgeZ }, position, yaw))) {
        return true;
      }
    }
  }
  return false;
}
