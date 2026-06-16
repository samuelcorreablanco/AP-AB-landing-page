// Juego solo/single-player: la plataforma exige un módulo de reglas, pero toda la
// simulación corre en el cliente (index.html). Este stub satisface el contrato.
export const meta = { game: "cafe-racer-93", minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
