import * as THREE from "three";
import { WEAPONS } from "../config.js";

const SPEED = 0.45;
const MAX_FLIGHT = 2.3;
const TAIL = 0.9;

// Grava o ultimo tiro e, quando ele decide a rodada, reprisa em camera lenta.
export class Replay {
  constructor(stage) {
    this.stage = stage;
    this.recording = null;
    this.playing = null;
    this.meshes = new Map();
    this.geometry = new THREE.SphereGeometry(1, 14, 10);
  }

  get active() {
    return Boolean(this.playing);
  }

  handleEvent(event, now, context) {
    if (event.type === "shot") {
      this.recording = { frames: [], explosions: [], endedAt: null, context };
    } else if (event.type === "explosion" && this.recording && this.recording.endedAt === null) {
      this.recording.explosions.push({ t: now, event: { ...event } });
    } else if ((event.type === "roundEnd" || event.type === "matchEnd") && event.winnerId !== undefined) {
      this.start(now, context);
    }
  }

  record(state, now) {
    const recording = this.recording;
    if (!recording || recording.endedAt !== null) {
      return;
    }
    if (state.phase !== "flying") {
      recording.endedAt = now;
      return;
    }
    recording.frames.push({
      t: now,
      items: state.projectiles.map((projectile) => ({
        id: projectile.id,
        weapon: projectile.weapon,
        ownerId: projectile.ownerId,
        x: projectile.position.x,
        y: projectile.position.y,
        z: projectile.position.z,
      })),
    });
  }

  start(now, context) {
    const recording = this.recording;
    if (!recording || recording.frames.length < 4 || !recording.explosions.length) {
      return;
    }
    const end = recording.frames[recording.frames.length - 1].t;
    if (now - end > 8) {
      return;
    }
    const begin = Math.max(recording.frames[0].t, end - MAX_FLIGHT);
    this.playing = {
      frames: recording.frames.filter((frame) => frame.t >= begin),
      explosions: recording.explosions.map((entry) => ({ ...entry, fired: false })),
      time: begin,
      end: Math.max(end, recording.explosions[recording.explosions.length - 1].t) + TAIL,
      angle: 0,
      focus: null,
      context: context ?? recording.context,
    };
    this.recording = null;
    this.stage.overlayRoot?.classList.add("is-replay");
  }

  stop() {
    this.playing = null;
    this.meshes.forEach((mesh) => this.stage.scene.remove(mesh));
    this.meshes.clear();
    this.stage.rig.override = null;
    this.stage.overlayRoot?.classList.remove("is-replay");
  }

  // Interpola a posicao de cada projetil gravado no instante t.
  sample(t) {
    const frames = this.playing.frames;
    let index = frames.findIndex((frame) => frame.t > t);
    if (index === -1) {
      return null;
    }
    if (index === 0) {
      return frames[0].items;
    }
    const a = frames[index - 1];
    const b = frames[index];
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    return b.items.map((item) => {
      const previous = a.items.find((entry) => entry.id === item.id) ?? item;
      return {
        ...item,
        x: previous.x + (item.x - previous.x) * k,
        y: previous.y + (item.y - previous.y) * k,
        z: previous.z + (item.z - previous.z) * k,
      };
    });
  }

  update(dt, state) {
    const playing = this.playing;
    if (!playing) {
      return false;
    }
    if (state.phase !== "roundOver" && state.phase !== "matchOver") {
      this.stop();
      return false;
    }
    playing.time += dt * SPEED;
    playing.angle += dt * 0.25;

    const items = this.sample(playing.time) ?? [];
    const alive = new Set(items.map((item) => item.id));
    items.forEach((item) => {
      let mesh = this.meshes.get(item.id);
      if (!mesh) {
        const weapon = WEAPONS[item.weapon] ?? WEAPONS.standard;
        mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: weapon.color, toneMapped: false }));
        mesh.scale.setScalar(weapon.size * 1.2);
        this.stage.scene.add(mesh);
        this.meshes.set(item.id, mesh);
      }
      mesh.position.set(item.x, item.y, item.z);
      const owner = state.players.find((player) => player.id === item.ownerId);
      this.stage.effects.burst(item, { count: 1, colors: [owner?.color ?? "#ffffff"], speed: 0.2, life: 1.2, size: 2, glow: true });
    });
    this.meshes.forEach((mesh, id) => {
      if (!alive.has(id)) {
        this.stage.scene.remove(mesh);
        this.meshes.delete(id);
      }
    });

    playing.explosions.forEach((entry) => {
      if (!entry.fired && playing.time >= entry.t) {
        entry.fired = true;
        playing.focus = new THREE.Vector3(entry.event.x, entry.event.y, entry.event.z);
        this.stage.effects.handleEvent(entry.event, state, playing.context ?? {});
      }
    });

    // Camera de cinema: de lado, girando devagar em volta do projetil e depois da explosao.
    const focus = items.length
      ? items.reduce((sum, item) => sum.add(new THREE.Vector3(item.x, item.y, item.z)), new THREE.Vector3()).divideScalar(items.length)
      : playing.focus ?? this.stage.rig.target.clone();
    const radius = items.length ? 24 : 34;
    this.stage.rig.override = {
      position: new THREE.Vector3(
        focus.x + Math.cos(playing.angle) * radius,
        focus.y + 7,
        focus.z + Math.sin(playing.angle) * radius,
      ),
      target: focus,
    };

    if (playing.time >= playing.end) {
      this.stop();
    }
    return true;
  }
}
