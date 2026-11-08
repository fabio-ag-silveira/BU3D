import * as THREE from "three";
import { ARENA, BUILDING_HALF, CITY_LAYOUT, GRID, VOXEL_SIZE } from "../config.js";
import { BUILDINGS, cellCenter } from "../world.js";

const WINDOW_SLOTS = new Set([1, 2, 5, 6]);
const DOOR_SLOTS = new Set([3, 4]);
const STREET_LINES_X = [-90, -45, -15, 15];
const STREET_LINES_Z = [0, 30, 60, 90, 120, 152];

function hash(index, seed) {
  let value = (index + 1) * 2654435761 ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

const TOTAL_VOXELS = BUILDINGS.reduce(
  (sum, building) => sum + building.layers * (building.maxIx - building.minIx + 1) * (building.maxIz - building.minIz + 1),
  0,
);

// Predios renderizados como voxels instanciados. So as celulas com face exposta viram instancias.
export class CityMesh {
  constructor(scene) {
    const geometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    this.walls = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.05 }),
      TOTAL_VOXELS,
    );
    this.walls.castShadow = true;
    this.walls.receiveShadow = true;
    this.lit = new THREE.InstancedMesh(
      new THREE.BoxGeometry(VOXEL_SIZE * 1.002, VOXEL_SIZE * 0.82, VOXEL_SIZE * 1.002),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      Math.ceil(TOTAL_VOXELS / 3),
    );
    [this.walls, this.lit].forEach((mesh) => {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
    });
    this.version = -1;
    this.themeId = null;
    this.matrix = new THREE.Matrix4();
    this.color = new THREE.Color();
    this.scorch = new THREE.Color("#1a1512");
  }

  rebuild(world, theme, seed, craters) {
    const walls = this.walls;
    const lit = this.lit;
    const matrix = this.matrix;
    const color = this.color;
    const baseColors = {
      small: new THREE.Color(theme.buildings.small),
      medium: new THREE.Color(theme.buildings.medium),
      tall: new THREE.Color(theme.buildings.tall),
    };
    const roof = new THREE.Color(theme.roof);
    const windowDark = new THREE.Color(theme.windowDark);
    const windowLit = new THREE.Color(theme.windowLit);
    const door = new THREE.Color("#2a2420");
    let wallCount = 0;
    let litCount = 0;

    BUILDINGS.forEach((building) => {
      const base = baseColors[building.type];
      for (let iy = 0; iy < building.layers; iy += 1) {
        for (let iz = building.minIz; iz <= building.maxIz; iz += 1) {
          for (let ix = building.minIx; ix <= building.maxIx; ix += 1) {
            if (!world.buildingAtCell(ix, iy, iz)) {
              continue;
            }
            const exposed =
              !world.buildingAtCell(ix + 1, iy, iz) || !world.buildingAtCell(ix - 1, iy, iz) ||
              !world.buildingAtCell(ix, iy + 1, iz) || (iy > 0 && !world.buildingAtCell(ix, iy - 1, iz)) ||
              !world.buildingAtCell(ix, iy, iz + 1) || !world.buildingAtCell(ix, iy, iz - 1);
            if (!exposed) {
              continue;
            }

            const center = cellCenter(ix, iy, iz);
            const cellId = ix + iz * GRID.sizeX + iy * GRID.sizeX * GRID.sizeZ;
            const onX = ix === building.minIx || ix === building.maxIx;
            const onZ = iz === building.minIz || iz === building.maxIz;
            const slot = onX && !onZ ? iz - building.minIz : onZ && !onX ? ix - building.minIx : -1;
            const isRoof = iy === building.layers - 1;
            const isWindow = slot >= 0 && !isRoof && iy > 0 && iy % 2 === 1 && WINDOW_SLOTS.has(slot);
            const isDoor = slot >= 0 && iy === 0 && DOOR_SLOTS.has(slot);
            const noise = hash(cellId, seed);

            if (isWindow && noise < theme.litChance) {
              color.copy(windowLit).multiplyScalar(0.85 + 0.15 * hash(cellId, seed + 17));
              matrix.makeTranslation(center.x, center.y, center.z);
              lit.setMatrixAt(litCount, matrix);
              lit.setColorAt(litCount, color);
              litCount += 1;
              continue;
            }

            if (isWindow) {
              color.copy(windowDark);
            } else if (isDoor) {
              color.copy(door);
            } else if (isRoof) {
              color.copy(roof).multiplyScalar(0.92 + noise * 0.12);
            } else {
              color.copy(base).multiplyScalar(0.9 + noise * 0.16);
            }

            for (const crater of craters) {
              const distance = Math.hypot(center.x - crater.x, center.y - crater.y, center.z - crater.z);
              if (distance < crater.r + 2.8) {
                color.lerp(this.scorch, 0.75 * (1 - Math.max(0, distance - crater.r) / 2.8));
              }
            }

            matrix.makeTranslation(center.x, center.y, center.z);
            walls.setMatrixAt(wallCount, matrix);
            walls.setColorAt(wallCount, color);
            wallCount += 1;
          }
        }
      }
    });

    walls.count = wallCount;
    lit.count = litCount;
    walls.instanceMatrix.needsUpdate = true;
    lit.instanceMatrix.needsUpdate = true;
    walls.instanceColor.needsUpdate = true;
    lit.instanceColor.needsUpdate = true;
    this.version = world.version;
  }
}

// Chao: asfalto, calcadas em volta de cada quarteirao, faixas e a mureta da arena.
export class Ground {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const width = ARENA.maxX - ARENA.minX;
    const depth = ARENA.maxZ - ARENA.minZ;
    const centerX = (ARENA.minX + ARENA.maxX) / 2;
    const centerZ = (ARENA.minZ + ARENA.maxZ) / 2;

    this.outerMaterial = new THREE.MeshStandardMaterial({ roughness: 1 });
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), this.outerMaterial);
    outer.position.set(centerX, -0.6, centerZ);
    outer.receiveShadow = true;
    this.group.add(outer);

    this.streetMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const street = new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2), this.streetMaterial);
    street.position.set(centerX, 0, centerZ);
    street.receiveShadow = true;
    this.group.add(street);

    this.sidewalkMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const sidewalkGeometry = new THREE.BoxGeometry(BUILDING_HALF * 2 + 4, 0.3, BUILDING_HALF * 2 + 4);
    const sidewalks = new THREE.InstancedMesh(sidewalkGeometry, this.sidewalkMaterial, CITY_LAYOUT.length);
    const matrix = new THREE.Matrix4();
    CITY_LAYOUT.forEach((building, index) => {
      matrix.makeTranslation(building.x, 0.15, building.z);
      sidewalks.setMatrixAt(index, matrix);
    });
    sidewalks.receiveShadow = true;
    this.group.add(sidewalks);

    this.laneMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 });
    const dashes = [];
    STREET_LINES_X.forEach((x) => {
      for (let z = ARENA.minZ + 4; z < ARENA.maxZ - 4; z += 8) {
        dashes.push({ x, z, rotate: false });
      }
    });
    STREET_LINES_Z.forEach((z) => {
      for (let x = ARENA.minX + 4; x < ARENA.maxX - 4; x += 8) {
        dashes.push({ x, z, rotate: true });
      }
    });
    const dashGeometry = new THREE.PlaneGeometry(0.5, 3.6).rotateX(-Math.PI / 2);
    const lanes = new THREE.InstancedMesh(dashGeometry, this.laneMaterial, dashes.length);
    const rotation = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    dashes.forEach((dash, index) => {
      matrix.makeTranslation(dash.x, 0.04, dash.z);
      if (dash.rotate) {
        matrix.multiply(rotation);
      }
      lanes.setMatrixAt(index, matrix);
    });
    this.group.add(lanes);

    this.wallMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const wallHeight = 1.6;
    const thickness = 1.2;
    [
      { x: centerX, z: ARENA.minZ - thickness / 2, w: width + thickness * 2, d: thickness },
      { x: centerX, z: ARENA.maxZ + thickness / 2, w: width + thickness * 2, d: thickness },
      { x: ARENA.minX - thickness / 2, z: centerZ, w: thickness, d: depth },
      { x: ARENA.maxX + thickness / 2, z: centerZ, w: thickness, d: depth },
    ].forEach((segment) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(segment.w, wallHeight, segment.d), this.wallMaterial);
      wall.position.set(segment.x, wallHeight / 2 - 0.3, segment.z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.group.add(wall);
    });
  }

  applyTheme(theme) {
    this.streetMaterial.color.set(theme.street);
    this.sidewalkMaterial.color.set(theme.sidewalk);
    this.laneMaterial.color.set(theme.lane);
    this.wallMaterial.color.set(theme.sidewalk);
    this.outerMaterial.color.set(theme.street).multiplyScalar(0.7);
  }
}
