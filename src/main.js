import { Game } from "./game.js";
import { GAME_MODES } from "./config.js";
import { SoundBoard } from "./audio.js";
import { Hud } from "./hud.js";
import { InputController } from "./input.js";
import { StageOverlay } from "./overlay.js";
import { Stage } from "./render/stage.js";

const MINIMAP_KEY = "bu3d_minimap";

const ui = {
  roundLabel: document.getElementById("roundLabel"),
  turnLabel: document.getElementById("turnLabel"),
  statusLabel: document.getElementById("statusLabel"),
  scoreboard: document.getElementById("scoreboard"),
  playerCountButtons: Array.from(document.querySelectorAll("[data-players]")),
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  difficultyButtons: Array.from(document.querySelectorAll("[data-difficulty]")),
  cameraButtons: Array.from(document.querySelectorAll("[data-camera]")),
  mapButtons: Array.from(document.querySelectorAll("[data-map]")),
  soundButton: document.getElementById("soundButton"),
  minimapButton: document.getElementById("minimapButton"),
  resetButton: document.getElementById("resetButton"),
  menuButton: document.getElementById("menuButton"),
  menuClose: document.getElementById("menuClose"),
  hudBackdrop: document.getElementById("hudBackdrop"),
  fullscreenButton: document.getElementById("fullscreenButton"),
  rotateDismiss: document.getElementById("rotateDismiss"),
  touchCamera: document.getElementById("touchCamera"),
  touchButtons: Array.from(document.querySelectorAll("[data-control]")),
};

let stage;
try {
  stage = new Stage(document.getElementById("gameCanvas"));
} catch (error) {
  document.getElementById("webglError").hidden = false;
  throw error;
}

const game = new Game();
const hud = new Hud(ui);
const overlay = new StageOverlay(document.querySelector(".stage-overlay"));
const sound = new SoundBoard();

let minimapEnabled = true;
try {
  minimapEnabled = window.localStorage.getItem(MINIMAP_KEY) !== "off";
} catch {
  // preferencia so vale para a sessao
}

function setMinimap(enabled) {
  minimapEnabled = enabled;
  document.body.classList.toggle("minimap-off", !enabled);
  try {
    window.localStorage.setItem(MINIMAP_KEY, enabled ? "on" : "off");
  } catch {
    // preferencia so vale para a sessao
  }
}
setMinimap(minimapEnabled);

function resetMatch() {
  game.resetGame();
}

const input = new InputController({
  resolveTarget(binding) {
    return binding.player === "current" ? game.currentPlayer.id : binding.player;
  },
  dispatch(target, control, pressed, options) {
    // Atirar durante o replay so pula o replay.
    if (pressed && control === "fire" && stage.replay.active) {
      stage.replay.stop();
      return;
    }
    game.setInput(target, control, pressed, options);
  },
  onShortcut(key, event) {
    if (stage.replay.active && key !== "b") {
      stage.replay.stop();
      return;
    }
    if (key === "b") {
      resetMatch();
    } else if (key === "x") {
      sound.toggle();
    } else if (key === "c") {
      stage.rig.cycle(event.shiftKey ? -1 : 1);
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
window.addEventListener("pointerdown", () => sound.unlock());

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    game.setMode(button.dataset.mode);
    button.blur();
  });
});

ui.difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    game.setAiDifficulty(button.dataset.difficulty);
    button.blur();
  });
});

ui.playerCountButtons.forEach((button) => {
  button.addEventListener("click", () => {
    game.setPlayerCount(Number(button.dataset.players));
    button.blur();
  });
});

ui.mapButtons.forEach((button) => {
  button.addEventListener("click", () => {
    game.setMapKind(button.dataset.map);
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

ui.minimapButton.addEventListener("click", () => {
  setMinimap(!minimapEnabled);
  ui.minimapButton.blur();
});

ui.resetButton.addEventListener("click", () => {
  resetMatch();
  setMenuOpen(false);
  ui.resetButton.blur();
});

// Botoes de toque: segurar = tecla apertada; usam o mesmo caminho do teclado.
ui.touchButtons.forEach((button) => {
  const id = `touch:${button.dataset.control}`;
  const release = (options) => {
    button.classList.remove("is-pressed");
    input.release(id, options);
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add("is-pressed");
    sound.unlock();
    input.press(id, { player: "current", control: button.dataset.control });
  });
  button.addEventListener("pointerup", () => release());
  button.addEventListener("pointercancel", () => release({ cancel: true }));
  button.addEventListener("lostpointercapture", () => release());
  button.addEventListener("contextmenu", (event) => event.preventDefault());
});

ui.touchCamera.addEventListener("click", () => {
  stage.rig.cycle(1);
  overlay.showBanner(`Câmera: ${stage.rig.label}`, { duration: 0.9, small: true });
  ui.touchCamera.blur();
});

window.addEventListener("touchstart", () => document.body.classList.add("touch"), { once: true, passive: true });

function setMenuOpen(open) {
  document.body.classList.toggle("menu-open", open);
}

ui.menuButton.addEventListener("click", () => setMenuOpen(true));
ui.menuClose.addEventListener("click", () => setMenuOpen(false));
ui.hudBackdrop.addEventListener("click", () => setMenuOpen(false));
ui.rotateDismiss.addEventListener("click", () => document.body.classList.add("rotate-dismissed"));

if (document.fullscreenEnabled) {
  ui.fullscreenButton.hidden = false;
  ui.fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      // Navegadores que suportam travam na horizontal; os demais ignoram.
      await screen.orientation?.lock?.("landscape").catch(() => {});
    } catch {
      // tela cheia recusada pelo navegador
    }
    ui.fullscreenButton.blur();
  });
}

let lastEventId = 0;
let lastTickSecond = null;

function consumeEvents(state) {
  state.events.forEach((event) => {
    if (event.id > lastEventId) {
      stage.handleEvent(event, state, { sound, overlay }, performance.now() / 1000);
      lastEventId = event.id;
      if (event.type === "explosion" && document.body.classList.contains("touch")) {
        navigator.vibrate?.(35);
      }
    }
  });
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

  game.update(deltaMs);
  const state = game.getSnapshot();

  consumeEvents(state);
  updateTimerTicks(state);
  sound.setCharge(state.phase === "aiming" && state.charge.active ? state.charge.power : null);

  stage.render(state, dt, timestamp / 1000);
  overlay.update(state, dt, { stage, cameraLabel: stage.rig.label, minimapEnabled });
  hud.render(state, {
    mode: game.mode,
    aiDifficulty: game.aiDifficulty,
    soundEnabled: sound.enabled,
    minimapEnabled,
    cameraMode: stage.rig.mode,
    mapKind: game.mapKind,
  });

  window.requestAnimationFrame(frame);
}

window.requestAnimationFrame(frame);

// Ganchos para depuracao no console.
window.bu3d = { game, stage };
