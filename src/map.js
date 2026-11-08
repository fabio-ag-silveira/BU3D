import { BUILDING_HALF, BUILDING_TYPES, CITY_LAYOUT, GRID, PLAYER_DEFAULTS, VOXEL_SIZE } from "./config.js";
import { createRng } from "./math.js";

const { originX, originZ, sizeX, sizeY, sizeZ } = GRID;
const CELL_COUNT = sizeX * sizeY * sizeZ;

// Materiais que nao sao predios (predios usam ids 1..200).
export const MATERIALS = {
  earth: 250,
  rock: 251,
  grass: 252,
  concrete: 253,
  bridge: 254,
};

export const MAP_KINDS = {
  dynamic: { id: "dynamic", label: "Dinâmico" },
  classic: { id: "classic", label: "Clássico" },
};

// Malha de quarteiroes do legado: colunas e linhas espacadas de 30.
const COLUMNS = [-120, -90, -60, -30, 0, 30];
const ROWS = [15, 45, 75, 105, 135];
const LANES_X_DYNAMIC = [-135, -105, -75, -45, -15, 15];
const LANES_Z = [0, 30, 60, 90, 120, 152];
const LANES_X_CLASSIC = [-90, -45, -15, 15];

const DENSITIES = [
  { id: "sparse", label: "espaçada", empty: 0.34, weight: 1 },
  { id: "normal", label: "normal", empty: 0.2, weight: 2 },
  { id: "dense", label: "densa", empty: 0.08, weight: 1 },
];

export function cellIndex(ix, iy, iz) {
  return (iy * sizeZ + iz) * sizeX + ix;
}

function inside(ix, iy, iz) {
  return ix >= 0 && iy >= 0 && iz >= 0 && ix < sizeX && iy < sizeY && iz < sizeZ;
}

function toCellX(x) {
  return Math.round((x - originX) / VOXEL_SIZE);
}

function toCellZ(z) {
  return Math.round((z - originZ) / VOXEL_SIZE);
}

function typeForLayers(layers) {
  return layers < 12 ? "small" : layers < 17 ? "medium" : "tall";
}

function addBuilding(layout, { x, z, halfX, halfZ, layers, type }) {
  const id = layout.buildings.length + 1;
  const building = {
    id,
    type: type ?? typeForLayers(layers),
    x,
    z,
    minIx: toCellX(x) - halfX,
    maxIx: toCellX(x) + halfX - 1,
    minIz: toCellZ(z) - halfZ,
    maxIz: toCellZ(z) + halfZ - 1,
    layers,
    height: layers * VOXEL_SIZE,
  };
  layout.buildings.push(building);
  for (let iy = 0; iy < layers; iy += 1) {
    for (let iz = building.minIz; iz <= building.maxIz; iz += 1) {
      for (let ix = building.minIx; ix <= building.maxIx; ix += 1) {
        if (inside(ix, iy, iz)) {
          layout.cells[cellIndex(ix, iy, iz)] = id;
        }
      }
    }
  }
  return building;
}

function columnTop(layout, ix, iz) {
  for (let iy = sizeY - 1; iy >= 0; iy -= 1) {
    if (layout.cells[cellIndex(ix, iy, iz)]) {
      return iy;
    }
  }
  return -1;
}

function createLayout(kind, seed) {
  return {
    kind,
    seed,
    cells: new Uint8Array(CELL_COUNT),
    buildings: [],
    islands: [],
    parks: [],
    bridges: [],
    spawns: [],
    lanesX: kind === "classic" ? LANES_X_CLASSIC : LANES_X_DYNAMIC,
    lanesZ: LANES_Z,
    density: null,
  };
}

// Mapa original do BU3D (desenha_cidade + spawn_carrinho_1/2).
function generateClassic() {
  const layout = createLayout("classic", 0);
  CITY_LAYOUT.forEach((entry) => {
    addBuilding(layout, {
      x: entry.x,
      z: entry.z,
      halfX: BUILDING_HALF / VOXEL_SIZE,
      halfZ: BUILDING_HALF / VOXEL_SIZE,
      layers: Math.round(BUILDING_TYPES[entry.type].height / VOXEL_SIZE),
      type: entry.type,
    });
  });
  layout.playerSpawns = PLAYER_DEFAULTS.map((template) => template.spawns.map((spawn) => ({ ...spawn, kind: "classic" })));
  return layout;
}

function addMound(layout, rng, x, z) {
  const radius = 8 + rng() * 4;
  const peak = 1 + Math.floor(rng() * 3);
  const cx = x + (rng() * 2 - 1) * 3;
  const cz = z + (rng() * 2 - 1) * 3;
  const reach = Math.ceil(radius / VOXEL_SIZE) + 1;
  for (let iz = toCellZ(cz) - reach; iz <= toCellZ(cz) + reach; iz += 1) {
    for (let ix = toCellX(cx) - reach; ix <= toCellX(cx) + reach; ix += 1) {
      const px = originX + (ix + 0.5) * VOXEL_SIZE;
      const pz = originZ + (iz + 0.5) * VOXEL_SIZE;
      const distance = Math.hypot(px - cx, pz - cz) / radius;
      if (distance > 1) {
        continue;
      }
      const height = Math.ceil(peak * (1 - distance * distance) - 0.15);
      for (let iy = 0; iy < height; iy += 1) {
        if (inside(ix, iy, iz) && !layout.cells[cellIndex(ix, iy, iz)]) {
          layout.cells[cellIndex(ix, iy, iz)] = iy === height - 1 ? MATERIALS.grass : MATERIALS.earth;
        }
      }
    }
  }
  layout.parks.push({ x, z, radius: radius + 3, peak });
}

function addIsland(layout, rng) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const radius = 6 + Math.floor(rng() * 3);
    const top = 15 + Math.floor(rng() * 7);
    const depth = 3 + Math.floor(rng() * 3);
    const cx = toCellX(-135 + rng() * 170);
    const cz = toCellZ(8 + rng() * 145);
    if (cx - radius < 2 || cx + radius > sizeX - 3 || cz - radius < 2 || cz + radius > sizeZ - 3) {
      continue;
    }
    const far = layout.islands.every((island) => Math.hypot(island.cx - cx, island.cz - cz) > island.radius + radius + 5);
    if (!far) {
      continue;
    }
    // Precisa de folga sobre o que estiver embaixo (predios, morros).
    let clear = true;
    for (let iz = cz - radius; iz <= cz + radius && clear; iz += 1) {
      for (let ix = cx - radius; ix <= cx + radius && clear; ix += 1) {
        if (Math.hypot(ix - cx, iz - cz) <= radius + 1 && columnTop(layout, ix, iz) > top - depth - 4) {
          clear = false;
        }
      }
    }
    if (!clear) {
      continue;
    }

    const island = { cx, cz, radius, top, x: originX + (cx + 0.5) * VOXEL_SIZE, z: originZ + (cz + 0.5) * VOXEL_SIZE };
    for (let iz = cz - radius - 1; iz <= cz + radius + 1; iz += 1) {
      for (let ix = cx - radius - 1; ix <= cx + radius + 1; ix += 1) {
        const distance = Math.hypot(ix - cx, iz - cz) / (radius + (rng() - 0.5) * 0.8);
        if (distance > 1) {
          continue;
        }
        const thickness = Math.max(1, Math.round(depth * (1 - distance * distance) + rng() * 0.8)) + 1;
        for (let layer = 0; layer < thickness; layer += 1) {
          const iy = top - layer;
          layout.cells[cellIndex(ix, iy, iz)] = layer === 0 ? MATERIALS.grass : MATERIALS.rock;
        }
      }
    }
    // Casinha de concreto num canto da ilha (cobertura e alvo destrutivel).
    if (rng() < 0.6) {
      const angle = rng() * Math.PI * 2;
      const hx = Math.round(cx + Math.cos(angle) * (radius - 2.5));
      const hz = Math.round(cz + Math.sin(angle) * (radius - 2.5));
      for (let iy = top + 1; iy <= top + 2; iy += 1) {
        for (let iz = hz - 1; iz <= hz; iz += 1) {
          for (let ix = hx - 1; ix <= hx; ix += 1) {
            if (inside(ix, iy, iz)) {
              layout.cells[cellIndex(ix, iy, iz)] = MATERIALS.concrete;
            }
          }
        }
      }
    }
    layout.islands.push(island);
    layout.spawns.push({ x: island.x, y: (top + 1) * VOXEL_SIZE, z: island.z, kind: "island" });
    return island;
  }
  return null;
}

// Cidade nova a cada rodada: mesma malha de ruas, prédios e terrenos sorteados.
function generateDynamic(seed) {
  const rng = createRng(seed);
  const layout = createLayout("dynamic", seed);
  let roll = rng() * DENSITIES.reduce((sum, entry) => sum + entry.weight, 0);
  const density = DENSITIES.find((entry) => (roll -= entry.weight) <= 0) ?? DENSITIES[1];
  layout.density = density.label;

  const empties = [];
  COLUMNS.forEach((x) => {
    ROWS.forEach((z) => {
      if (rng() < density.empty) {
        empties.push({ x, z });
        return;
      }
      const sizeRoll = rng();
      const layers = sizeRoll < 0.45 ? 8 + Math.floor(rng() * 4)
        : sizeRoll < 0.8 ? 12 + Math.floor(rng() * 5)
          : 18 + Math.floor(rng() * 6);
      const building = addBuilding(layout, {
        x: x + (rng() < 0.5 ? 0 : (rng() < 0.5 ? -2 : 2)),
        z: z + (rng() < 0.5 ? 0 : (rng() < 0.5 ? -2 : 2)),
        halfX: 3 + Math.floor(rng() * 3),
        halfZ: 3 + Math.floor(rng() * 3),
        layers,
      });
      const halfX = (building.maxIx - building.minIx + 1) / 2;
      const halfZ = (building.maxIz - building.minIz + 1) / 2;
      if (Math.min(halfX, halfZ) >= 4 || rng() < 0.5) {
        layout.spawns.push({ x: building.x, y: building.height, z: building.z, kind: "roof" });
      }
    });
  });

  // Terrenos vazios viram pracas com morros (relevo).
  empties.forEach((slot) => {
    if (rng() < 0.75) {
      addMound(layout, rng, slot.x, slot.z);
    }
  });

  const islandCount = 2 + Math.floor(rng() * 3);
  for (let index = 0; index < islandCount; index += 1) {
    addIsland(layout, rng);
  }

  // Pontos de rua (no meio das avenidas).
  LANES_X_DYNAMIC.forEach((x) => {
    LANES_Z.forEach((z) => {
      layout.spawns.push({ x, y: 0, z, kind: "street" });
    });
  });
  return layout;
}

const cache = new Map();

export function getLayout(kind, seed) {
  const key = kind === "classic" ? "classic" : `dynamic:${seed}`;
  if (!cache.has(key)) {
    if (cache.size > 6) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, kind === "classic" ? generateClassic() : generateDynamic(seed));
  }
  return cache.get(key);
}
