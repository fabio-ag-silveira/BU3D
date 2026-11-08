import * as THREE from "three";
import { CRATES, TIME_SCALE, WEAPONS } from "../config.js";
import { projectileAt } from "../physics.js";
import { isWater, WATER_LEVEL } from "./surroundings.js";

const MAX_PARTICLES = 1600;
const MAX_DEBRIS = 260;
const MAX_SCORCH = 60;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomDirection() {
  const theta = Math.random() * Math.PI * 2;
  const y = Math.random() * 2 - 1;
  const radius = Math.sqrt(1 - y * y);
  return new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
}

// Sistema de particulas em Points com tamanho, cor e alpha por particula.
class ParticleField {
  constructor(scene, blending) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.alphas = new Float32Array(MAX_PARTICLES);
    this.items = [];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry = geometry;

    const material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending,
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        uniform float scale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(1.0, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, vAlpha * soft);
          #include <colorspace_fragment>
        }
      `,
    });
    this.material = material;
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  add(particle) {
    if (this.items.length >= MAX_PARTICLES) {
      this.items.shift();
    }
    this.items.push(particle);
  }

  update(dt) {
    const items = this.items;
    let write = 0;
    for (let index = 0; index < items.length; index += 1) {
      const particle = items[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        continue;
      }
      const damping = Math.max(0, 1 - particle.drag * dt);
      particle.velocity.multiplyScalar(damping);
      particle.velocity.y -= particle.gravity * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      if (particle.position.y < 0.2 && particle.velocity.y < 0) {
        particle.position.y = 0.2;
        particle.velocity.y *= -0.2;
      }
      particle.size += particle.grow * dt;
      items[write] = particle;
      write += 1;
    }
    items.length = write;

    for (let index = 0; index < write; index += 1) {
      const particle = items[index];
      const strength = particle.life / particle.maxLife;
      this.positions[index * 3] = particle.position.x;
      this.positions[index * 3 + 1] = particle.position.y;
      this.positions[index * 3 + 2] = particle.position.z;
      this.colors[index * 3] = particle.color.r;
      this.colors[index * 3 + 1] = particle.color.g;
      this.colors[index * 3 + 2] = particle.color.b;
      this.sizes[index] = particle.size;
      this.alphas[index] = particle.alpha * Math.min(1, strength * 1.6);
    }
    this.geometry.setDrawRange(0, write);
    ["position", "color", "size", "alpha"].forEach((name) => {
      this.geometry.attributes[name].needsUpdate = true;
    });
  }

  clear() {
    this.items.length = 0;
    this.geometry.setDrawRange(0, 0);
  }
}

// Efeitos visuais do cliente disparados pelos eventos do Game (explosoes, destrocos, fumaca, rastro...).
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.glow = new ParticleField(scene, THREE.AdditiveBlending);
    this.smoke = new ParticleField(scene, THREE.NormalBlending);

    this.debrisMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      MAX_DEBRIS,
    );
    this.debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DEBRIS * 3), 3);
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.count = 0;
    scene.add(this.debrisMesh);
    this.debris = [];

    this.fireballGeometry = new THREE.SphereGeometry(1, 20, 14);
    this.fireballs = [];
    this.ringGeometry = new THREE.RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2);
    this.rings = [];

    this.lights = [0, 1].map(() => {
      const light = new THREE.PointLight("#ffb35c", 0, 120, 1.6);
      scene.add(light);
      return { light, life: 0, maxLife: 1, power: 0 };
    });

    this.scorchTexture = this.createScorchTexture();
    this.scorchMarks = [];

    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.scaleVector = new THREE.Vector3();
    this.shake = 0;
    this.trailClock = 0;
    this.recoil = new Map();
    this.smokeClock = new Map();
    this.windDrift = new THREE.Vector3();
    this.ghosts = [];
  }

  createScorchTexture() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(10,8,6,0.95)");
    gradient.addColorStop(0.55, "rgba(20,16,12,0.7)");
    gradient.addColorStop(1, "rgba(20,16,12,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  getRecoil(playerId) {
    return this.recoil.get(playerId) ?? 0;
  }

  addShake(amount) {
    this.shake = Math.min(3.5, this.shake + amount);
  }

  reset() {
    this.glow.clear();
    this.smoke.clear();
    this.debris.length = 0;
    this.debrisMesh.count = 0;
    this.fireballs.forEach((entry) => this.scene.remove(entry.mesh));
    this.fireballs.length = 0;
    this.rings.forEach((entry) => this.scene.remove(entry.mesh));
    this.rings.length = 0;
    this.clearScorch();
    this.ghosts = [];
    this.lights.forEach((entry) => {
      entry.life = 0;
      entry.light.intensity = 0;
    });
    this.shake = 0;
    this.recoil.clear();
  }

  clearScorch() {
    this.scorchMarks.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.material.dispose();
    });
    this.scorchMarks.length = 0;
  }

  burst(origin, { count, colors, speed, life, size, gravity = 0, grow = 0, drag = 0, lift = 0, alpha = 1, glow = false, spread = 0 }) {
    const field = glow ? this.glow : this.smoke;
    for (let index = 0; index < count; index += 1) {
      const direction = randomDirection();
      const velocity = direction.multiplyScalar(speed * randomBetween(0.3, 1));
      velocity.y += lift;
      const particleLife = life * randomBetween(0.6, 1);
      const position = new THREE.Vector3(origin.x, origin.y, origin.z);
      if (spread) {
        position.add(randomDirection().multiplyScalar(spread * Math.random()));
      }
      field.add({
        position,
        velocity,
        life: particleLife,
        maxLife: particleLife,
        size: size * randomBetween(0.6, 1.3),
        color: new THREE.Color(colors[index % colors.length]),
        gravity,
        grow,
        drag,
        alpha,
      });
    }
  }

  flashLight(position, power, duration, color = "#ffb35c") {
    const entry = this.lights.reduce((best, item) => (item.life < best.life ? item : best), this.lights[0]);
    entry.light.position.set(position.x, position.y + 2, position.z);
    entry.light.color.set(color);
    entry.life = duration;
    entry.maxLife = duration;
    entry.power = power;
  }

  spawnFireball(position, radius) {
    const material = new THREE.MeshBasicMaterial({
      color: "#ffd27a",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.fireballGeometry, material);
    mesh.position.set(position.x, position.y, position.z);
    this.scene.add(mesh);
    this.fireballs.push({ mesh, life: 0.5, maxLife: 0.5, radius });
  }

  spawnRing(position, radius) {
    const material = new THREE.MeshBasicMaterial({
      color: "#ffe2a8",
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.ringGeometry, material);
    mesh.position.set(position.x, position.y + 0.3, position.z);
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 0.55, maxLife: 0.55, radius });
  }

  addScorch(position, radius) {
    if (this.scorchMarks.length >= MAX_SCORCH) {
      const old = this.scorchMarks.shift();
      this.scene.remove(old);
      old.material.dispose();
    }
    const material = new THREE.MeshBasicMaterial({
      map: this.scorchTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.4, radius * 2.4).rotateX(-Math.PI / 2), material);
    mesh.position.set(position.x, 0.08 + this.scorchMarks.length * 0.002, position.z);
    mesh.rotation.y = Math.random() * Math.PI;
    this.scene.add(mesh);
    this.scorchMarks.push(mesh);
  }

  // Voxels removidos pela cratera viram destrocos com fisica simples.
  spawnDebris(removed, center, buildingColors) {
    const sample = removed.length > 40 ? removed.filter(() => Math.random() < 40 / removed.length) : removed;
    sample.forEach((cell) => {
      if (this.debris.length >= MAX_DEBRIS) {
        this.debris.shift();
      }
      const outward = new THREE.Vector3(cell.x - center.x, cell.y - center.y, cell.z - center.z).normalize();
      const velocity = outward.multiplyScalar(randomBetween(12, 32)).add(new THREE.Vector3(0, randomBetween(8, 22), 0));
      const life = randomBetween(2.5, 4.5);
      this.debris.push({
        position: new THREE.Vector3(cell.x, cell.y, cell.z),
        velocity,
        spin: new THREE.Vector3(randomBetween(-8, 8), randomBetween(-8, 8), randomBetween(-8, 8)),
        rotation: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        size: randomBetween(0.6, 1.5),
        color: (buildingColors[cell.building] ?? new THREE.Color("#777777")).clone().multiplyScalar(randomBetween(0.5, 0.9)),
        life,
        maxLife: life,
        resting: false,
      });
    });
  }

  handleEvent(event, state, { sound, overlay }) {
    this.sound = sound ?? this.sound;
    const player = state.players.find((entry) => entry.id === event.playerId);
    const color = player?.color ?? "#ffffff";

    switch (event.type) {
      case "shot": {
        this.recoil.set(event.playerId, 1);
        this.burst(event, { count: 14, colors: ["#fff3c4", "#ffb347"], speed: 14, life: 0.3, size: 2.2, glow: true });
        this.burst(event, { count: 8, colors: ["#8a8a8a", "#6a6a6a"], speed: 5, life: 1.2, size: 3, grow: 3, alpha: 0.45, gravity: -2 });
        this.flashLight(event, 60, 0.15, "#ffd58a");
        this.addShake(0.35);
        sound?.shot(event.power);
        break;
      }
      case "shotFeedback":
        overlay?.showShotFeedback(event.text);
        break;
      case "target":
        sound?.tick(false);
        break;
      case "offmap":
        this.ghosts.push({
          ...event,
          color: event.weapon === "standard" ? color : WEAPONS[event.weapon]?.color ?? "#ffffff",
          age: 0,
        });
        break;
      case "split":
        this.burst(event, { count: 24, colors: ["#ffd166", "#ffb347", "#ffffff"], speed: 22, life: 0.45, size: 1.6, glow: true });
        this.flashLight(event, 120, 0.25, "#ffd166");
        sound?.shot(0.2);
        break;
      case "bounce":
        this.burst(event, { count: 14, colors: ["#86efac", "#ffffff"], speed: 16, life: 0.35, size: 1.2, glow: true });
        this.burst(event, { count: 6, colors: ["#8a8a8a"], speed: 6, life: 1, size: 2.5, grow: 2, alpha: 0.4 });
        sound?.land();
        break;
      case "weapon":
        sound?.tick(false);
        break;
      case "crateDrop":
        overlay?.showBanner("Caixa de suprimento!", { color: CRATES.types[event.type]?.color ?? "#fff", duration: 1.2, small: true });
        sound?.turn();
        break;
      case "cratePickup":
        this.burst({ x: event.x, y: event.y + 1.5, z: event.z }, {
          count: 26, colors: [CRATES.types[event.type]?.color ?? "#ffffff", "#ffffff"], speed: 12, life: 0.8, size: 1.6, glow: true, gravity: -6,
        });
        overlay?.addFloatingText(event.text, { x: event.x, y: event.y + 6, z: event.z }, {
          color: CRATES.types[event.type]?.color ?? "#ffffff", size: 20,
        });
        sound?.win();
        break;
      case "crateDestroyed":
        this.burst({ x: event.x, y: event.y + 1.3, z: event.z }, {
          count: 18, colors: ["#8a6a44", "#5c4630"], speed: 18, life: 1.2, size: 1.2, gravity: 30,
        });
        break;
      case "collapse":
        this.burst(event, {
          count: Math.min(40, 10 + Math.round(event.size / 60)), colors: ["#a39582", "#7d7466"],
          speed: 10, life: 2, size: 5, gravity: -1, grow: 3, drag: 1.4, alpha: 0.45, spread: 5,
        });
        if (event.size > 150) {
          overlay?.showBanner("Desabamento!", { color: "#fbbf24", duration: 1.3, small: true });
        }
        sound?.explosion();
        break;
      case "pushed":
        this.burst({ x: event.x, y: event.y + 0.6, z: event.z }, {
          count: Math.round(6 + event.strength), colors: ["#b9a58a", "#8f8170"], speed: 8, life: 1, size: 3, gravity: -1, grow: 2.5, drag: 2.5, alpha: 0.5, spread: 3,
        });
        break;
      case "explosion": {
        this.spawnFireball(event, event.radius * 0.75);
        this.spawnRing(event, event.radius * 1.6);
        this.flashLight(event, 420, 0.7);
        this.burst(event, {
          count: 46, colors: ["#fff1a8", "#ffb347", "#ff6b35"], speed: 34, life: 0.6, size: 3.2, gravity: 14, drag: 2, glow: true,
        });
        this.burst(event, {
          count: 26, colors: ["#ffd27a", "#ff8c42"], speed: 55, life: 0.9, size: 0.9, gravity: 30, glow: true,
        });
        this.burst(event, {
          count: 26, colors: ["#4b4b4b", "#3a3a3a", "#6d655c"], speed: 9, life: 3.2, size: 7, gravity: -3.5, grow: 5, drag: 1.2, alpha: 0.55, spread: 3,
        });
        if (event.y < 2.5) {
          this.addScorch(event, 6.5);
          this.burst({ x: event.x, y: 0.5, z: event.z }, {
            count: 18, colors: ["#9a8b74", "#776b5a"], speed: 18, life: 1.6, size: 4, gravity: -1, grow: 3, drag: 2.2, alpha: 0.5,
          });
        }
        this.addShake(event.radius / 8);
        sound?.explosion();
        break;
      }
      case "damage":
        overlay?.addFloatingText(`-${event.amount}`, { x: event.x, y: event.y + 9, z: event.z }, {
          color: "#ff6b6b",
          size: Math.round(18 + Math.min(event.amount, 45) / 2.5),
        });
        this.addShake(event.amount * 0.025);
        sound?.hit();
        break;
      case "destroyed":
        this.spawnFireball({ x: event.x, y: event.y + 3, z: event.z }, 9);
        this.flashLight({ x: event.x, y: event.y + 3, z: event.z }, 500, 1.1, "#ff9a4a");
        this.burst({ x: event.x, y: event.y + 3, z: event.z }, {
          count: 50, colors: ["#fff1a8", "#ffb347", "#ff6b35"], speed: 30, life: 0.9, size: 3.5, gravity: 6, drag: 1.5, glow: true,
        });
        this.addShake(2);
        sound?.explosion();
        break;
      case "land":
        if (event.distance > 3) {
          this.burst({ x: event.x, y: event.y + 0.5, z: event.z }, {
            count: 16, colors: ["#b9a58a", "#8f8170"], speed: 12, life: 1.1, size: 4, gravity: -1, grow: 2.5, drag: 2.5, alpha: 0.55, spread: 4,
          });
          this.addShake(0.6);
          sound?.land();
        }
        break;
      case "miss":
        sound?.miss();
        break;
      case "timeout":
        overlay?.showBanner("Tempo esgotado!", { color: "#ffd166", duration: 1.3 });
        sound?.timeout();
        break;
      case "turn":
        overlay?.showBanner(`Vez de ${event.label}`, { color, duration: 1.2, small: true });
        if (player?.feedback) {
          overlay?.showShotFeedback(player.feedback, 4);
        }
        sound?.turn();
        break;
      case "roundStart":
        this.reset();
        overlay?.showBanner(`Rodada ${event.round}`, {
          duration: event.label ? 2.4 : 1.8,
          subtitle: [event.label ? `${event.label}: ${event.description}` : "", event.density ? `Cidade ${event.density}` : ""]
            .filter(Boolean).join(" · "),
        });
        break;
      case "roundEnd":
        overlay?.showBanner(event.label ? `${event.label} venceu a rodada!` : "Empate!", { color, duration: 2.5 });
        sound?.win();
        break;
      case "matchEnd":
        overlay?.showBanner(`${event.label} venceu a partida!`, {
          color,
          duration: 7,
          subtitle: "Nova partida em instantes. B reinicia agora.",
        });
        sound?.fanfare();
        break;
      default:
        break;
    }
  }

  update(dt, state) {
    if (state) {
      this.windDrift.set(state.wind.x * 3, 0, state.wind.z * 3);
    }
    this.smoke.items.forEach((particle) => {
      particle.position.addScaledVector(this.windDrift, dt * 0.4);
    });
    this.updateGhosts(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.updateDebris(dt);

    this.fireballs = this.fireballs.filter((entry) => {
      entry.life -= dt;
      if (entry.life <= 0) {
        this.scene.remove(entry.mesh);
        entry.mesh.material.dispose();
        return false;
      }
      const progress = 1 - entry.life / entry.maxLife;
      entry.mesh.scale.setScalar(entry.radius * (0.35 + 0.65 * Math.sqrt(progress)));
      entry.mesh.material.opacity = (1 - progress) * 0.85;
      entry.mesh.material.color.setRGB(1, 0.72 - progress * 0.4, 0.32 - progress * 0.28);
      return true;
    });

    this.rings = this.rings.filter((entry) => {
      entry.life -= dt;
      if (entry.life <= 0) {
        this.scene.remove(entry.mesh);
        entry.mesh.material.dispose();
        return false;
      }
      const progress = 1 - entry.life / entry.maxLife;
      entry.mesh.scale.setScalar(entry.radius * (0.2 + progress));
      entry.mesh.material.opacity = (1 - progress) * 0.55;
      return true;
    });

    this.lights.forEach((entry) => {
      entry.life = Math.max(0, entry.life - dt);
      const strength = entry.maxLife ? entry.life / entry.maxLife : 0;
      entry.light.intensity = entry.power * strength * strength;
    });

    this.recoil.forEach((value, playerId) => {
      this.recoil.set(playerId, Math.max(0, value - dt * 3.5));
    });

    this.shake *= Math.pow(0.02, dt);
    if (this.shake < 0.02) {
      this.shake = 0;
    }

    if (!state) {
      return;
    }
    this.emitDamageSmoke(dt, state);
    this.emitTrail(dt, state);
  }

  // Tiros que sairam do mapa seguem a trajetoria ate cair no mar (respingo) ou nos bairros (poeira).
  updateGhosts(dt) {
    this.ghosts = this.ghosts.filter((ghost) => {
      ghost.age += dt;
      ghost.elapsed += dt * TIME_SCALE;
      const point = projectileAt(ghost.origin, ghost.velocity, ghost.wind, ghost.elapsed, ghost.gravity);
      this.burst(point, { count: 1, colors: [ghost.color], speed: 0.3, life: 0.6, size: 2.2, glow: true, alpha: 0.9 });
      const water = isWater(point.x, point.z);
      const surface = water ? WATER_LEVEL : -0.6;
      if (point.y > surface && ghost.age < 9 && Math.abs(point.x) < 1500 && Math.abs(point.z) < 1500) {
        return true;
      }
      if (point.y <= surface) {
        this.splash({ x: point.x, y: surface, z: point.z }, water);
      }
      return false;
    });
  }

  splash(point, water) {
    if (water) {
      this.burst(point, { count: 34, colors: ["#e6f4ff", "#bfe3f5", "#ffffff"], speed: 9, life: 1.2, size: 1.4, gravity: 22, lift: 16, alpha: 0.9 });
      this.burst(point, { count: 10, colors: ["#d6ecf7"], speed: 4, life: 1.6, size: 4, grow: 3, alpha: 0.35, gravity: -1 });
      this.spawnRing({ x: point.x, y: point.y - 0.2, z: point.z }, 9);
      this.sound?.land();
    } else {
      this.spawnFireball({ x: point.x, y: point.y + 1, z: point.z }, 5);
      this.burst(point, { count: 16, colors: ["#9a8b74", "#776b5a"], speed: 10, life: 1.8, size: 5, gravity: -1, grow: 3, drag: 2, alpha: 0.5 });
    }
  }

  updateDebris(dt) {
    const matrix = this.matrix;
    let write = 0;
    for (const piece of this.debris) {
      piece.life -= dt;
      if (piece.life <= 0) {
        continue;
      }
      if (!piece.resting) {
        piece.velocity.y -= 40 * dt;
        piece.position.addScaledVector(piece.velocity, dt);
        piece.rotation.x += piece.spin.x * dt;
        piece.rotation.y += piece.spin.y * dt;
        piece.rotation.z += piece.spin.z * dt;
        if (piece.position.y < piece.size / 2) {
          piece.position.y = piece.size / 2;
          piece.velocity.y *= -0.3;
          piece.velocity.x *= 0.5;
          piece.velocity.z *= 0.5;
          piece.spin.multiplyScalar(0.5);
          if (Math.abs(piece.velocity.y) < 2) {
            piece.resting = true;
          }
        }
      }
      const shrink = Math.min(1, piece.life / 0.6);
      this.quaternion.setFromEuler(piece.rotation);
      this.scaleVector.setScalar(piece.size * shrink);
      matrix.compose(piece.position, this.quaternion, this.scaleVector);
      this.debrisMesh.setMatrixAt(write, matrix);
      this.debrisMesh.setColorAt(write, piece.color);
      this.debris[write] = piece;
      write += 1;
    }
    this.debris.length = write;
    this.debrisMesh.count = write;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    this.debrisMesh.instanceColor.needsUpdate = true;
  }

  emitDamageSmoke(dt, state) {
    state.players.forEach((player) => {
      if (player.hp >= 50) {
        return;
      }
      const interval = player.hp <= 0 ? 0.05 : player.hp < 25 ? 0.1 : 0.2;
      const clock = (this.smokeClock.get(player.id) ?? 0) + dt;
      if (clock < interval) {
        this.smokeClock.set(player.id, clock);
        return;
      }
      this.smokeClock.set(player.id, 0);
      const origin = {
        x: player.position.x + randomBetween(-1.5, 1.5),
        y: player.position.y + 5,
        z: player.position.z + randomBetween(-1.5, 1.5),
      };
      this.burst(origin, { count: 1, colors: ["#2e2e2e", "#4a4a4a"], speed: 1.5, life: 2.4, size: 3.5, gravity: -5, grow: 3.5, alpha: 0.6 });
      if (player.hp < 25) {
        this.burst(origin, { count: 1, colors: ["#ff8c42", "#ffd166"], speed: 2, life: 0.5, size: 2.2, gravity: -8, glow: true });
      }
    });
  }

  emitTrail(dt, state) {
    if (!state.projectiles.length) {
      return;
    }
    this.trailClock += dt;
    if (this.trailClock < 0.016) {
      return;
    }
    this.trailClock = 0;
    state.projectiles.forEach((projectile) => {
      const owner = state.players.find((player) => player.id === projectile.ownerId);
      const color = projectile.weapon === "standard" ? owner?.color ?? "#ffffff" : WEAPONS[projectile.weapon]?.color ?? "#ffffff";
      const size = projectile.weapon === "bomblet" ? 1.3 : projectile.weapon === "heavy" ? 3 : 2.2;
      this.burst(projectile.position, { count: 1, colors: [color], speed: 0.3, life: 0.7, size, glow: true, alpha: 0.9 });
      this.burst(projectile.position, { count: 1, colors: ["#bdbdbd"], speed: 0.6, life: 1.6, size: size * 0.7, grow: 2.2, alpha: 0.3, gravity: -0.5 });
    });
  }

  resize(height) {
    const scale = height * 0.75;
    this.glow.material.uniforms.scale.value = scale;
    this.smoke.material.uniforms.scale.value = scale;
  }
}
