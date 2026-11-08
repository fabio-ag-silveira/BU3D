import { GAME_MODES, MAX_HP, ROUND_MODIFIERS, ROUNDS_TO_WIN, WEAPONS } from "./config.js";

const PHASE_LABELS = {
  roundStart: "Preparando a rodada...",
  flying: "Projétil no ar!",
  settling: "Poeira baixando...",
  roundOver: "Fim da rodada",
};

function renderStats(player) {
  const hpPercent = Math.max(0, (player.hp / MAX_HP) * 100);
  const heading = ((Math.round(player.yaw) % 360) + 360) % 360;
  const weapon = WEAPONS[player.weapon] ?? WEAPONS.standard;
  const ammo = weapon.ammo === null ? "" : ` ×${player.ammo[weapon.id]}`;
  const lastPower = `<span>·</span><span>${weapon.label}${ammo}</span>`;
  return `
    <div class="hp-line">
      <div class="hp-track"><span class="hp-fill" style="width: ${hpPercent}%"></span></div>
      <span class="hp-number">${player.hp}</span>
    </div>
    <div class="player-meta">
      <span>${Math.round(player.elevation)}°</span>
      <span>·</span>
      <span>rumo ${heading}°</span>
      ${lastPower}
    </div>
  `;
}

function renderRounds(won) {
  return Array.from({ length: ROUNDS_TO_WIN }, (_, index) =>
    `<span class="round-dot${index < won ? " is-won" : ""}"></span>`).join("");
}

function setPressed(button, pressed) {
  button.classList.toggle("is-active", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

// Painel lateral desenhado a partir do snapshot; so toca no DOM quando algo muda.
export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.cache = new Map();
  }

  write(key, apply, value) {
    if (this.cache.get(key) === value) {
      return;
    }
    this.cache.set(key, value);
    apply(value);
  }

  render(state, { mode, aiDifficulty, soundEnabled, minimapEnabled, cameraMode, mapKind, aimAssist }) {
    const { ui } = this;
    const current = state.players[state.turnIndex];
    const winner = state.players.find((player) => player.id === state.matchWinner);
    const seconds = Math.ceil(Math.max(0, state.turnTimeMs) / 1000);
    const turnText = state.phase === "aiming"
      ? `Vez de ${current.label} · ${seconds}s`
      : state.phase === "matchOver"
        ? `${winner?.label ?? "Alguém"} venceu a partida!`
        : PHASE_LABELS[state.phase] ?? "";

    const modifier = ROUND_MODIFIERS[state.modifier];
    const roundText = modifier && modifier.id !== "normal"
      ? `Rodada ${state.round + 1} · ${modifier.label}`
      : `Rodada ${state.round + 1}`;
    this.write("round", (value) => { ui.roundLabel.textContent = value; }, roundText);
    this.write("turn", (value) => { ui.turnLabel.textContent = value; }, turnText);
    this.write("status", (value) => { ui.statusLabel.textContent = value; }, state.status);
    const scoreboard = state.players.map((player, index) => `
      <article class="player-row${state.phase === "aiming" && index === state.turnIndex ? " is-turn" : ""}${player.hp <= 0 ? " is-dead" : ""}" style="--team: ${player.color}">
        <div class="player-head">
          <span class="player-dot" aria-hidden="true"></span>
          <span class="player-name">${player.label}${mode === GAME_MODES.ai && player.id !== 1 ? " <small>IA</small>" : ""}</span>
          <span class="round-dots">${renderRounds(state.totalScore[index] ?? 0)}</span>
        </div>
        ${renderStats(player)}
      </article>`).join("");
    this.write("scoreboard", (value) => { ui.scoreboard.innerHTML = value; }, scoreboard);
    this.write("mode", (value) => {
      ui.modeButtons.forEach((button) => setPressed(button, button.dataset.mode === value));
    }, mode);
    this.write("difficulty", (value) => {
      ui.difficultyButtons.forEach((button) => {
        setPressed(button, mode === GAME_MODES.ai && button.dataset.difficulty === aiDifficulty);
        button.disabled = mode !== GAME_MODES.ai;
      });
    }, `${mode}:${aiDifficulty}`);
    this.write("camera", (value) => {
      ui.cameraButtons.forEach((button) => setPressed(button, button.dataset.camera === value));
    }, cameraMode);
    this.write("players", (value) => {
      ui.playerCountButtons.forEach((button) => setPressed(button, button.dataset.players === value));
    }, String(state.players.length));
    this.write("assist", (value) => {
      ui.assistButtons.forEach((button) => setPressed(button, button.dataset.assist === value));
    }, aimAssist);
    this.write("map", (value) => {
      ui.mapButtons.forEach((button) => setPressed(button, button.dataset.map === value));
    }, mapKind);
    this.write("sound", (value) => setPressed(ui.soundButton, value), soundEnabled);
    this.write("minimap", (value) => setPressed(ui.minimapButton, value), minimapEnabled);
  }
}
