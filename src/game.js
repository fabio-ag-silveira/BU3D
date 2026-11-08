import {
  AI_DIFFICULTIES,
  AI_PRESETS,
  AI_THINK_DELAY_MS,
  AIM_SPEED,
  CART_GRAVITY,
  CHARGE_SECONDS,
  CRATER_RADIUS,
  DEFAULT_AI_DIFFICULTY,
  DEFAULT_GAME_MODE,
  DIRECT_HIT_BONUS,
  EXPLOSION_DAMAGE,
  EXPLOSION_RADIUS,
  FUEL_PER_TURN,
  GAME_MODES,
  MAX_CRATERS,
  MAX_HP,
  MIN_SPAWN_DISTANCE,
  MOVE_SPEED,
  PHASE_DELAYS,
  PLAYER_DEFAULTS,
  PROJECTILE_SUBSTEP,
  ROUNDS_TO_WIN,
  SAFE_FALL,
  SKY_THEMES,
  TIME_SCALE,
  TURN_TIME_MS,
  WIND_MAX,
  YAW_SPEED,
} from "./config.js";
import { clamp, distance2d, distance3d, randomItem, randomRange, wrapDegrees } from "./math.js";
import {
  bearingTo,
  clampElevation,
  forwardVector,
  getLaunchVelocity,
  getMuzzle,
  getTankCenter,
  isInsideTankHitbox,
  isOutOfBounds,
  isTankBlocked,
  isTankSupported,
  powerToVelocity,
  projectileAt,
} from "./physics.js";
import { VoxelWorld } from "./world.js";
import { planAiShot } from "./ai.js";

export const CONTROLS = ["up", "down", "left", "right", "forward", "back", "fire"];
const MAX_EVENTS = 40;

function createInputState() {
  return Object.fromEntries(CONTROLS.map((control) => [control, false]));
}

function pickSpawns() {
  const first = randomItem(PLAYER_DEFAULTS[0].spawns);
  const options = PLAYER_DEFAULTS[1].spawns.filter((spawn) => distance2d(spawn, first) >= MIN_SPAWN_DISTANCE);
  return [first, randomItem(options.length ? options : PLAYER_DEFAULTS[1].spawns)];
}

function createPlayers() {
  const spawns = pickSpawns();
  return PLAYER_DEFAULTS.map((template, index) => {
    const position = { ...spawns[index] };
    const other = spawns[1 - index];
    return {
      id: template.id,
      label: template.label,
      color: template.color,
      shade: template.shade,
      position,
      yaw: Math.round(bearingTo(position, other)),
      elevation: 35,
      hp: MAX_HP,
      fuel: FUEL_PER_TURN,
      lastPower: null,
      fall: null,
    };
  });
}

function randomWind(strength) {
  const angle = Math.random() * Math.PI * 2;
  const magnitude = Math.round(strength * 10) / 10;
  return {
    x: Math.round(Math.sin(angle) * magnitude * 100) / 100,
    z: Math.round(Math.cos(angle) * magnitude * 100) / 100,
  };
}

export class Game {
  constructor() {
    this.instanceId = Math.random().toString(36).slice(2, 10);
    this.mode = DEFAULT_GAME_MODE;
    this.aiDifficulty = DEFAULT_AI_DIFFICULTY;
    this.events = [];
    this.eventSeq = 0;
    this.inputs = { 1: createInputState(), 2: createInputState() };
    this.aiMissMemory = new Map();
    this.world = new VoxelWorld();
    this.resetGame();
  }

  get currentPlayer() {
    return this.players[this.turnIndex];
  }

  get opponent() {
    return this.players[1 - this.turnIndex];
  }

  get isAiTurn() {
    return this.mode === GAME_MODES.ai && this.currentPlayer.id === 2;
  }

  emit(type, data = {}) {
    this.eventSeq += 1;
    this.events.push({ id: this.eventSeq, type, ...data });
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  setPhase(phase, durationMs = 0) {
    this.phase = phase;
    this.phaseMs = durationMs;
  }

  resetGame() {
    this.round = -1;
    this.totalScore = [0, 0];
    this.matchWinner = null;
    this.resetRound();
    this.status = "Nova partida. Primeiro a vencer 3 rodadas leva!";
  }

  resetRound() {
    this.round += 1;
    this.turnIndex = this.round % 2;
    this.turnsInRound = 0;
    this.theme = randomItem(Object.keys(SKY_THEMES));
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.craters = [];
    this.world.reset();
    this.projectile = null;
    this.impact = null;
    this.charge = { active: false, power: 0, direction: 1 };
    this.wind = { x: 0, z: 0 };
    this.turnTimeMs = TURN_TIME_MS;
    this.players = createPlayers();
    this.aiPlan = null;
    this.aiThinkMs = 0;
    this.aiMissMemory.clear();
    this.setPhase("roundStart", PHASE_DELAYS.roundStart);
    this.status = `Rodada ${this.round + 1}. Preparem-se!`;
    this.emit("roundStart", { round: this.round + 1, theme: this.theme });
  }

  setMode(mode) {
    if (!Object.values(GAME_MODES).includes(mode) || this.mode === mode) {
      return;
    }

    this.mode = mode;
    this.aiPlan = null;
    this.aiThinkMs = AI_THINK_DELAY_MS;
    this.status = this.mode === GAME_MODES.ai ? "Modo versus IA ativado." : "Modo versus local ativado.";
  }

  setAiDifficulty(difficulty) {
    if (!Object.values(AI_DIFFICULTIES).includes(difficulty) || this.aiDifficulty === difficulty) {
      return;
    }

    this.aiDifficulty = difficulty;
    this.status = `Dificuldade alterada para ${AI_PRESETS[this.aiDifficulty].label}.`;
  }

  cycleAiDifficulty() {
    const order = [AI_DIFFICULTIES.easy, AI_DIFFICULTIES.medium, AI_DIFFICULTIES.hard];
    const currentIndex = order.indexOf(this.aiDifficulty);
    this.setAiDifficulty(order[(currentIndex + 1) % order.length]);
  }

  setInput(playerId, control, pressed, { cancel = false } = {}) {
    const input = this.inputs[playerId];
    if (!input || !CONTROLS.includes(control)) {
      return false;
    }
    if (this.mode === GAME_MODES.ai && playerId === 2) {
      return false;
    }

    const wasPressed = input[control];
    input[control] = pressed;

    const isTurnOwner = this.phase === "aiming" && this.currentPlayer.id === playerId;
    if (control === "fire" && pressed !== wasPressed && isTurnOwner) {
      if (pressed) {
        this.startCharge();
      } else if (this.charge.active) {
        if (cancel) {
          this.charge.active = false;
        } else {
          this.fire();
        }
      }
    }
    return true;
  }

  update(deltaMs) {
    const dt = Math.min(deltaMs, 50);
    this.phaseMs -= dt;

    switch (this.phase) {
      case "roundStart":
        if (this.phaseMs <= 0) {
          this.beginTurn();
        }
        break;
      case "aiming":
        this.updateFalling(dt);
        this.updateAiming(dt);
        break;
      case "flying":
        this.updateFalling(dt);
        this.updateProjectile(dt);
        break;
      case "settling":
        if (!this.updateFalling(dt) && this.phaseMs <= 0) {
          this.resolveTurn();
        }
        break;
      case "roundOver":
        this.updateFalling(dt);
        if (this.phaseMs <= 0) {
          this.resetRound();
        }
        break;
      case "matchOver":
        if (this.phaseMs <= 0) {
          this.resetGame();
        }
        break;
      default:
        break;
    }
  }

  beginTurn() {
    this.turnsInRound += 1;
    const growth = 0.5 + 0.5 * Math.min(1, this.turnsInRound / 6);
    this.wind = randomWind(randomRange(0, WIND_MAX) * growth);
    this.turnTimeMs = TURN_TIME_MS;
    this.charge = { active: false, power: 0, direction: 1 };
    this.impact = null;
    this.aiPlan = null;
    this.aiThinkMs = AI_THINK_DELAY_MS;

    const player = this.currentPlayer;
    player.fuel = FUEL_PER_TURN;
    this.setPhase("aiming");
    this.status = `Vez de ${player.label}. Gire, mire, ajuste a força e atire!`;
    this.emit("turn", { playerId: player.id, label: player.label, wind: { ...this.wind } });
  }

  updateAiming(dt) {
    this.turnTimeMs -= dt;
    const player = this.currentPlayer;
    const seconds = dt / 1000;

    if (this.isAiTurn) {
      this.updateAi(dt);
    } else if (!player.fall) {
      const input = this.inputs[player.id];
      const aim = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      if (aim) {
        player.elevation = clampElevation(player.elevation + aim * AIM_SPEED * seconds);
      }
      const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      if (turn && !this.charge.active) {
        this.rotateCart(player, turn * YAW_SPEED * seconds);
      }
      const move = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      if (move && !this.charge.active) {
        this.moveCart(player, move, seconds);
      }
    }

    if (this.phase !== "aiming") {
      return;
    }

    if (this.charge.active) {
      let power = this.charge.power + (this.charge.direction * seconds) / CHARGE_SECONDS;
      if (power >= 1) {
        power = 1;
        this.charge.direction = -1;
      } else if (power <= 0) {
        power = 0;
        this.charge.direction = 1;
      }
      this.charge.power = power;
    }

    if (this.turnTimeMs <= 0) {
      this.turnTimeMs = 0;
      if (this.charge.active) {
        this.fire("Tempo esgotado! O disparo saiu com a força atual.");
      } else {
        this.status = `Tempo esgotado! ${player.label} perdeu a vez.`;
        this.emit("timeout", { playerId: player.id });
        this.setPhase("settling", PHASE_DELAYS.timeout);
      }
    }
  }

  rotateCart(player, deltaYaw) {
    player.yaw = wrapDegrees(player.yaw + deltaYaw);
  }

  moveCart(player, direction, seconds) {
    if (player.fuel <= 0) {
      return;
    }

    const distance = Math.min(MOVE_SPEED * seconds, player.fuel);
    const forward = forwardVector(player.yaw);
    const next = {
      x: player.position.x + forward.x * direction * distance,
      y: player.position.y,
      z: player.position.z + forward.z * direction * distance,
    };
    const other = this.players.find((entry) => entry !== player);
    if (isTankBlocked(this.world, next, player.yaw, direction, other)) {
      return;
    }
    player.fuel = Math.max(0, player.fuel - distance);
    player.position = next;
  }

  startCharge() {
    this.charge = { active: true, power: 0, direction: 1 };
  }

  fire(message) {
    const player = this.currentPlayer;
    const power = this.charge.power;
    this.charge = { active: false, power, direction: 1 };
    player.lastPower = power;

    const origin = getMuzzle(player.position, player.yaw, player.elevation);
    this.emit("shot", { playerId: player.id, ...origin, power, yaw: player.yaw, elevation: player.elevation });
    this.projectile = {
      id: this.eventSeq,
      ownerId: player.id,
      origin,
      velocity: getLaunchVelocity(player.yaw, player.elevation, powerToVelocity(power)),
      wind: { ...this.wind },
      elapsed: 0,
      position: { ...origin },
    };
    this.setPhase("flying");
    this.status = message ?? `${player.label} disparou com ${Math.round(power * 100)}% de força.`;
  }

  updateProjectile(dt) {
    const projectile = this.projectile;
    let remaining = (dt / 1000) * TIME_SCALE;

    while (remaining > 0) {
      const step = Math.min(PROJECTILE_SUBSTEP, remaining);
      remaining -= step;
      projectile.elapsed += step;
      projectile.position = projectileAt(projectile.origin, projectile.velocity, projectile.wind, projectile.elapsed);

      const target = this.players.find((player) =>
        isInsideTankHitbox(projectile.position, player) &&
        (player.id !== projectile.ownerId || projectile.elapsed > 0.5));
      if (target) {
        this.explode(projectile.position, target);
        return;
      }

      if (this.world.isSolid(projectile.position)) {
        this.explode(projectile.position, null);
        return;
      }

      if (isOutOfBounds(projectile.position)) {
        this.projectile = null;
        this.rememberAiMiss();
        this.status = "O tiro saiu do mapa.";
        this.emit("miss", { playerId: this.currentPlayer.id });
        this.setPhase("settling", PHASE_DELAYS.settle);
        return;
      }
    }
  }

  explode(point, directTarget) {
    const attacker = this.currentPlayer;
    this.projectile = null;
    const crater = { id: this.eventSeq + 1, x: point.x, y: point.y, z: point.z, r: CRATER_RADIUS };
    this.craters.push(crater);
    if (this.craters.length > MAX_CRATERS) {
      this.craters.shift();
    }
    this.world.sync(this.craters);
    this.impact = { x: point.x, y: point.y, z: point.z };
    this.emit("explosion", { ...this.impact, radius: EXPLOSION_RADIUS, playerId: attacker.id, craterId: crater.id });

    let dealt = 0;
    let selfDamage = 0;
    this.players.forEach((player) => {
      const distance = distance3d(getTankCenter(player), point);
      let damage = distance < EXPLOSION_RADIUS ? EXPLOSION_DAMAGE * (1 - distance / EXPLOSION_RADIUS) : 0;
      if (player === directTarget) {
        damage += DIRECT_HIT_BONUS;
      }
      damage = Math.round(damage);
      if (damage <= 0) {
        return;
      }
      this.applyDamage(player, damage);
      if (player === attacker) {
        selfDamage += damage;
      } else {
        dealt += damage;
      }
    });

    if (directTarget && directTarget !== attacker) {
      this.status = `Acerto direto! ${directTarget.label} perdeu ${dealt} de HP.`;
    } else if (dealt > 0) {
      this.status = `${attacker.label} causou ${dealt} de dano.`;
    } else if (selfDamage > 0) {
      this.status = `Fogo amigo! ${attacker.label} se feriu (${selfDamage}).`;
    } else {
      this.status = "Errou! O tiro atingiu o cenário.";
    }

    if (dealt === 0) {
      this.rememberAiMiss();
    }
    this.setPhase("settling", PHASE_DELAYS.settle);
  }

  applyDamage(player, amount) {
    player.hp = Math.max(0, player.hp - amount);
    this.emit("damage", { playerId: player.id, amount, ...player.position });
  }

  updateFalling(dt) {
    const seconds = dt / 1000;
    let anyFalling = false;

    this.players.forEach((player) => {
      if (isTankSupported(this.world, player.position, player.yaw)) {
        if (player.fall) {
          this.land(player);
        }
        return;
      }

      if (!player.fall) {
        player.fall = { velocity: 0, startY: player.position.y };
      }
      player.fall.velocity = Math.min(player.fall.velocity + CART_GRAVITY * seconds, 120);
      let remaining = player.fall.velocity * seconds;
      while (remaining > 0) {
        const step = Math.min(0.25, remaining);
        remaining -= step;
        player.position.y = Math.max(0, player.position.y - step);
        if (isTankSupported(this.world, player.position, player.yaw)) {
          break;
        }
      }

      if (isTankSupported(this.world, player.position, player.yaw)) {
        this.land(player);
      } else {
        anyFalling = true;
      }
    });

    return anyFalling;
  }

  land(player) {
    const distance = player.fall.startY - player.position.y;
    player.fall = null;
    const damage = distance > SAFE_FALL ? Math.min(30, Math.round((distance - SAFE_FALL) * 1.2)) : 0;
    this.emit("land", { playerId: player.id, ...player.position, distance });
    if (damage > 0) {
      this.applyDamage(player, damage);
    }
  }

  resolveTurn() {
    const defeated = this.players.filter((player) => player.hp <= 0);
    if (defeated.length) {
      this.finishRound(defeated);
      return;
    }
    this.turnIndex = 1 - this.turnIndex;
    this.beginTurn();
  }

  finishRound(defeated) {
    defeated.forEach((player) => this.emit("destroyed", { playerId: player.id, ...player.position }));

    if (defeated.length === this.players.length) {
      this.status = "Empate! Os dois carrinhos foram destruídos.";
      this.emit("roundEnd", { winnerId: null, label: null });
      this.setPhase("roundOver", PHASE_DELAYS.roundOver);
      return;
    }

    const winner = this.players.find((player) => player.hp > 0);
    this.totalScore[winner.id - 1] += 1;

    if (this.totalScore[winner.id - 1] >= ROUNDS_TO_WIN) {
      this.matchWinner = winner.id;
      this.status = `${winner.label} venceu a partida! Nova partida em instantes (B reinicia).`;
      this.emit("matchEnd", { winnerId: winner.id, label: winner.label });
      this.setPhase("matchOver", PHASE_DELAYS.matchOver);
      return;
    }

    this.status = `${winner.label} venceu a rodada.`;
    this.emit("roundEnd", { winnerId: winner.id, label: winner.label });
    this.setPhase("roundOver", PHASE_DELAYS.roundOver);
  }

  // A IA gira a torre, ajusta a elevacao e segura o disparo como um jogador faria.
  updateAi(dt) {
    const player = this.currentPlayer;
    if (!this.aiPlan) {
      this.aiThinkMs -= dt;
      if (this.aiThinkMs <= 0) {
        this.aiPlan = planAiShot(this);
        this.status = `${player.label} está mirando...`;
      }
      return;
    }

    const plan = this.aiPlan;
    const yawDifference = wrapDegrees(plan.yaw - player.yaw);
    if (Math.abs(yawDifference) > 0.01) {
      const step = (YAW_SPEED * dt) / 1000;
      this.rotateCart(player, clamp(yawDifference, -step, step));
      return;
    }

    const difference = plan.elevation - player.elevation;
    if (Math.abs(difference) > 0.01) {
      const step = (AIM_SPEED * 1.4 * dt) / 1000;
      player.elevation = clampElevation(player.elevation + clamp(difference, -step, step));
      return;
    }

    if (!this.charge.active) {
      this.startCharge();
      return;
    }

    if (this.charge.power >= plan.power || this.charge.direction < 0) {
      this.charge.power = plan.power;
      this.fire();
    }
  }

  rememberAiMiss() {
    if (!this.isAiTurn || !this.aiPlan) {
      return;
    }
    const { stateKey, source } = this.aiPlan;
    const misses = this.aiMissMemory.get(stateKey) ?? [];
    misses.push(source);
    this.aiMissMemory.set(stateKey, misses.slice(-8));
  }

  getSnapshot() {
    const projectile = this.projectile;
    return {
      instanceId: this.instanceId,
      mode: this.mode,
      aiDifficulty: this.aiDifficulty,
      phase: this.phase,
      phaseMs: this.phaseMs,
      round: this.round,
      turnIndex: this.turnIndex,
      totalScore: [...this.totalScore],
      matchWinner: this.matchWinner,
      status: this.status,
      theme: this.theme,
      seed: this.seed,
      wind: { ...this.wind },
      turnTimeMs: this.turnTimeMs,
      craters: this.craters.map((crater) => ({ ...crater })),
      impact: this.impact ? { ...this.impact } : null,
      projectile: projectile ? {
        id: projectile.id,
        ownerId: projectile.ownerId,
        origin: { ...projectile.origin },
        velocity: { ...projectile.velocity },
        wind: { ...projectile.wind },
        elapsed: projectile.elapsed,
        position: { ...projectile.position },
      } : null,
      charge: { active: this.charge.active, power: this.charge.power },
      events: this.events.map((event) => ({ ...event })),
      players: this.players.map((player) => ({
        id: player.id,
        label: player.label,
        color: player.color,
        shade: player.shade,
        position: { ...player.position },
        yaw: player.yaw,
        elevation: player.elevation,
        hp: player.hp,
        fuel: player.fuel,
        lastPower: player.lastPower,
        falling: Boolean(player.fall),
      })),
    };
  }
}
