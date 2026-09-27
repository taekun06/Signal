// Moteur de règles de SIGNAL//ZÉRO (inspiré de Decrypto).
// Tout est pur et déterministe : l'aléatoire vient d'une graine stockée dans
// l'état, ce qui permet de rejouer la même action sur deux appareils (ou dans
// une transaction en ligne) et d'obtenir exactement le même résultat.

import { WORDS } from "./words";

export type TeamId = "A" | "B";
export const TEAM_IDS: readonly TeamId[] = ["A", "B"];
export const otherTeam = (team: TeamId): TeamId => (team === "A" ? "B" : "A");

/** Trois positions distinctes parmi 1..4, dans l'ordre des indices. */
export type Code = [number, number, number];

export interface Settings {
  /** Durée du sablier en secondes (0 = pas de sablier). */
  timerSeconds: number;
  maxRounds: number;
}

export interface Team {
  name: string;
  players: string[];
  words: string[];
  interceptions: number;
  miscommunications: number;
}

export interface Transmission {
  encryptor: string;
  code: Code;
  clues: string[] | null;
  ownGuess: Code | null;
  interceptGuess: Code | null;
  revealed: boolean;
}

export interface Round {
  number: number;
  transmissions: Record<TeamId, Transmission>;
}

export type Phase = "clues" | "decode" | "reveal" | "tiebreak" | "over";

export type WinReason = "interceptions" | "miscommunications" | "points" | "tiebreak" | "draw";

export interface GameResult {
  winner: TeamId | "draw";
  reason: WinReason;
  tiebreakScores?: Record<TeamId, number>;
}

export interface GameState {
  version: 1;
  seed: number;
  phase: Phase;
  settings: Settings;
  teams: Record<TeamId, Team>;
  rounds: Round[];
  /** Équipe dont la transmission est en cours de décodage ou de révélation. */
  active: TeamId;
  clueDeadline: number | null;
  tiebreak: Record<TeamId, string[] | null> | null;
  result: GameResult | null;
}

export interface TeamConfig {
  name: string;
  players: string[];
}

export interface GameConfig {
  teams: Record<TeamId, TeamConfig>;
  settings?: Partial<Settings>;
}

export const DEFAULT_SETTINGS: Settings = { timerSeconds: 30, maxRounds: 8 };
export const MIN_PLAYERS = 2;
export const MAX_CLUE_LENGTH = 32;
/** Indice inscrit quand le sablier tombe avant la saisie. */
export const BLANK_CLUE = "—";

export class RuleError extends Error {}

// ---------------------------------------------------------------------------
// Aléatoire déterministe (mulberry32)

function createRandom(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get seed() {
      return state;
    },
  };
}

type Random = ReturnType<typeof createRandom>;

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function drawCode(random: Random): Code {
  return shuffle([1, 2, 3, 4], random).slice(0, 3) as Code;
}

// ---------------------------------------------------------------------------
// Utilitaires publics

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function sameCode(a: readonly number[] | null, b: readonly number[] | null): boolean {
  return !!a && !!b && a.length === b.length && a.every((value, index) => value === b[index]);
}

export function isValidCode(code: readonly number[]): code is Code {
  return (
    code.length === 3 &&
    code.every((digit) => Number.isInteger(digit) && digit >= 1 && digit <= 4) &&
    new Set(code).size === 3
  );
}

export function currentRound(state: GameState): Round {
  return state.rounds[state.rounds.length - 1];
}

export function encryptorFor(players: readonly string[], roundNumber: number): string {
  return players[(roundNumber - 1) % players.length];
}

export function interceptionAllowed(state: GameState): boolean {
  return currentRound(state).number > 1;
}

export function score(team: Team): number {
  return team.interceptions - team.miscommunications;
}

/** Indices déjà révélés d'une équipe, rangés sous les positions 1 à 4. */
export function notebook(state: GameState, team: TeamId): { round: number; clue: string }[][] {
  const columns: { round: number; clue: string }[][] = [[], [], [], []];
  for (const round of state.rounds) {
    const transmission = round.transmissions[team];
    if (!transmission.revealed || !transmission.clues) continue;
    transmission.code.forEach((position, index) => {
      columns[position - 1].push({ round: round.number, clue: transmission.clues![index] });
    });
  }
  return columns;
}

/**
 * Équipes qui doivent encore agir, dans l'ordre où un téléphone unique doit
 * les appeler. Vide quand l'écran est public (révélation, fin de partie).
 */
export function pendingTeams(state: GameState): TeamId[] {
  switch (state.phase) {
    case "clues":
      return TEAM_IDS.filter((team) => currentRound(state).transmissions[team].clues === null);
    case "decode": {
      const transmission = currentRound(state).transmissions[state.active];
      const pending: TeamId[] = [];
      // Les adversaires interceptent d'abord, comme dans le jeu officiel.
      if (interceptionAllowed(state) && !transmission.interceptGuess) pending.push(otherTeam(state.active));
      if (!transmission.ownGuess) pending.push(state.active);
      return pending;
    }
    case "tiebreak":
      return TEAM_IDS.filter((team) => !state.tiebreak?.[team]);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Création de partie

export function sanitizeConfig(config: TeamConfig, fallbackName: string): TeamConfig {
  const players = config.players.map((player) => player.trim()).filter(Boolean);
  if (players.length < MIN_PLAYERS) {
    throw new RuleError(`Il faut au moins ${MIN_PLAYERS} joueurs dans l’équipe ${config.name.trim() || fallbackName}.`);
  }
  return { name: config.name.trim().slice(0, 18) || fallbackName, players: players.map((p) => p.slice(0, 16)) };
}

function createRound(number: number, teams: Record<TeamId, Team>, random: Random): Round {
  const transmission = (team: TeamId): Transmission => ({
    encryptor: encryptorFor(teams[team].players, number),
    code: drawCode(random),
    clues: null,
    ownGuess: null,
    interceptGuess: null,
    revealed: false,
  });
  return { number, transmissions: { A: transmission("A"), B: transmission("B") } };
}

export function createGame(config: GameConfig, seed: number): GameState {
  const random = createRandom(seed);
  const a = sanitizeConfig(config.teams.A, "AMBRE");
  const b = sanitizeConfig(config.teams.B, "VERT");
  const words = shuffle(WORDS, random).slice(0, 8);
  const teams: Record<TeamId, Team> = {
    A: { ...a, words: words.slice(0, 4), interceptions: 0, miscommunications: 0 },
    B: { ...b, words: words.slice(4, 8), interceptions: 0, miscommunications: 0 },
  };
  const round = createRound(1, teams, random);
  return {
    version: 1,
    seed: random.seed,
    phase: "clues",
    settings: { ...DEFAULT_SETTINGS, ...config.settings },
    teams,
    rounds: [round],
    active: "A",
    clueDeadline: null,
    tiebreak: null,
    result: null,
  };
}

// ---------------------------------------------------------------------------
// Actions

export type Action =
  | { type: "submitClues"; team: TeamId; clues: string[]; now: number; force?: boolean }
  | { type: "submitGuess"; team: TeamId; guess: number[]; round: number; active: TeamId }
  | { type: "continue"; round: number; active: TeamId }
  | { type: "submitTiebreak"; team: TeamId; guesses: string[] }
  | { type: "rematch"; seed: number };

export function validateClues(state: GameState, team: TeamId, clues: string[]): string[] {
  if (clues.length !== 3) throw new RuleError("Il faut exactement trois indices.");
  const cleaned = clues.map((clue) => clue.trim().replace(/\s+/g, " "));
  if (cleaned.some((clue) => !clue)) throw new RuleError("Les trois indices sont nécessaires.");
  if (cleaned.some((clue) => clue.length > MAX_CLUE_LENGTH)) {
    throw new RuleError(`Un indice ne doit pas dépasser ${MAX_CLUE_LENGTH} caractères.`);
  }
  const normalized = cleaned.map(normalize);
  if (new Set(normalized).size !== 3) throw new RuleError("Les trois indices doivent être différents.");

  const keywords = state.teams[team].words.map(normalize);
  for (const clue of normalized) {
    const parts = clue.split(" ");
    const keyword = keywords.find((word) => clue === word || parts.includes(word));
    if (keyword) throw new RuleError("Un mot-clé ne peut pas apparaître dans un indice.");
  }

  const used = new Set(
    state.rounds.flatMap((round) => round.transmissions[team].clues ?? []).map(normalize),
  );
  const repeated = cleaned.find((_, index) => used.has(normalized[index]));
  if (repeated) throw new RuleError(`L’indice « ${repeated} » a déjà été donné dans cette partie.`);
  return cleaned;
}

function submitClues(state: GameState, action: Extract<Action, { type: "submitClues" }>): GameState {
  if (state.phase !== "clues") throw new RuleError("Ce n’est plus le moment de transmettre des indices.");
  const round = currentRound(state);
  const transmission = round.transmissions[action.team];
  if (transmission.clues) return state; // Déjà transmis : action rejouée, on ignore.

  let clues: string[];
  if (action.force) {
    if (!state.clueDeadline || action.now < state.clueDeadline) {
      throw new RuleError("Le sablier n’est pas encore écoulé.");
    }
    clues = [0, 1, 2].map((index) => (action.clues[index] ?? "").trim().slice(0, MAX_CLUE_LENGTH) || BLANK_CLUE);
  } else {
    clues = validateClues(state, action.team, action.clues);
  }

  const next = structuredClone(state);
  const nextRound = currentRound(next);
  nextRound.transmissions[action.team].clues = clues;
  const other = nextRound.transmissions[otherTeam(action.team)];
  if (!other.clues) {
    if (state.settings.timerSeconds > 0 && !state.clueDeadline) {
      next.clueDeadline = action.now + state.settings.timerSeconds * 1000;
    }
  } else {
    next.phase = "decode";
    next.active = "A";
    next.clueDeadline = null;
  }
  return next;
}

function submitGuess(state: GameState, action: Extract<Action, { type: "submitGuess" }>): GameState {
  const round = currentRound(state);
  if (state.phase !== "decode" || round.number !== action.round || state.active !== action.active) {
    return state; // Action périmée (déjà résolue sur l’autre appareil).
  }
  if (!isValidCode(action.guess)) throw new RuleError("Composez un code de trois chiffres différents.");
  const own = action.team === state.active;
  if (!own && !interceptionAllowed(state)) throw new RuleError("Pas d’interception pendant la première manche.");

  const next = structuredClone(state);
  const transmission = currentRound(next).transmissions[state.active];
  if (own) {
    if (transmission.ownGuess) return state;
    transmission.ownGuess = [...action.guess] as Code;
  } else {
    if (transmission.interceptGuess) return state;
    transmission.interceptGuess = [...action.guess] as Code;
  }

  const complete = transmission.ownGuess && (!interceptionAllowed(next) || transmission.interceptGuess);
  if (complete) {
    transmission.revealed = true;
    next.phase = "reveal";
    if (!sameCode(transmission.ownGuess, transmission.code)) next.teams[state.active].miscommunications += 1;
    if (interceptionAllowed(next) && sameCode(transmission.interceptGuess, transmission.code)) {
      next.teams[otherTeam(state.active)].interceptions += 1;
    }
  }
  return next;
}

function pointsResult(state: GameState): GameResult | null {
  const a = score(state.teams.A);
  const b = score(state.teams.B);
  if (a === b) return null;
  return { winner: a > b ? "A" : "B", reason: "points" };
}

/** Vérification de fin de manche (après les deux transmissions). */
export function endOfRoundResult(state: GameState): GameResult | "tiebreak" | null {
  const { A, B } = state.teams;
  const aWins = A.interceptions >= 2 || B.miscommunications >= 2;
  const bWins = B.interceptions >= 2 || A.miscommunications >= 2;
  if (aWins !== bWins) {
    const winner: TeamId = aWins ? "A" : "B";
    const loser = otherTeam(winner);
    const reason: WinReason =
      state.teams[winner].interceptions >= 2 ? "interceptions" : state.teams[loser].miscommunications >= 2 ? "miscommunications" : "points";
    return { winner, reason };
  }
  if (aWins || currentRound(state).number >= state.settings.maxRounds) {
    return pointsResult(state) ?? "tiebreak";
  }
  return null;
}

function continueGame(state: GameState, action: Extract<Action, { type: "continue" }>): GameState {
  if (state.phase !== "reveal" || currentRound(state).number !== action.round || state.active !== action.active) {
    return state;
  }
  const next = structuredClone(state);
  if (state.active === "A") {
    next.active = "B";
    next.phase = "decode";
    return next;
  }
  const outcome = endOfRoundResult(state);
  if (outcome === "tiebreak") {
    next.phase = "tiebreak";
    next.tiebreak = { A: null, B: null };
    return next;
  }
  if (outcome) {
    next.phase = "over";
    next.result = outcome;
    return next;
  }
  const random = createRandom(state.seed);
  next.rounds.push(createRound(currentRound(state).number + 1, next.teams, random));
  next.seed = random.seed;
  next.phase = "clues";
  next.active = "A";
  next.clueDeadline = null;
  return next;
}

export function tiebreakScore(guesses: readonly string[], words: readonly string[]): number {
  const targets = new Set(words.map(normalize));
  const found = new Set(guesses.map(normalize).filter((guess) => targets.has(guess)));
  return found.size;
}

function submitTiebreak(state: GameState, action: Extract<Action, { type: "submitTiebreak" }>): GameState {
  if (state.phase !== "tiebreak" || !state.tiebreak) return state;
  if (state.tiebreak[action.team]) return state;
  if (action.guesses.length !== 4) throw new RuleError("Proposez quatre mots.");
  const next = structuredClone(state);
  next.tiebreak![action.team] = action.guesses.map((guess) => guess.trim().slice(0, MAX_CLUE_LENGTH));
  const { A, B } = next.tiebreak!;
  if (A && B) {
    const scores = { A: tiebreakScore(A, next.teams.B.words), B: tiebreakScore(B, next.teams.A.words) };
    next.phase = "over";
    next.result =
      scores.A === scores.B
        ? { winner: "draw", reason: "draw", tiebreakScores: scores }
        : { winner: scores.A > scores.B ? "A" : "B", reason: "tiebreak", tiebreakScores: scores };
  }
  return next;
}

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "submitClues":
      return submitClues(state, action);
    case "submitGuess":
      return submitGuess(state, action);
    case "continue":
      return continueGame(state, action);
    case "submitTiebreak":
      return submitTiebreak(state, action);
    case "rematch":
      return createGame(
        {
          teams: {
            A: { name: state.teams.A.name, players: state.teams.A.players },
            B: { name: state.teams.B.name, players: state.teams.B.players },
          },
          settings: state.settings,
        },
        action.seed,
      );
  }
}
