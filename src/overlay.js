import { ARENA, CRATES, FUEL_PER_TURN, GRID, MAX_HP, ROUND_MODIFIERS, ROUNDS_TO_WIN, VOXEL_SIZE, WEAPONS, WIND_MAX } from "./config.js";
import { degToRad, radToDeg } from "./math.js";

const MAP_WIDTH = ARENA.maxX - ARENA.minX;
const MAP_DEPTH = ARENA.maxZ - ARENA.minZ;
const MAP_CENTER = { x: (ARENA.minX + ARENA.maxX) / 2, z: (ARENA.minZ + ARENA.maxZ) / 2 };
const MAP_PIXELS = 2;

function pips(won) {
  return Array.from({ length: ROUNDS_TO_WIN }, (_, index) => `<i class="${index < won ? "on" : ""}"></i>`).join("");
}

// Camada HTML sobre o canvas 3D: placar, timer, vento, barra de forca, banners, danos e minimapa.
export class StageOverlay {
  constructor(root) {
    this.root = root;
    this.el = {
      players: [],
      sides: [root.querySelector(".tb-side.is-left"), root.querySelector(".tb-side.is-right")],
      topbar: root.querySelector(".topbar"),
      round: root.querySelector(".tb-round"),
      timer: root.querySelector(".tb-timer"),
      windArrow: root.querySelector(".wind-arrow"),
      windValue: root.querySelector(".wind-value"),
      modifier: root.querySelector(".modifier-chip"),
      power: root.querySelector(".power-panel"),
      powerFill: root.querySelector(".power-fill"),
      powerMarker: root.querySelector(".power-marker"),
      readout: root.querySelector(".aim-readout"),
      weapon: root.querySelector(".weapon-chip"),
      feedback: root.querySelector(".aim-feedback"),
      targetLayer: root.querySelector(".target-layer"),
      camera: root.querySelector(".camera-chip"),
      banner: root.querySelector(".banner"),
      floatLayer: root.querySelector(".float-layer"),
      minimap: root.querySelector(".minimap"),
    };
    this.cache = new Map();
    this.floating = [];
    this.bannerTimer = null;
    this.mapBase = document.createElement("canvas");
    this.mapVersion = -1;
    this.labels = new Map();
    this.flashFeedback = null;
  }

  // Retorno logo depois do tiro (fica alguns segundos na tela).
  showShotFeedback(text, seconds = 3) {
    if (text) {
      this.flashFeedback = { text, life: seconds };
    }
  }

  // Etiqueta sobre cada inimigo: nome e distancia; presa na borda com seta quando fora de vista.
  updateTargetLabels(state, stage) {
    const current = state.players[state.turnIndex];
    const showing = state.phase === "aiming" || state.phase === "flying" || state.phase === "settling";
    const alive = new Set();
    state.players.forEach((player) => {
      if (player.id === current.id || player.hp <= 0 || !showing) {
        return;
      }
      alive.add(player.id);
      let label = this.labels.get(player.id);
      if (!label) {
        label = document.createElement("div");
        label.className = "target-label";
        label.innerHTML = '<span class="target-arrow"></span><span class="target-text"></span>';
        this.el.targetLayer.appendChild(label);
        this.labels.set(player.id, label);
      }
      const distance = Math.round(Math.hypot(
        player.position.x - current.position.x,
        player.position.y - current.position.y,
        player.position.z - current.position.z,
      ));
      const locked = current.lockedTargetId === player.id;
      const inSights = state.phase === "aiming" && stage.guideInfo?.targetId === player.id;
      label.style.setProperty("--team", player.color);
      label.classList.toggle("is-locked", locked);
      label.classList.toggle("is-sighted", inSights);
      label.querySelector(".target-text").textContent = `${player.label} · ${distance} m${inSights ? " · NA MIRA" : ""}`;
      const screen = stage.projectEdge({ x: player.position.x, y: player.position.y + 8, z: player.position.z }, 46);
      label.classList.toggle("is-edge", !screen.onScreen);
      label.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -50%)`;
      label.querySelector(".target-arrow").style.transform = screen.onScreen ? "" : `rotate(${screen.angle}deg)`;
    });
    this.labels.forEach((label, id) => {
      if (!alive.has(id)) {
        label.remove();
        this.labels.delete(id);
      }
    });
  }

  updateAimInfo(state, dt) {
    const current = state.players[state.turnIndex];
    if (this.flashFeedback) {
      this.flashFeedback.life -= dt;
      if (this.flashFeedback.life <= 0) {
        this.flashFeedback = null;
      }
    }
    // O aviso do ultimo tiro e temporario: logo depois do tiro e no comeco da proxima vez.
    const feedback = this.flashFeedback?.text ?? "";
    this.write("feedback", feedback, (value) => {
      this.el.feedback.textContent = value;
      this.el.feedback.hidden = !value;
    });
  }

  write(key, value, apply) {
    if (this.cache.get(key) === value) {
      return;
    }
    this.cache.set(key, value);
    apply(value);
  }

  showBanner(text, { color = "#ffffff", duration = 1.6, small = false, subtitle = "" } = {}) {
    const banner = this.el.banner;
    banner.innerHTML = `<strong></strong>${subtitle ? "<span></span>" : ""}`;
    banner.querySelector("strong").textContent = text;
    if (subtitle) {
      banner.querySelector("span").textContent = subtitle;
    }
    banner.style.setProperty("--banner-color", color);
    banner.classList.toggle("is-small", small);
    banner.classList.remove("is-visible");
    void banner.offsetWidth;
    banner.classList.add("is-visible");
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => banner.classList.remove("is-visible"), duration * 1000);
  }

  addFloatingText(text, position, { color = "#ffffff", size = 20 } = {}) {
    const element = document.createElement("div");
    element.className = "float-text";
    element.textContent = text;
    element.style.color = color;
    element.style.fontSize = `${size}px`;
    this.el.floatLayer.appendChild(element);
    this.floating.push({ element, position: { ...position }, life: 1.4, maxLife: 1.4 });
  }

  clear() {
    this.floating.forEach((item) => item.element.remove());
    this.floating = [];
    this.el.banner.classList.remove("is-visible");
  }

  // Cards do placar do topo: impares a esquerda, pares a direita.
  buildPlayerCards(players) {
    this.el.sides.forEach((side) => side.replaceChildren());
    this.el.players = players.map((player) => {
      const right = player.id % 2 === 0;
      const card = document.createElement("div");
      card.className = `tb-player${right ? " is-right" : ""}`;
      card.dataset.overlayPlayer = String(player.id);
      card.style.setProperty("--team", player.color);
      const name = `<span class="tb-name">${player.label}</span>`;
      const rounds = '<span class="tb-rounds"></span>';
      const fuel = '<div class="tb-fuel" title="Combustível"><span></span></div>';
      const value = '<span class="tb-hp-value">100</span>';
      card.innerHTML = `
        <div class="tb-head">${right ? rounds + name : name + rounds}</div>
        <div class="tb-hp"><span></span></div>
        <div class="tb-meta">${right ? value + fuel : fuel + value}</div>
      `;
      this.el.sides[right ? 1 : 0].appendChild(card);
      return {
        card,
        hp: card.querySelector(".tb-hp span"),
        hpValue: card.querySelector(".tb-hp-value"),
        fuel: card.querySelector(".tb-fuel span"),
        rounds: card.querySelector(".tb-rounds"),
      };
    });
    this.el.topbar.classList.toggle("is-crowded", players.length > 2);
    [...this.cache.keys()].filter((key) => /^(hp|fuel|rounds|turn|you|dead)\d/.test(key)).forEach((key) => this.cache.delete(key));
  }

  update(state, dt, { stage, cameraLabel, localPlayerId = null, minimapEnabled = true }) {
    const current = state.players[state.turnIndex];
    const roster = state.players.map((player) => player.id).join(",");
    if (roster !== this.roster) {
      this.roster = roster;
      this.buildPlayerCards(state.players);
    }
    state.players.forEach((player, index) => {
      const el = this.el.players[index];
      const hp = Math.max(0, player.hp);
      this.write(`hp${index}`, hp, (value) => {
        el.hp.style.width = `${(value / MAX_HP) * 100}%`;
        el.hpValue.textContent = `${value}`;
        el.card.classList.toggle("is-low", value < 35);
      });
      const fuel = Math.min(100, Math.round((player.fuel / FUEL_PER_TURN) * 100));
      this.write(`fuel${index}`, fuel, (value) => {
        el.fuel.style.width = `${value}%`;
      });
      this.write(`rounds${index}`, state.totalScore[index], (value) => {
        el.rounds.innerHTML = pips(value);
      });
      this.write(`turn${index}`, state.phase === "aiming" && index === state.turnIndex, (value) => {
        el.card.classList.toggle("is-turn", value);
      });
      this.write(`you${index}`, localPlayerId === player.id, (value) => {
        el.card.classList.toggle("is-you", value);
      });
      this.write(`dead${index}`, player.hp <= 0, (value) => {
        el.card.classList.toggle("is-dead", value);
      });
    });

    this.write("round", state.round + 1, (value) => {
      this.el.round.textContent = `Rodada ${value}`;
    });
    const seconds = Math.ceil(Math.max(0, state.turnTimeMs) / 1000);
    this.write("timer", state.phase === "aiming" ? seconds : "–", (value) => {
      this.el.timer.textContent = value;
      this.el.timer.classList.toggle("is-urgent", typeof value === "number" && value <= 5);
    });

    const modifier = ROUND_MODIFIERS[state.modifier] ?? ROUND_MODIFIERS.normal;
    this.write("modifier", modifier.id, () => {
      this.el.modifier.textContent = modifier.label;
      this.el.modifier.dataset.modifier = modifier.id;
      this.el.modifier.hidden = modifier.id === "normal";
    });

    const windStrength = Math.hypot(state.wind.x, state.wind.z);
    if (modifier.hideWind) {
      this.el.windArrow.style.opacity = 0;
      this.write("wind", "hidden", () => {
        this.el.windValue.textContent = "? km/h";
      });
    } else {
      const windBearing = radToDeg(Math.atan2(state.wind.x, state.wind.z));
      const relative = windBearing - stage.rig.heading;
      this.el.windArrow.style.transform = `rotate(${-relative}deg) scale(${0.6 + 0.4 * Math.min(1, windStrength / (WIND_MAX * 2))})`;
      this.el.windArrow.style.opacity = windStrength < 0.05 ? 0.25 : 1;
      this.write("wind", Math.round(windStrength * 20), (value) => {
        this.el.windValue.textContent = `${value} km/h`;
      });
    }

    const aiming = state.phase === "aiming";
    this.write("powerVisible", aiming, (value) => {
      this.el.power.classList.toggle("is-visible", value);
    });
    if (aiming) {
      const power = state.charge.active ? state.charge.power : 0;
      this.el.powerFill.style.width = `${power * 100}%`;
      this.write("marker", current.lastPower, (value) => {
        this.el.powerMarker.style.display = value === null ? "none" : "block";
        this.el.powerMarker.style.left = `${(value ?? 0) * 100}%`;
      });
      // Uma linha so: arma, barra de forca e angulo (vira % de forca enquanto carrega).
      const weapon = WEAPONS[current.weapon] ?? WEAPONS.standard;
      const ammo = weapon.ammo === null ? "" : ` ×${current.ammo[weapon.id]}`;
      this.write("weaponChip", `${weapon.id}${ammo}`, () => {
        this.el.weapon.textContent = `${weapon.short}${ammo}`;
        this.el.weapon.title = weapon.label;
        this.el.weapon.style.setProperty("--weapon-color", weapon.color);
      });
      const readout = state.charge.active ? `${Math.round(state.charge.power * 100)}%` : `${Math.round(current.elevation)}°`;
      this.write("readout", readout, (value) => {
        this.el.readout.textContent = value;
      });
      this.el.power.style.setProperty("--player-color", current.color);
    }

    this.write("camera", cameraLabel, (value) => {
      this.el.camera.innerHTML = `<strong>Câmera: ${value}</strong> · C troca · arraste para girar · roda zoom`;
    });

    this.updateFloating(dt, stage);
    this.updateTargetLabels(state, stage);
    this.updateAimInfo(state, dt);
    if (minimapEnabled) {
      this.drawMinimap(state, stage);
    }
  }

  updateFloating(dt, stage) {
    this.floating = this.floating.filter((item) => {
      item.life -= dt;
      if (item.life <= 0) {
        item.element.remove();
        return false;
      }
      item.position.y += dt * 5;
      const screen = stage.project(item.position);
      if (!screen) {
        item.element.style.opacity = 0;
        return true;
      }
      const strength = item.life / item.maxLife;
      item.element.style.opacity = Math.min(1, strength * 2);
      item.element.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -50%)`;
      return true;
    });
  }

  // Mapa de alturas visto de cima (espelhado em x para bater com a vista 3D).
  buildMapBase(world) {
    const canvas = this.mapBase;
    canvas.width = MAP_WIDTH * MAP_PIXELS;
    canvas.height = MAP_DEPTH * MAP_PIXELS;
    const context = canvas.getContext("2d");
    context.fillStyle = "#2a2d35";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const cell = VOXEL_SIZE * MAP_PIXELS;
    for (let iz = 0; iz < GRID.sizeZ; iz += 1) {
      for (let ix = 0; ix < GRID.sizeX; ix += 1) {
        let top = -1;
        for (let iy = GRID.sizeY - 1; iy >= 0; iy -= 1) {
          if (world.buildingAtCell(ix, iy, iz)) {
            top = iy;
            break;
          }
        }
        if (top < 0) {
          continue;
        }
        const x = GRID.originX + (ix + 1) * VOXEL_SIZE;
        const z = GRID.originZ + (iz + 1) * VOXEL_SIZE;
        const shade = Math.round(80 + (top / GRID.sizeY) * 150);
        context.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 12})`;
        context.fillRect((ARENA.maxX - x) * MAP_PIXELS, (ARENA.maxZ - z) * MAP_PIXELS, cell + 0.5, cell + 0.5);
      }
    }
  }

  // Radar circular que gira com a camera: o "para cima" do mapa e sempre para onde a camera olha.
  drawMinimap(state, stage) {
    const canvas = this.el.minimap;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(canvas.clientWidth * ratio);
    if (!size) {
      return;
    }
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    if (this.mapVersion !== stage.world.version) {
      this.buildMapBase(stage.world);
      this.mapVersion = stage.world.version;
    }

    const context = canvas.getContext("2d");
    const half = size / 2;
    const scale = size / (Math.hypot(MAP_WIDTH, MAP_DEPTH) + 16);
    const heading = degToRad(stage.rig.heading);
    const toMap = (point) => ({ x: -(point.x - MAP_CENTER.x) * scale, y: -(point.z - MAP_CENTER.z) * scale });

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(half, half, half - ratio, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "rgba(12, 14, 20, 0.88)";
    context.fillRect(0, 0, size, size);
    context.translate(half, half);
    context.rotate(heading);

    const corner = toMap({ x: ARENA.maxX, z: ARENA.maxZ });
    context.drawImage(this.mapBase, corner.x, corner.y, MAP_WIDTH * scale, MAP_DEPTH * scale);

    const shooter = state.players[state.turnIndex];
    if (state.phase === "aiming" && shooter.lastImpact) {
      const mark = toMap(shooter.lastImpact);
      context.strokeStyle = shooter.color;
      context.lineWidth = 2 * ratio;
      context.beginPath();
      context.moveTo(mark.x - 4 * ratio, mark.y - 4 * ratio);
      context.lineTo(mark.x + 4 * ratio, mark.y + 4 * ratio);
      context.moveTo(mark.x + 4 * ratio, mark.y - 4 * ratio);
      context.lineTo(mark.x - 4 * ratio, mark.y + 4 * ratio);
      context.stroke();
    }

    if (state.impact && state.phase !== "aiming") {
      const impact = toMap(state.impact);
      context.strokeStyle = "rgba(255, 210, 120, 0.95)";
      context.lineWidth = 1.5 * ratio;
      context.beginPath();
      context.arc(impact.x, impact.y, 5 * ratio, 0, Math.PI * 2);
      context.stroke();
    }

    state.players.forEach((player, index) => {
      const point = toMap(player.position);
      const yaw = degToRad(player.yaw);
      if (state.phase === "aiming" && index === state.turnIndex) {
        context.strokeStyle = player.color;
        context.globalAlpha = 0.75;
        context.setLineDash([4 * ratio, 4 * ratio]);
        context.lineWidth = 1.5 * ratio;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.x - Math.sin(yaw) * 70 * ratio, point.y - Math.cos(yaw) * 70 * ratio);
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = 1;
      }
      context.save();
      context.translate(point.x, point.y);
      context.rotate(-yaw);
      context.fillStyle = player.hp > 0 ? player.color : "#555555";
      context.strokeStyle = "#000000";
      context.lineWidth = 1.2 * ratio;
      context.beginPath();
      context.moveTo(0, -7 * ratio);
      context.lineTo(5 * ratio, 5 * ratio);
      context.lineTo(-5 * ratio, 5 * ratio);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    });

    (state.crates ?? []).forEach((crate) => {
      const point = toMap(crate);
      context.fillStyle = CRATES.types[crate.type]?.color ?? "#ffffff";
      context.strokeStyle = "#000000";
      context.lineWidth = ratio;
      context.fillRect(point.x - 3.5 * ratio, point.y - 3.5 * ratio, 7 * ratio, 7 * ratio);
      context.strokeRect(point.x - 3.5 * ratio, point.y - 3.5 * ratio, 7 * ratio, 7 * ratio);
    });

    state.projectiles.forEach((projectile) => {
      const point = toMap(projectile.position);
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(point.x, point.y, (projectile.weapon === "bomblet" ? 1.6 : 2.5) * ratio, 0, Math.PI * 2);
      context.fill();
    });

    // Posicao e campo de visao da camera (sempre apontando para cima).
    const camera = toMap(stage.camera.position);
    context.rotate(-heading);
    const cameraX = camera.x * Math.cos(heading) - camera.y * Math.sin(heading);
    const cameraY = camera.x * Math.sin(heading) + camera.y * Math.cos(heading);
    context.fillStyle = "rgba(255, 255, 255, 0.1)";
    context.beginPath();
    context.moveTo(cameraX, cameraY);
    context.lineTo(cameraX - 55 * ratio, cameraY - 95 * ratio);
    context.lineTo(cameraX + 55 * ratio, cameraY - 95 * ratio);
    context.closePath();
    context.fill();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(cameraX, cameraY, 2.5 * ratio, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.strokeStyle = "rgba(255, 255, 255, 0.25)";
    context.lineWidth = ratio;
    context.beginPath();
    context.arc(half, half, half - ratio, 0, Math.PI * 2);
    context.stroke();
  }
}
