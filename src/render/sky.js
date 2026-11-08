import * as THREE from "three";
import { ARENA } from "../config.js";
import { createRng } from "../math.js";

export const ARENA_CENTER = new THREE.Vector3((ARENA.minX + ARENA.maxX) / 2, 0, (ARENA.minZ + ARENA.maxZ) / 2);
const SKY_RADIUS = 900;
const CLOUD_COUNT = 12;
const CLOUD_RANGE = 420;

function glowTexture(inner, outer) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.25, inner);
  gradient.addColorStop(0.32, outer);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Ceu em gradiente, sol/lua, estrelas, nuvens que seguem o vento e um skyline distante.
export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      top: { value: new THREE.Color() },
      middle: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `
          varying vec3 vDirection;
          void main() {
            vDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 middle;
          uniform vec3 horizon;
          varying vec3 vDirection;
          void main() {
            float h = clamp(vDirection.y, -1.0, 1.0);
            vec3 color = h > 0.18
              ? mix(middle, top, smoothstep(0.18, 0.85, h))
              : mix(horizon, middle, smoothstep(-0.05, 0.18, h));
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome = dome;
    scene.add(dome);

    this.sunTexture = glowTexture("rgba(255,250,230,1)", "rgba(255,220,150,0.35)");
    this.moonTexture = glowTexture("rgba(245,242,225,1)", "rgba(170,190,255,0.22)");
    this.body = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sunTexture, fog: false, depthWrite: false }));
    this.body.scale.setScalar(150);
    scene.add(this.body);

    this.stars = this.createStars();
    scene.add(this.stars);

    this.clouds = this.createClouds();
    this.clouds.forEach((cloud) => scene.add(cloud));

    this.skyline = this.createSkyline();
    scene.add(this.skyline);
  }

  createStars() {
    const rng = createRng(7);
    const count = 1400;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const theta = rng() * Math.PI * 2;
      const y = 0.08 + rng() * 0.92;
      const radius = Math.sqrt(1 - y * y);
      positions[index * 3] = Math.cos(theta) * radius * (SKY_RADIUS - 20);
      positions[index * 3 + 1] = y * (SKY_RADIUS - 20);
      positions[index * 3 + 2] = Math.sin(theta) * radius * (SKY_RADIUS - 20);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: "#ffffff",
      size: 2.2,
      sizeAttenuation: false,
      fog: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }));
    stars.frustumCulled = false;
    return stars;
  }

  createClouds() {
    const rng = createRng(11);
    const puff = new THREE.SphereGeometry(1, 12, 8);
    this.cloudMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false });
    const clouds = [];
    for (let index = 0; index < CLOUD_COUNT; index += 1) {
      const group = new THREE.Group();
      const puffs = 4 + Math.floor(rng() * 4);
      for (let p = 0; p < puffs; p += 1) {
        const mesh = new THREE.Mesh(puff, this.cloudMaterial);
        const size = 9 + rng() * 10;
        mesh.scale.set(size * 1.6, size * 0.75, size);
        mesh.position.set((p - puffs / 2) * 11 + rng() * 6, rng() * 5, rng() * 10 - 5);
        group.add(mesh);
      }
      group.userData.base = new THREE.Vector3(
        (rng() * 2 - 1) * CLOUD_RANGE,
        115 + rng() * 55,
        (rng() * 2 - 1) * CLOUD_RANGE,
      );
      group.rotation.y = rng() * Math.PI;
      clouds.push(group);
    }
    return clouds;
  }

  createSkyline() {
    const rng = createRng(23);
    const count = 90;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({ color: "#ffffff" }),
      count,
    );
    const matrix = new THREE.Matrix4();
    let placed = 0;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + rng() * 0.05;
      const distance = 390 + rng() * 110;
      const width = 16 + rng() * 24;
      const height = 25 + rng() * 80;
      // Do lado da baia o horizonte e o skyline da outra margem (em surroundings.js).
      if (ARENA_CENTER.z + Math.sin(angle) * distance > 180) {
        continue;
      }
      matrix.compose(
        new THREE.Vector3(ARENA_CENTER.x + Math.cos(angle) * distance, -0.5, ARENA_CENTER.z + Math.sin(angle) * distance),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle),
        new THREE.Vector3(width, height, width * (0.7 + rng() * 0.6)),
      );
      mesh.setMatrixAt(placed, matrix);
      placed += 1;
    }
    mesh.count = placed;
    return mesh;
  }

  applyTheme(theme, sunDirection) {
    this.uniforms.top.value.set(theme.sky[0]);
    this.uniforms.middle.value.set(theme.sky[1]);
    this.uniforms.horizon.value.set(theme.sky[2]);
    this.body.material.map = theme.body.kind === "moon" ? this.moonTexture : this.sunTexture;
    this.body.material.color.set(theme.body.color);
    this.body.material.needsUpdate = true;
    this.body.scale.setScalar(theme.body.kind === "moon" ? 110 : 170);
    this.sunDirection = sunDirection.clone().normalize();
    this.stars.visible = theme.stars;
    this.cloudMaterial.color.set(theme.cloud);
    this.cloudMaterial.opacity = theme.cloudOpacity;
    this.skyline.material.color.set(theme.distant);
  }

  update(cameraPosition, cloudOffset) {
    this.dome.position.copy(cameraPosition);
    this.stars.position.copy(cameraPosition);
    if (this.sunDirection) {
      this.body.position.copy(this.sunDirection).multiplyScalar(SKY_RADIUS * 0.8).add(cameraPosition);
    }

    const span = CLOUD_RANGE * 2;
    this.clouds.forEach((cloud) => {
      const base = cloud.userData.base;
      const wrap = (value) => ((((value + CLOUD_RANGE) % span) + span) % span) - CLOUD_RANGE;
      cloud.position.set(
        ARENA_CENTER.x + wrap(base.x + cloudOffset.x),
        base.y,
        ARENA_CENTER.z + wrap(base.z + cloudOffset.z),
      );
    });
  }
}
