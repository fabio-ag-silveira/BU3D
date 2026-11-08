import { BUILDING_HALF, BUILDING_TYPES, CITY_LAYOUT, GRID, VOXEL_SIZE } from "./config.js";

const { originX, originZ, sizeX, sizeY, sizeZ } = GRID;
const CELL_COUNT = sizeX * sizeY * sizeZ;

// Predios do legado convertidos para faixas de celulas da grade.
export const BUILDINGS = CITY_LAYOUT.map((entry, index) => {
  const height = BUILDING_TYPES[entry.type].height;
  return {
    id: index + 1,
    type: entry.type,
    x: entry.x,
    z: entry.z,
    height,
    minIx: Math.round((entry.x - BUILDING_HALF - originX) / VOXEL_SIZE),
    maxIx: Math.round((entry.x + BUILDING_HALF - originX) / VOXEL_SIZE) - 1,
    minIz: Math.round((entry.z - BUILDING_HALF - originZ) / VOXEL_SIZE),
    maxIz: Math.round((entry.z + BUILDING_HALF - originZ) / VOXEL_SIZE) - 1,
    layers: Math.round(height / VOXEL_SIZE),
  };
});

export function cellIndex(ix, iy, iz) {
  return (iy * sizeZ + iz) * sizeX + ix;
}

export function cellCoords(index) {
  const ix = index % sizeX;
  const rest = (index - ix) / sizeX;
  const iz = rest % sizeZ;
  const iy = (rest - iz) / sizeZ;
  return { ix, iy, iz };
}

export function cellCenter(ix, iy, iz) {
  return {
    x: originX + (ix + 0.5) * VOXEL_SIZE,
    y: (iy + 0.5) * VOXEL_SIZE,
    z: originZ + (iz + 0.5) * VOXEL_SIZE,
  };
}

function buildBaseCells() {
  const cells = new Uint8Array(CELL_COUNT);
  BUILDINGS.forEach((building) => {
    for (let iy = 0; iy < building.layers; iy += 1) {
      for (let iz = building.minIz; iz <= building.maxIz; iz += 1) {
        for (let ix = building.minIx; ix <= building.maxIx; ix += 1) {
          cells[cellIndex(ix, iy, iz)] = building.id;
        }
      }
    }
  });
  return cells;
}

const BASE_CELLS = buildBaseCells();

// Cidade feita de voxels: cada cratera apaga as celulas dentro da esfera.
// O estado e derivado so da lista de crateras, entao cliente LAN e servidor chegam ao mesmo resultado.
export class VoxelWorld {
  constructor() {
    this.cells = new Uint8Array(CELL_COUNT);
    this.applied = [];
    this.version = 0;
    this.reset();
  }

  reset() {
    this.cells.set(BASE_CELLS);
    this.applied = [];
    this.version += 1;
  }

  buildingAtCell(ix, iy, iz) {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= sizeX || iy >= sizeY || iz >= sizeZ) {
      return 0;
    }
    return this.cells[cellIndex(ix, iy, iz)];
  }

  isBuildingSolid(point) {
    const ix = Math.floor((point.x - originX) / VOXEL_SIZE);
    const iy = Math.floor(point.y / VOXEL_SIZE);
    const iz = Math.floor((point.z - originZ) / VOXEL_SIZE);
    return this.buildingAtCell(ix, iy, iz) !== 0;
  }

  // O chao (y <= 0) e indestrutivel.
  isSolid(point) {
    return point.y <= 0 || this.isBuildingSolid(point);
  }

  // Remove as celulas dentro da cratera e devolve os centros removidos (para os destrocos).
  carve(crater) {
    const removed = [];
    const reach = crater.r + VOXEL_SIZE;
    const minIx = Math.max(0, Math.floor((crater.x - reach - originX) / VOXEL_SIZE));
    const maxIx = Math.min(sizeX - 1, Math.floor((crater.x + reach - originX) / VOXEL_SIZE));
    const minIy = Math.max(0, Math.floor((crater.y - reach) / VOXEL_SIZE));
    const maxIy = Math.min(sizeY - 1, Math.floor((crater.y + reach) / VOXEL_SIZE));
    const minIz = Math.max(0, Math.floor((crater.z - reach - originZ) / VOXEL_SIZE));
    const maxIz = Math.min(sizeZ - 1, Math.floor((crater.z + reach - originZ) / VOXEL_SIZE));
    const radiusSq = crater.r * crater.r;

    for (let iy = minIy; iy <= maxIy; iy += 1) {
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        for (let ix = minIx; ix <= maxIx; ix += 1) {
          const index = cellIndex(ix, iy, iz);
          const building = this.cells[index];
          if (!building) {
            continue;
          }
          const center = cellCenter(ix, iy, iz);
          const dx = center.x - crater.x;
          const dy = center.y - crater.y;
          const dz = center.z - crater.z;
          if (dx * dx + dy * dy + dz * dz <= radiusSq) {
            this.cells[index] = 0;
            removed.push({ ...center, building });
          }
        }
      }
    }
    return removed;
  }

  // Sincroniza com a lista de crateras do snapshot. Retorna as celulas removidas agora.
  sync(craters) {
    const applied = this.applied;
    const consistent = applied.length <= craters.length &&
      (applied.length === 0 || applied[applied.length - 1] === craters[applied.length - 1].id);

    if (!consistent) {
      this.reset();
    }
    if (this.applied.length === craters.length) {
      return [];
    }

    const removed = [];
    for (let index = this.applied.length; index < craters.length; index += 1) {
      removed.push(...this.carve(craters[index]));
      this.applied.push(craters[index].id);
    }
    this.version += 1;
    return removed;
  }
}
