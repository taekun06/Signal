import { describe, expect, it } from "vitest";
import {
  type Action,
  type Code,
  type GameState,
  type TeamId,
  applyAction,
  createGame,
  currentRound,
  endOfRoundResult,
  normalize,
  notebook,
  otherTeam,
  pendingTeams,
  RuleError,
  tiebreakScore,
} from "./rules";
import { WORDS } from "./words";

const config = {
  teams: {
    A: { name: "Ambre", players: ["Léa", "Max", "Zoé"] },
    B: { name: "Vert", players: ["Tom", "Inès"] },
  },
  settings: { timerSeconds: 0 },
};

let clueCounter = 0;
const freshClues = () => [0, 1, 2].map(() => `indice${(clueCounter += 1)}`);

const wrongCode = (code: Code): Code => [code[1], code[0], code[2]];

/** Joue une manche complète ; `outcomes` dit qui décode juste et qui intercepte. */
function playRound(
  state: GameState,
  outcomes: Partial<Record<TeamId, { own: boolean; intercepted?: boolean }>> = {},
): GameState {
  const number = currentRound(state).number;
  state = applyAction(state, { type: "submitClues", team: "A", clues: freshClues(), now: 0 });
  state = applyAction(state, { type: "submitClues", team: "B", clues: freshClues(), now: 0 });
  for (const active of ["A", "B"] as TeamId[]) {
    const code = currentRound(state).transmissions[active].code;
    const outcome = outcomes[active] ?? { own: true, intercepted: false };
    if (number > 1) {
      state = applyAction(state, {
        type: "submitGuess",
        team: otherTeam(active),
        guess: outcome.intercepted ? code : wrongCode(code),
        round: number,
        active,
      });
    }
    state = applyAction(state, {
      type: "submitGuess",
      team: active,
      guess: outcome.own ? code : wrongCode(code),
      round: number,
      active,
    });
    expect(state.phase).toBe("reveal");
    state = applyAction(state, { type: "continue", round: number, active });
  }
  return state;
}

describe("liste de mots", () => {
  it("contient assez de mots uniques", () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(500);
    expect(new Set(WORDS.map(normalize)).size).toBe(WORDS.length);
  });
});

describe("création de partie", () => {
  it("distribue 8 mots différents et des codes valides", () => {
    const state = createGame(config, 42);
    const words = [...state.teams.A.words, ...state.teams.B.words];
    expect(new Set(words).size).toBe(8);
    for (const team of ["A", "B"] as TeamId[]) {
      const code = currentRound(state).transmissions[team].code;
      expect(new Set(code).size).toBe(3);
      expect(code.every((digit) => digit >= 1 && digit <= 4)).toBe(true);
    }
    expect(state.phase).toBe("clues");
  });

  it("est déterministe pour une même graine", () => {
    expect(createGame(config, 7)).toEqual(createGame(config, 7));
    expect(createGame(config, 7).teams.A.words).not.toEqual(createGame(config, 8).teams.A.words);
  });

  it("exige deux joueurs par équipe", () => {
    expect(() =>
      createGame({ teams: { A: { name: "A", players: ["Solo", "  "] }, B: config.teams.B } }, 1),
    ).toThrow(RuleError);
  });

  it("fait tourner le crypteur à chaque manche", () => {
    let state = createGame(config, 3);
    const encryptors: string[] = [currentRound(state).transmissions.A.encryptor];
    for (let i = 0; i < 3; i += 1) {
      state = playRound(state);
      encryptors.push(currentRound(state).transmissions.A.encryptor);
    }
    expect(encryptors).toEqual(["Léa", "Max", "Zoé", "Léa"]);
  });
});

describe("indices", () => {
  it("refuse un mot-clé, un doublon ou un indice déjà utilisé", () => {
    let state = createGame(config, 11);
    const keyword = state.teams.A.words[0];
    const submit = (clues: string[]) => applyAction(state, { type: "submitClues", team: "A", clues, now: 0 });
    expect(() => submit([keyword.toLowerCase(), "b", "c"])).toThrow(/mot-clé/);
    expect(() => submit([`le ${keyword}`, "b", "c"])).toThrow(/mot-clé/);
    expect(() => submit(["Mer", "mer ", "c"])).toThrow(/différents/);
    expect(() => submit(["a", "", "c"])).toThrow(/nécessaires/);

    state = applyAction(state, { type: "submitClues", team: "A", clues: ["Écume", "Nuit", "Sel"], now: 0 });
    state = applyAction(state, { type: "submitClues", team: "B", clues: freshClues(), now: 0 });
    expect(state.phase).toBe("decode");
    for (const active of ["A", "B"] as TeamId[]) {
      const code = currentRound(state).transmissions[active].code;
      state = applyAction(state, { type: "submitGuess", team: active, guess: code, round: 1, active });
      state = applyAction(state, { type: "continue", round: 1, active });
    }
    state = playRound(state);
    // Manche 3 : « ecume » a déjà servi (accents et casse ignorés).
    expect(() =>
      applyAction(state, { type: "submitClues", team: "A", clues: ["ecume", "x1", "x2"], now: 0 }),
    ).toThrow(/déjà été donné/);
  });

  it("déclenche le sablier au premier envoi et autorise l’envoi forcé ensuite", () => {
    let state = createGame({ ...config, settings: { timerSeconds: 30 } }, 5);
    state = applyAction(state, { type: "submitClues", team: "B", clues: freshClues(), now: 1000 });
    expect(state.clueDeadline).toBe(31_000);
    const force: Action = { type: "submitClues", team: "A", clues: ["Brume"], now: 20_000, force: true };
    expect(() => applyAction(state, force)).toThrow(/sablier/);
    state = applyAction(state, { ...force, now: 31_000 });
    expect(currentRound(state).transmissions.A.clues).toEqual(["Brume", "—", "—"]);
    expect(state.phase).toBe("decode");
    expect(state.clueDeadline).toBeNull();
  });
});

describe("décodage", () => {
  it("pas d’interception en manche 1", () => {
    let state = createGame(config, 9);
    state = applyAction(state, { type: "submitClues", team: "A", clues: freshClues(), now: 0 });
    state = applyAction(state, { type: "submitClues", team: "B", clues: freshClues(), now: 0 });
    expect(pendingTeams(state)).toEqual(["A"]);
    const code = currentRound(state).transmissions.A.code;
    expect(() =>
      applyAction(state, { type: "submitGuess", team: "B", guess: code, round: 1, active: "A" }),
    ).toThrow(/première manche/);
  });

  it("l’interception se fait avant le décodage allié à partir de la manche 2", () => {
    let state = playRound(createGame(config, 9));
    state = applyAction(state, { type: "submitClues", team: "A", clues: freshClues(), now: 0 });
    state = applyAction(state, { type: "submitClues", team: "B", clues: freshClues(), now: 0 });
    expect(pendingTeams(state)).toEqual(["B", "A"]);
  });

  it("compte malentendus et interceptions et remplit le carnet", () => {
    let state = playRound(createGame(config, 21), { A: { own: false } });
    expect(state.teams.A.miscommunications).toBe(1);
    state = playRound(state, { B: { own: true, intercepted: true } });
    expect(state.teams.A.interceptions).toBe(1);
    const columns = notebook(state, "B");
    expect(columns.flat()).toHaveLength(6);
    expect(columns.flat().every((entry) => entry.round <= 2)).toBe(true);
  });

  it("ignore une action rejouée ou périmée", () => {
    let state = createGame(config, 4);
    state = applyAction(state, { type: "submitClues", team: "A", clues: freshClues(), now: 0 });
    const again = applyAction(state, { type: "submitClues", team: "A", clues: freshClues(), now: 0 });
    expect(again).toBe(state);
    expect(applyAction(state, { type: "continue", round: 1, active: "A" })).toBe(state);
  });

  it("refuse un code invalide", () => {
    let state = createGame(config, 4);
    state = applyAction(state, { type: "submitClues", team: "A", clues: freshClues(), now: 0 });
    state = applyAction(state, { type: "submitClues", team: "B", clues: freshClues(), now: 0 });
    expect(() =>
      applyAction(state, { type: "submitGuess", team: "A", guess: [1, 1, 2], round: 1, active: "A" }),
    ).toThrow(RuleError);
  });
});

describe("fin de partie", () => {
  it("deux interceptions font gagner", () => {
    let state = playRound(createGame(config, 1));
    state = playRound(state, { A: { own: true, intercepted: true } });
    expect(state.phase).toBe("clues");
    state = playRound(state, { A: { own: true, intercepted: true } });
    expect(state.phase).toBe("over");
    expect(state.result).toEqual({ winner: "B", reason: "interceptions" });
  });

  it("deux malentendus font perdre", () => {
    let state = playRound(createGame(config, 1), { B: { own: false } });
    state = playRound(state, { B: { own: false } });
    expect(state.result).toEqual({ winner: "A", reason: "miscommunications" });
  });

  it("la vérification n’a lieu qu’en fin de manche", () => {
    let state = playRound(createGame(config, 1), { A: { own: false } });
    state = applyAction(state, { type: "submitClues", team: "A", clues: freshClues(), now: 0 });
    state = applyAction(state, { type: "submitClues", team: "B", clues: freshClues(), now: 0 });
    const code = currentRound(state).transmissions.A.code;
    state = applyAction(state, { type: "submitGuess", team: "B", guess: wrongCode(code), round: 2, active: "A" });
    state = applyAction(state, { type: "submitGuess", team: "A", guess: wrongCode(code), round: 2, active: "A" });
    state = applyAction(state, { type: "continue", round: 2, active: "A" });
    expect(state.teams.A.miscommunications).toBe(2);
    expect(state.phase).toBe("decode");
    expect(state.active).toBe("B");
  });

  it("conditions simultanées : départage aux points", () => {
    let state = playRound(createGame(config, 2), { A: { own: false }, B: { own: false } });
    state = playRound(state, { A: { own: false }, B: { own: false, intercepted: true } });
    // Les deux équipes ont 2 malentendus ; A a intercepté une fois : -1 contre -2.
    expect(state.result).toEqual({ winner: "A", reason: "points" });
  });

  it("égalité parfaite → départage par les mots, puis égalité", () => {
    let state = playRound(createGame(config, 2), { A: { own: false }, B: { own: false } });
    state = playRound(state, { A: { own: false }, B: { own: false } });
    expect(endOfRoundResult(state)).toBe("tiebreak");
    expect(state.phase).toBe("tiebreak");
    expect(pendingTeams(state)).toEqual(["A", "B"]);
    const aWords = state.teams.A.words;
    const bWords = state.teams.B.words;
    state = applyAction(state, { type: "submitTiebreak", team: "A", guesses: [bWords[0].toLowerCase(), "x", "y", "z"] });
    state = applyAction(state, { type: "submitTiebreak", team: "B", guesses: [aWords[1], "x", "y", "z"] });
    expect(state.phase).toBe("over");
    expect(state.result).toEqual({ winner: "draw", reason: "draw", tiebreakScores: { A: 1, B: 1 } });
  });

  it("huit manches sans vainqueur → points", () => {
    let state = createGame(config, 12);
    state = playRound(state, { A: { own: false } });
    for (let i = 0; i < 7; i += 1) state = playRound(state);
    expect(state.phase).toBe("over");
    expect(state.result).toEqual({ winner: "B", reason: "points" });
  });

  it("le score de départage ignore l’ordre, les accents et les doublons", () => {
    expect(tiebreakScore(["volcan", "VOLCAN", "eléphant", "x"], ["ÉLÉPHANT", "VOLCAN", "A", "B"])).toBe(2);
  });

  it("revanche : mêmes équipes, nouveaux mots", () => {
    const state = playRound(createGame(config, 30));
    const next = applyAction(state, { type: "rematch", seed: 31 });
    expect(next.teams.A.players).toEqual(state.teams.A.players);
    expect(next.rounds).toHaveLength(1);
    expect(next.teams.A.interceptions).toBe(0);
  });
});
