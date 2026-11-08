import * as THREE from "three";
import { SKY_THEMES } from "../config.js";
import { getMuzzle, getLaunchVelocity, powerToVelocity, projectileAt } from "../physics.js";
import { VoxelWorld, BUILDINGS } from "../world.js";
import { Sky, ARENA_CENTER } from "./sky.js";
import { CityMesh, Ground } from "./city.js";
import { TankModel } from "./tank.js";
import { Effects } from "./effects.js";
import { CameraRig } from "./camera.js";

const GUIDE_POINTS = 26;
const NO_WIND = { x: 0, z: 0 };

// Cena 3D: monta ceu, cidade de voxels, carrinhos, projetil, guia de mira, efeitos e cameras.
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    // Celulares: menos pixels e sombra menor para manter o FPS.
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2("#b9d6e3", 0.003);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.5, 2200);

    this.hemisphere = new THREE.HemisphereLight("#ffffff", "#444444", 1);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight("#ffffff", 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 700 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.target.position.copy(ARENA_CENTER);
    this.scene.add(this.sun, this.sun.target);

    this.sky = new Sky(this.scene);
    this.ground = new Ground(this.scene);
    this.city = new CityMesh(this.scene);
    this.world = new VoxelWorld();
    this.effects = new Effects(this.scene);
    this.rig = new CameraRig(this.camera, canvas);
    this.tanks = new Map();
    this.cloudOffset = new THREE.Vector3();
    this.themeKey = null;
    this.buildingColors = {};

    this.createProjectile();
    this.createGuide();
    this.resize();
  }

  createProjectile() {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 16, 12),
      new THREE.MeshStandardMaterial({ color: "#2b2b2b", roughness: 0.3, metalness: 0.8 }),
    );
    shell.castShadow = true;
    group.add(shell);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.3, "rgba(255,255,255,0.6)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.projectileGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    }));
    this.projectileGlow.scale.setScalar(6);
    group.add(this.projectileGlow);
    this.projectileLight = new THREE.PointLight("#ffd27a", 40, 45, 1.5);
    group.add(this.projectileLight);
    group.visible = false;
    this.projectile = group;
    this.scene.add(group);
  }

  createGuide() {
    this.guidePositions = new Float32Array(GUIDE_POINTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.guidePositions, 3).setUsage(THREE.DynamicDrawUsage));
    const dot = document.createElement("canvas");
    dot.width = 32;
    dot.height = 32;
    const context = dot.getContext("2d");
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(16, 16, 13, 0, Math.PI * 2);
    context.fill();
    this.guide = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(dot),
      alphaTest: 0.5,
      size: 0.75,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    }));
    this.guide.frustumCulled = false;
    this.scene.add(this.guide);
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (width === this.width && height === this.height) {
      return;
    }
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.effects.resize(height);
  }

  applyTheme(theme) {
    const sunDirection = new THREE.Vector3(...theme.sun.position).normalize();
    this.sky.applyTheme(theme, sunDirection);
    this.ground.applyTheme(theme);
    this.scene.fog.color.set(theme.fog);
    this.scene.fog.density = theme.fogDensity;
    this.hemisphere.color.set(theme.ambient.sky);
    this.hemisphere.groundColor.set(theme.ambient.ground);
    this.hemisphere.intensity = theme.ambient.intensity;
    this.sun.color.set(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;
    this.sun.position.copy(ARENA_CENTER).addScaledVector(sunDirection, 320);
    this.renderer.toneMappingExposure = theme.exposure;
    this.buildingColors = Object.fromEntries(BUILDINGS.map((building) => [
      building.id,
      new THREE.Color(theme.buildings[building.type]),
    ]));
  }

  syncWorld(state) {
    const theme = SKY_THEMES[state.theme] ?? SKY_THEMES.day;
    const themeKey = `${state.theme}:${state.seed}`;
    const themeChanged = themeKey !== this.themeKey;
    if (themeChanged) {
      this.themeKey = themeKey;
      this.applyTheme(theme);
    }

    const removed = this.world.sync(state.craters);
    if (removed.length && state.craters.length) {
      this.effects.spawnDebris(removed, state.craters[state.craters.length - 1], this.buildingColors);
    }
    if (themeChanged || this.world.version !== this.city.version) {
      this.city.rebuild(this.world, theme, state.seed, state.craters);
    }
  }

  updateTanks(state, dt, time) {
    state.players.forEach((player, index) => {
      let tank = this.tanks.get(player.id);
      if (!tank) {
        tank = new TankModel(this.scene, player);
        this.tanks.set(player.id, tank);
      }
      tank.update(player, {
        isTurn: state.phase === "aiming" && index === state.turnIndex,
        recoil: this.effects.getRecoil(player.id),
        time,
        dt,
      });
    });
  }

  updateGuide(state) {
    const player = state.players[state.turnIndex];
    const visible = state.phase === "aiming" && !player.falling;
    this.guide.visible = visible;
    if (!visible) {
      return;
    }
    const power = state.charge.active ? state.charge.power : player.lastPower ?? 0.5;
    const origin = getMuzzle(player.position, player.yaw, player.elevation);
    const velocity = getLaunchVelocity(player.yaw, player.elevation, powerToVelocity(power));
    let count = 0;
    for (let index = 0; index < GUIDE_POINTS; index += 1) {
      const point = projectileAt(origin, velocity, NO_WIND, index * 0.05 + 0.02);
      if (this.world.isSolid(point)) {
        break;
      }
      this.guidePositions[index * 3] = point.x;
      this.guidePositions[index * 3 + 1] = point.y;
      this.guidePositions[index * 3 + 2] = point.z;
      count += 1;
    }
    this.guide.geometry.setDrawRange(0, count);
    this.guide.geometry.attributes.position.needsUpdate = true;
    this.guide.material.color.set(state.charge.active ? "#ffffff" : player.color);
  }

  updateProjectile(state) {
    const projectile = state.projectile;
    this.projectile.visible = Boolean(projectile);
    if (!projectile) {
      return null;
    }
    this.projectile.position.set(projectile.position.x, projectile.position.y, projectile.position.z);
    const owner = state.players.find((player) => player.id === projectile.ownerId);
    this.projectileGlow.material.color.set(owner?.color ?? "#ffffff");
    return this.projectile.position;
  }

  handleEvent(event, state, context) {
    this.effects.handleEvent(event, state, context);
  }

  render(state, dt, time) {
    this.resize();
    this.syncWorld(state);
    this.updateTanks(state, dt, time);
    this.updateGuide(state);
    const projectilePosition = this.updateProjectile(state);

    this.effects.update(dt, state, projectilePosition);
    this.rig.update(state, dt, { projectilePosition, shake: this.effects.shake, world: this.world });

    this.cloudOffset.x += (2 + state.wind.x * 9) * dt;
    this.cloudOffset.z += (1 + state.wind.z * 9) * dt;
    this.sky.update(this.camera.position, this.cloudOffset);

    this.renderer.render(this.scene, this.camera);
  }

  // Converte um ponto do mundo para pixels do canvas (null se estiver atras da camera).
  project(point) {
    const vector = new THREE.Vector3(point.x, point.y, point.z).project(this.camera);
    if (vector.z > 1) {
      return null;
    }
    return { x: (vector.x * 0.5 + 0.5) * this.width, y: (-vector.y * 0.5 + 0.5) * this.height };
  }
}
