import * as THREE from "three";
import { ARENA } from "../config.js";
import { aimDirection, forwardVector } from "../physics.js";
import { clamp } from "../math.js";
import { ARENA_CENTER } from "./sky.js";

export const CAMERA_MODES = [
  { id: "chase", label: "Perseguição" },
  { id: "tactical", label: "Tática" },
  { id: "overview", label: "Visão geral" },
  { id: "top", label: "Topo" },
  { id: "free", label: "Livre" },
];

const tempA = new THREE.Vector3();
const tempB = new THREE.Vector3();

function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

// Cameras do legado (livre, de cima, do canto e do carrinho) com transicoes suaves,
// acompanhamento do projetil e orbita com o mouse.
export class CameraRig {
  constructor(camera, element) {
    this.camera = camera;
    this.mode = "chase";
    this.position = new THREE.Vector3(ARENA_CENTER.x + 140, 120, ARENA_CENTER.z - 160);
    this.target = ARENA_CENTER.clone();
    this.desiredPosition = this.position.clone();
    this.desiredTarget = this.target.clone();
    this.orbit = { yaw: 0.8, pitch: 0.6, distance: 220, target: ARENA_CENTER.clone() };
    this.cinematic = 0;
    this.override = null;
    this.lastFocus = null;
    this.listeners = new Set();
    this.attach(element);
  }

  onChange(listener) {
    this.listeners.add(listener);
  }

  setMode(mode) {
    if (!CAMERA_MODES.some((entry) => entry.id === mode) || mode === this.mode) {
      return;
    }
    if (mode === "free") {
      this.syncOrbitFromCamera();
    }
    this.mode = mode;
    this.listeners.forEach((listener) => listener(mode));
  }

  cycle(step = 1) {
    const index = CAMERA_MODES.findIndex((entry) => entry.id === this.mode);
    this.setMode(CAMERA_MODES[(index + step + CAMERA_MODES.length) % CAMERA_MODES.length].id);
  }

  get label() {
    return CAMERA_MODES.find((entry) => entry.id === this.mode)?.label ?? "";
  }

  syncOrbitFromCamera() {
    const offset = tempA.copy(this.position).sub(this.target);
    const distance = Math.max(20, offset.length());
    this.orbit.distance = distance;
    this.orbit.pitch = Math.asin(clamp(offset.y / distance, -0.99, 0.99));
    this.orbit.yaw = Math.atan2(offset.x, offset.z);
    this.orbit.target.copy(this.target);
  }

  attach(element) {
    let dragging = null;
    element.addEventListener("pointerdown", (event) => {
      dragging = { x: event.clientX, y: event.clientY, button: event.button, moved: false };
      element.setPointerCapture?.(event.pointerId);
    });
    element.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const dx = event.clientX - dragging.x;
      const dy = event.clientY - dragging.y;
      if (!dragging.moved && Math.hypot(dx, dy) < 4) {
        return;
      }
      if (!dragging.moved) {
        dragging.moved = true;
        this.setMode("free");
      }
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      if (dragging.button === 2 || event.shiftKey) {
        const forward = tempA.set(Math.sin(this.orbit.yaw), 0, Math.cos(this.orbit.yaw));
        const right = tempB.set(forward.z, 0, -forward.x);
        const scale = this.orbit.distance * 0.0016;
        this.orbit.target.addScaledVector(right, -dx * scale).addScaledVector(forward, -dy * scale);
        this.clampOrbitTarget();
      } else {
        this.orbit.yaw -= dx * 0.006;
        this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.005, 0.05, 1.5);
      }
    });
    const stop = () => {
      dragging = null;
    };
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
    element.addEventListener("contextmenu", (event) => event.preventDefault());
    element.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (this.mode !== "free") {
        this.setMode("free");
      }
      this.orbit.distance = clamp(this.orbit.distance * Math.exp(event.deltaY * 0.0012), 25, 420);
    }, { passive: false });
  }

  clampOrbitTarget() {
    this.orbit.target.x = clamp(this.orbit.target.x, ARENA.minX - 40, ARENA.maxX + 40);
    this.orbit.target.z = clamp(this.orbit.target.z, ARENA.minZ - 40, ARENA.maxZ + 40);
  }

  // Coloca a camera atras do carrinho, olhando na direcao da mira.
  chasePose(player) {
    const forward = forwardVector(player.yaw);
    const aim = aimDirection(player.yaw, Math.min(player.elevation, 40));
    // Tela estreita (celular em pe): afasta a camera para o carrinho nao tomar a tela toda.
    const spread = clamp(1.15 / this.camera.aspect, 1, 1.8);
    this.desiredPosition.set(
      player.position.x - forward.x * 28 * spread,
      player.position.y + 11.5 * spread,
      player.position.z - forward.z * 28 * spread,
    );
    this.desiredTarget.set(
      player.position.x + aim.x * 26,
      player.position.y + 2 + aim.y * 9,
      player.position.z + aim.z * 26,
    );
  }

  // Enquadra os dois carrinhos a partir de tras do jogador da vez.
  tacticalPose(player, opponent) {
    const dx = opponent.position.x - player.position.x;
    const dz = opponent.position.z - player.position.z;
    const span = Math.max(30, Math.hypot(dx, dz));
    const dirX = dx / span;
    const dirZ = dz / span;
    const distance = (30 + span * 0.55) * clamp(1.15 / this.camera.aspect, 1, 1.6);
    this.desiredPosition.set(
      player.position.x - dirX * distance - dirZ * span * 0.18,
      Math.max(player.position.y, opponent.position.y) + 28 + span * 0.42,
      player.position.z - dirZ * distance + dirX * span * 0.18,
    );
    this.desiredTarget.set(
      player.position.x + dx * 0.55,
      (player.position.y + opponent.position.y) / 2,
      player.position.z + dz * 0.55,
    );
  }

  projectilePose(projectile, position) {
    const velocity = tempA.set(projectile.velocity.x, 0, projectile.velocity.z);
    if (velocity.lengthSq() < 0.01) {
      velocity.set(0, 0, 1);
    }
    velocity.normalize();
    this.desiredPosition.set(
      position.x - velocity.x * 30 + velocity.z * 10,
      Math.max(position.y + 9, 8),
      position.z - velocity.z * 30 - velocity.x * 10,
    );
    this.desiredTarget.set(position.x, position.y, position.z);
  }

  // Se houver predio entre o foco e a camera, aproxima a camera; se ficar perto demais, sobe.
  avoidOcclusion(world, from) {
    const to = this.desiredPosition;
    const point = { x: 0, y: 0, z: 0 };
    const firstBlocked = () => {
      for (let step = 2; step <= 30; step += 1) {
        const t = step / 30;
        point.x = from.x + (to.x - from.x) * t;
        point.y = from.y + (to.y - from.y) * t;
        point.z = from.z + (to.z - from.z) * t;
        if (point.y > 0.5 && world.isBuildingSolid(point)) {
          return t;
        }
      }
      return null;
    };

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const blocked = firstBlocked();
      if (blocked === null) {
        return;
      }
      const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      const pulled = Math.max(0, blocked - 0.1);
      if (distance * pulled >= Math.max(14, distance * 0.65)) {
        to.set(
          from.x + (to.x - from.x) * pulled,
          from.y + (to.y - from.y) * pulled,
          from.z + (to.z - from.z) * pulled,
        );
      } else {
        to.y += 6;
      }
    }
  }

  update(state, dt, { projectileFocus = null, shake, world }) {
    const projectilePosition = projectileFocus?.position ?? null;
    const current = state.players[state.turnIndex];
    const opponent = state.players[1 - state.turnIndex];
    let rate = 3.2;
    let targetRate = null;
    let focus = null;

    switch (this.override ? "override" : this.mode) {
      case "override":
        this.desiredPosition.copy(this.override.position);
        this.desiredTarget.copy(this.override.target);
        rate = 5;
        targetRate = 9;
        break;
      case "free": {
        const { yaw, pitch, distance, target } = this.orbit;
        this.desiredPosition.set(
          target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
          target.y + Math.sin(pitch) * distance,
          target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
        );
        this.desiredTarget.copy(target);
        rate = 12;
        break;
      }
      case "overview":
        // camera3() do legado: do canto, olhando a cidade de cima.
        this.desiredPosition.set(ARENA_CENTER.x + 95, 150, ARENA.minZ - 95);
        this.desiredTarget.set(ARENA_CENTER.x - 5, 0, ARENA_CENTER.z + 10);
        break;
      case "top":
        // camera2() do legado: visao de cima.
        this.desiredPosition.set(ARENA_CENTER.x, 250, ARENA_CENTER.z - 25);
        this.desiredTarget.set(ARENA_CENTER.x, 0, ARENA_CENTER.z);
        break;
      default: {
        const follow = this.mode === "chase";
        if (state.phase === "roundStart" || state.phase === "matchOver") {
          this.cinematic += dt * (state.phase === "matchOver" ? 0.12 : 0.18);
          const subject = state.phase === "matchOver"
            ? state.players.find((player) => player.id === state.matchWinner)?.position ?? ARENA_CENTER
            : ARENA_CENTER;
          const radius = state.phase === "matchOver" ? 45 : 190;
          this.desiredPosition.set(
            subject.x + Math.sin(this.cinematic) * radius,
            (subject.y ?? 0) + (state.phase === "matchOver" ? 22 : 120),
            subject.z + Math.cos(this.cinematic) * radius,
          );
          this.desiredTarget.set(subject.x, (subject.y ?? 0) + 4, subject.z);
          rate = 1.6;
        } else if (state.phase === "flying" && follow && projectilePosition) {
          this.projectilePose(projectileFocus, projectilePosition);
          focus = projectilePosition;
          rate = 4;
          targetRate = 10;
          this.lastFocus = projectilePosition.clone();
        } else if ((state.phase === "settling" || state.phase === "roundOver") && state.impact && follow) {
          this.desiredTarget.set(state.impact.x, state.impact.y, state.impact.z);
          focus = this.desiredTarget;
          rate = 1.2;
          targetRate = 3;
        } else {
          if (follow) {
            this.chasePose(current);
          } else {
            this.tacticalPose(current, opponent);
            rate = 2.6;
          }
          focus = tempB.set(current.position.x, current.position.y + 5, current.position.z);
        }
        break;
      }
    }

    if (world && focus) {
      this.avoidOcclusion(world, focus);
    }

    this.position.lerp(this.desiredPosition, damp(rate, dt));
    this.target.lerp(this.desiredTarget, damp(targetRate ?? rate * 1.3, dt));
    if (this.position.y < 3) {
      this.position.y = 3;
    }

    this.camera.position.copy(this.position);
    if (shake > 0) {
      this.camera.position.x += (Math.random() * 2 - 1) * shake;
      this.camera.position.y += (Math.random() * 2 - 1) * shake;
      this.camera.position.z += (Math.random() * 2 - 1) * shake;
    }
    this.camera.lookAt(this.target);
  }

  // Direcao horizontal da camera em graus (mesma convencao do yaw dos carrinhos).
  get heading() {
    const direction = tempA.copy(this.target).sub(this.position);
    return (Math.atan2(direction.x, direction.z) * 180) / Math.PI;
  }
}
