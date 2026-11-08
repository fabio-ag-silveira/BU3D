import { Game } from "./game.js";
import { GAME_MODES, TIME_SCALE } from "./config.js";
import { LanClient } from "./lanClient.js";
import { SoundBoard } from "./audio.js";
import { Hud } from "./hud.js";
import { InputController } from "./input.js";
import { StageOverlay } from "./overlay.js";
import { projectileAt } from "./physics.js";
import { Stage } from "./render/stage.js";

const canvas = document.getElementById("gameCanvas");

const ui = {
  roundLabel: document.getElementById("roundLabel"),
  turnLabel: document.getElementById("turnLabel"),
  statusLabel: document.getElementById("statusLabel"),
  playerOneStats: document.getElementById("playerOneStats"),
  playerTwoStats: document.getElementById("playerTwoStats"),
  playerOneCard: document.querySelector(".player-one"),
  playerTwoCard: document.querySelector(".player-two"),
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  difficultyButtons: Array.from(document.querySelectorAll("[data-difficulty]")),
  cameraButtons: Array.from(document.querySelectorAll("[data-camera]")),
  soundButton: document.getElementById("soundButton"),
  serverUrlInput: document.getElementById("serverUrlInput"),
  createRoomButton: document.getElementById("createRoomButton"),
  refreshRoomsButton: document.getElementById("refreshRoomsButton"),
  leaveRoomButton: document.getElementById("leaveRoomButton"),
  connectionStatus: document.getElementById("connectionStatus"),
  roomList: document.getElementById("roomList"),
};

let stage;
try {
  stage = new Stage(canvas);
} catch (error) {
  document.getElementById("webglError").hidden = false;
  throw error;
}

const game = new Game();
const hud = new Hud(ui);
const overlay = new StageOverlay(document.querySelector(".stage-overlay"));
const sound = new SoundBoard();
ui.serverUrlInput.value = window.location.origin;

let lanSnapshot = null;
let lanReceivedAt = 0;
const lanClient = new LanClient(ui, (snapshot) => {
  lanSnapshot = snapshot;
  lanReceivedAt = performance.now();
});

function isLanActive() {
  return game.mode === GAME_MODES.lan && lanClient.connected;
}

function reportLanError(error) {
  ui.connectionStatus.textContent = error.message;
}

function resetMatch() {
  if (isLanActive()) {
    lanClient.sendCommand("reset").catch(reportLanError);
    return;
  }
  game.resetGame();
}

const input = new InputController({
  resolveTarget(binding) {
    if (isLanActive()) {
      return "lan";
    }
    if (binding.player === "current") {
      return game.currentPlayer.id;
    }
    return binding.player;
  },
  dispatch(target, control, pressed, options) {
    if (target === "lan") {
      lanClient.sendInput(control, pressed, options?.cancel).catch(reportLanError);
      return;
    }
    game.setInput(target, control, pressed, options);
  },
  onShortcut(key, event) {
    if (key === "b") {
      resetMatch();
    } else if (key === "x") {
      sound.toggle();
    } else if (key === "c") {
      stage.rig.cycle(event.shiftKey ? -1 : 1);
    } else if (isLanActive()) {
      return;
    } else if (key === "m") {
      game.setMode(game.mode === GAME_MODES.ai ? GAME_MODES.local : GAME_MODES.ai);
    } else if (key === "n") {
      game.cycleAiDifficulty();
    }
  },
  onActivity() {
    sound.unlock();
  },
});
input.attach(window);
input.attachTouch(Array.from(document.querySelectorAll("[data-touch]")));

// Celular: o painel lateral vira uma gaveta aberta pelo botao de menu.
const hudPanel = document.getElementById("hudPanel");
document.getElementById("drawerOpen").addEventListener("click", () => hudPanel.classList.add("is-open"));
document.getElementById("drawerClose").addEventListener("click", () => hudPanel.classList.remove("is-open"));
document.getElementById("touchCamera").addEventListener("click", (event) => {
  stage.rig.cycle(1);
  event.currentTarget.blur();
});
window.addEventListener("touchstart", () => document.body.classList.add("has-touch"), { once: true, passive: true });
if (window.matchMedia?.("(pointer: coarse)").matches) {
  document.body.classList.add("has-touch");
}

// Hospedagem estatica (ex.: Cloudflare Workers) nao tem o servidor das salas LAN.
fetch("/api/rooms", { cache: "no-store" })
  .then((response) => {
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) {
      throw new Error("sem servidor");
    }
  })
  .catch(() => {
    document.body.classList.add("no-lan");
    [ui.createRoomButton, ui.refreshRoomsButton, ui.leaveRoomButton,
      ...ui.modeButtons.filter((button) => button.dataset.mode === GAME_MODES.lan)]
      .forEach((button) => { button.disabled = true; });
    ui.connectionStatus.textContent = "LAN indisponível nesta hospedagem. Para jogar em rede, rode node server.js no seu PC.";
  });
window.addEventListener("pointerdown", () => sound.unlock());

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    game.setMode(button.dataset.mode);
    if (button.dataset.mode === GAME_MODES.lan) {
      lanClient.startRoomDiscovery(ui.serverUrlInput.value);
    } else {
      lanClient.stopRoomDiscovery();
      lanClient.leaveRoom().catch(() => {});
    }
    button.blur();
  });
});

ui.difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    game.setAiDifficulty(button.dataset.difficulty);
    button.blur();
  });
});

ui.cameraButtons.forEach((button) => {
  button.addEventListener("click", () => {
    stage.rig.setMode(button.dataset.camera);
    button.blur();
  });
});

ui.soundButton.addEventListener("click", () => {
  sound.unlock();
  sound.toggle();
  ui.soundButton.blur();
});

ui.createRoomButton.addEventListener("click", async () => {
  try {
    game.setMode(GAME_MODES.lan);
    lanClient.startRoomDiscovery(ui.serverUrlInput.value);
    await lanClient.createRoom(ui.serverUrlInput.value);
  } catch (error) {
    reportLanError(error);
  }
});

ui.refreshRoomsButton.addEventListener("click", () => {
  game.setMode(GAME_MODES.lan);
  lanClient.startRoomDiscovery(ui.serverUrlInput.value);
});

ui.leaveRoomButton.addEventListener("click", () => {
  lanClient.leaveRoom().catch(() => {});
  lanClient.stopRoomDiscovery();
  game.setMode(GAME_MODES.ai);
});

window.addEventListener("beforeunload", () => {
  if (lanClient.connected && lanClient.roomId) {
    navigator.sendBeacon(
      `${lanClient.serverUrl}/api/rooms/${lanClient.roomId}/leave`,
      JSON.stringify({ clientId: lanClient.clientId }),
    );
  }
});

// Entre um polling e outro, o voo do projetil e extrapolado localmente.
function extrapolateLanSnapshot(snapshot, now) {
  const projectile = snapshot.projectile;
  if (!projectile) {
    return snapshot;
  }
  const ahead = (Math.min(now - lanReceivedAt, 250) / 1000) * TIME_SCALE;
  const elapsed = projectile.elapsed + ahead;
  return {
    ...snapshot,
    projectile: {
      ...projectile,
      elapsed,
      position: projectileAt(projectile.origin, projectile.velocity, projectile.wind, elapsed),
    },
  };
}

let lastInstanceId = null;
let lastEventId = 0;
let lastTickSecond = null;

function consumeEvents(state) {
  const newestId = state.events.reduce((max, event) => Math.max(max, event.id), 0);
  if (lastInstanceId !== null && state.instanceId !== lastInstanceId) {
    // Trocou de partida (ex.: entrou numa sala LAN): ignora o historico antigo.
    lastInstanceId = state.instanceId;
    lastEventId = newestId;
    stage.effects.reset();
    overlay.clear();
    return;
  }
  lastInstanceId = state.instanceId;
  if (newestId < lastEventId) {
    lastEventId = 0;
  }
  state.events.forEach((event) => {
    if (event.id > lastEventId) {
      stage.handleEvent(event, state, { sound, overlay });
    }
  });
  lastEventId = Math.max(lastEventId, newestId);
}

function updateTimerTicks(state) {
  const seconds = Math.ceil(Math.max(0, state.turnTimeMs) / 1000);
  if (state.phase === "aiming" && seconds <= 5 && seconds > 0 && seconds !== lastTickSecond) {
    sound.tick(seconds <= 2);
  }
  lastTickSecond = state.phase === "aiming" ? seconds : null;
}

let previousTimestamp = performance.now();

function frame(timestamp) {
  const deltaMs = Math.min(timestamp - previousTimestamp, 100);
  previousTimestamp = timestamp;
  const dt = deltaMs / 1000;

  let state;
  if (isLanActive() && lanSnapshot) {
    state = extrapolateLanSnapshot(lanSnapshot, timestamp);
  } else {
    game.update(deltaMs);
    state = game.getSnapshot();
  }

  consumeEvents(state);
  updateTimerTicks(state);
  sound.setCharge(state.phase === "aiming" && state.charge.active ? state.charge.power : null);

  stage.render(state, dt, timestamp / 1000);
  overlay.update(state, dt, {
    stage,
    cameraLabel: stage.rig.label,
    localPlayerId: isLanActive() ? lanClient.playerId : null,
  });
  hud.render(state, {
    mode: isLanActive() ? GAME_MODES.lan : game.mode,
    aiDifficulty: game.aiDifficulty,
    soundEnabled: sound.enabled,
    cameraMode: stage.rig.mode,
  });

  window.requestAnimationFrame(frame);
}

window.requestAnimationFrame(frame);

// Ganchos para depuracao no console.
window.bu3d = { game, stage };
