import { GRID, VOXEL_SIZE } from "./config.js";
import { getLayout } from "./map.js";

const { originX, originZ, sizeX, sizeY, sizeZ } = GRID;
const CELL_COUNT = sizeX * sizeY * sizeZ;

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

// Cidade feita de voxels: cada cratera apaga as celulas dentro da esfera.
// O estado e derivado so da lista de crateras: a logica do jogo e a renderizacao chegam ao mesmo resultado.
export class VoxelWorld {
  constructor(layout = getLayout("classic", 0)) {
    this.cells = new Uint8Array(CELL_COUNT);
    this.applied = [];
    this.version = 0;
    this.layout = layout;
    this.reset();
  }

  // Troca o mapa (cidade base) e limpa as crateras.
  setLayout(layout) {
    this.layout = layout;
    this.reset();
  }

  reset() {
    this.collapses = [];
    this.cells.set(this.layout.cells);
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

  // Altura do topo solido na coluna (x, z); 0 = chao.
  topAt(x, z) {
    const ix = Math.floor((x - originX) / VOXEL_SIZE);
    const iz = Math.floor((z - originZ) / VOXEL_SIZE);
    for (let iy = sizeY - 1; iy >= 0; iy -= 1) {
      if (this.buildingAtCell(ix, iy, iz)) {
        return (iy + 1) * VOXEL_SIZE;
      }
    }
    return 0;
  }

  // Qual eixo foi cruzado ao entrar no solido (para o ricochete): "x", "y" ou "z".
  hitAxis(previous, current) {
    if (current.y <= 0 && previous.y > 0) {
      return "y";
    }
    const cell = (point) => ({
      x: Math.floor((point.x - originX) / VOXEL_SIZE),
      y: Math.floor(point.y / VOXEL_SIZE),
      z: Math.floor((point.z - originZ) / VOXEL_SIZE),
    });
    const from = cell(previous);
    const to = cell(current);
    for (const axis of ["y", "x", "z"]) {
      if (from[axis] === to[axis]) {
        continue;
      }
      const probe = { ...from, [axis]: to[axis] };
      if (this.buildingAtCell(probe.x, probe.y, probe.z)) {
        return axis;
      }
    }
    const delta = {
      x: Math.abs(current.x - previous.x),
      y: Math.abs(current.y - previous.y),
      z: Math.abs(current.z - previous.z),
    };
    return delta.x >= delta.y && delta.x >= delta.z ? "x" : delta.z >= delta.y ? "z" : "y";
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

  // Desabamento: tudo que perdeu ligacao com o chao (ou com o nucleo de uma ilha)
  // cai como um bloco rigido ate encostar em algo. Retorna os blocos que cairam.
  collapse() {
    const cells = this.cells;
    const layer = sizeX * sizeZ;
    const supported = new Uint8Array(CELL_COUNT);
    const stack = [];
    for (let index = 0; index < layer; index += 1) {
      if (cells[index]) {
        supported[index] = 1;
        stack.push(index);
      }
    }
    this.layout.anchors.forEach((index) => {
      if (cells[index] && !supported[index]) {
        supported[index] = 1;
        stack.push(index);
      }
    });
    const visit = (index, list, mark, test) => {
      const ix = index % sizeX;
      const iz = Math.floor(index / sizeX) % sizeZ;
      const iy = Math.floor(index / layer);
      const neighbors = [];
      if (ix > 0) neighbors.push(index - 1);
      if (ix < sizeX - 1) neighbors.push(index + 1);
      if (iz > 0) neighbors.push(index - sizeX);
      if (iz < sizeZ - 1) neighbors.push(index + sizeX);
      if (iy > 0) neighbors.push(index - layer);
      if (iy < sizeY - 1) neighbors.push(index + layer);
      neighbors.forEach((next) => {
        if (!mark[next] && test(next)) {
          mark[next] = 1;
          list.push(next);
        }
      });
    };
    while (stack.length) {
      visit(stack.pop(), stack, supported, (next) => cells[next] !== 0);
    }

    // Agrupa o que ficou solto em blocos conectados.
    const grouped = new Uint8Array(CELL_COUNT);
    const components = [];
    for (let index = layer; index < CELL_COUNT; index += 1) {
      if (!cells[index] || supported[index] || grouped[index]) {
        continue;
      }
      const component = [index];
      grouped[index] = 1;
      for (let cursor = 0; cursor < component.length; cursor += 1) {
        visit(component[cursor], component, grouped, (next) => cells[next] !== 0 && !supported[next]);
      }
      components.push(component);
    }
    if (!components.length) {
      return [];
    }

    // Os mais baixos caem primeiro; cada bloco desce o maximo sem atravessar nada.
    const lowest = (component) => Math.min(...component.map((index) => Math.floor(index / layer)));
    components.sort((a, b) => lowest(a) - lowest(b));
    const result = [];
    components.forEach((component) => {
      const members = new Set(component);
      let drop = Infinity;
      component.forEach((index) => {
        let below = index - layer;
        if (members.has(below)) {
          return;
        }
        let gap = 0;
        while (below >= 0 && !cells[below]) {
          gap += 1;
          below -= layer;
        }
        drop = Math.min(drop, gap);
      });
      if (!Number.isFinite(drop) || drop <= 0) {
        return;
      }
      const moved = component.map((index) => ({ from: index, to: index - drop * layer, material: cells[index] }));
      moved.forEach((cell) => {
        cells[cell.from] = 0;
      });
      moved.forEach((cell) => {
        cells[cell.to] = cell.material;
      });
      const center = moved.reduce((sum, cell) => {
        const { ix, iy, iz } = cellCoords(cell.to);
        sum.x += ix;
        sum.y += iy;
        sum.z += iz;
        return sum;
      }, { x: 0, y: 0, z: 0 });
      result.push({
        cells: moved,
        drop,
        center: cellCenter(center.x / moved.length, center.y / moved.length, center.z / moved.length),
      });
    });
    return result;
  }

  // Sincroniza com a lista de crateras do snapshot. Retorna as celulas removidas agora.
  sync(craters) {
    this.collapses = [];
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
      const carved = this.carve(craters[index]);
      removed.push(...carved);
      if (carved.length) {
        this.collapses.push(...this.collapse());
      }
      this.applied.push(craters[index].id);
    }
    this.version += 1;
    return removed;
  }
}
