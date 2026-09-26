import { useEffect, useRef, useState } from "preact/hooks";
import { glitch, play, vibrate } from "../fx/feedback";
import {
  type Action,
  type GameState,
  type TeamId,
  MAX_CLUE_LENGTH,
  RuleError,
  currentRound,
  interceptionAllowed,
  otherTeam,
  sameCode,
} from "../game/rules";
import { Button, Countdown, Panel, TeamTag, TypeText, ordinal } from "./kit";
import { CodeDigits, GuessPicker, HoldToReveal, KeywordGrid, Notebook } from "./widgets";

export interface ScreenProps {
  state: GameState;
  team: TeamId;
  dispatch: (action: Action) => GameState;
  toast: (message: string) => void;
}

/** Exécute une action et transforme une erreur de règle en message. */
function attempt(run: () => void, toast: (message: string) => void): boolean {
  try {
    run();
    return true;
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    play("error");
    vibrate([30, 40, 30]);
    toast(error.message);
    return false;
  }
}

const teamName = (state: GameState, team: TeamId) => state.teams[team].name.toUpperCase();

// ---------------------------------------------------------------------------
// Passage du téléphone (mode un seul téléphone)

export function HandoffScreen({ state, team, onReady }: { state: GameState; team: TeamId; onReady: () => void }) {
  const round = currentRound(state);
  const name = teamName(state, team);
  let title = `ÉQUIPE ${name}`;
  let lines: string[];
  let cta = `PRÊT · ÉQUIPE ${name}`;

  if (state.phase === "clues") {
    const encryptor = round.transmissions[team].encryptor;
    title = "TRANSMISSION CHIFFRÉE";
    lines = [
      `Passe le téléphone à ${encryptor.toUpperCase()}, crypteur de l’équipe ${name}.`,
      "Les autres joueurs détournent le regard.",
    ];
    cta = `JE SUIS ${encryptor.toUpperCase()}`;
  } else if (state.phase === "decode" && team === state.active) {
    lines = [
      `Équipe ${name} : décodez votre propre signal.`,
      `${round.transmissions[team].encryptor} a chiffré ce message et reste silencieux.`,
    ];
  } else if (state.phase === "decode") {
    lines = [`Équipe ${name} : interceptez le signal de l’équipe ${teamName(state, otherTeam(team))}.`];
  } else {
    lines = [`Équipe ${name} : retrouvez les quatre mots de l’équipe ${teamName(state, otherTeam(team))}.`];
  }

  return (
    <div class="screen screen--center handoff">
      <div class="handoff__signal" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p class="eyebrow">MANCHE {String(round.number).padStart(2, "0")} · ÉCRAN VERROUILLÉ</p>
      <h1 class="display">
        <TypeText text={title} speed={45} />
      </h1>
      {lines.map((line, index) => (
        <p class="lead" key={index}>
          {line}
        </p>
      ))}
      <Button onClick={onReady} class="btn--big" sound="send">
        {cta}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le crypteur compose ses trois indices.

export function CluesScreen({ state, team, dispatch, toast }: ScreenProps) {
  const round = currentRound(state);
  const transmission = round.transmissions[team];
  const words = state.teams[team].words;
  const [clues, setClues] = useState(["", "", ""]);
  const [visible, setVisible] = useState(false);
  const cluesRef = useRef(clues);
  cluesRef.current = clues;

  const send = () => {
    if (attempt(() => dispatch({ type: "submitClues", team, clues, now: Date.now() }), toast)) {
      play("send");
      vibrate([20, 30, 60]);
    }
  };

  // Sablier écoulé : les indices en cours partent tels quels.
  useEffect(() => {
    if (!state.clueDeadline) return;
    const delay = Math.max(0, state.clueDeadline - Date.now());
    const id = window.setTimeout(() => {
      play("alarm");
      attempt(() => dispatch({ type: "submitClues", team, clues: cluesRef.current, now: Date.now(), force: true }), toast);
    }, delay + 50);
    return () => clearTimeout(id);
  }, [state.clueDeadline]);

  const filled = clues.every((clue) => clue.trim());

  return (
    <div class="screen screen--split">
      <div class="screen__side">
        <p class="prompt">
          &gt; CRYPTEUR : <TypeText text={transmission.encryptor.toUpperCase()} speed={60} cursor />
        </p>
        <KeywordGrid words={words} highlight={visible ? transmission.code : []} />
        <HoldToReveal code={transmission.code} words={words} onChange={setVisible} />
      </div>
      <div class="screen__main">
        <Panel title={<>INDICES À TRANSMETTRE <Countdown deadline={state.clueDeadline} /></>}>
          <p class="hint">Un indice par chiffre du code, dans l’ordre. Pas de mot-clé, pas d’indice déjà donné.</p>
          <div class="clue-inputs">
            {clues.map((clue, index) => (
              <label class="clue-input" key={index}>
                <span class="clue-input__ord">{ordinal(index)}</span>
                <input
                  id={`clue-${index}`}
                  value={clue}
                  maxLength={MAX_CLUE_LENGTH}
                  autocomplete="off"
                  autoCapitalize="characters"
                  spellcheck={false}
                  placeholder={visible ? `→ ${words[transmission.code[index] - 1]}` : "indice…"}
                  onInput={(event) => {
                    play("key");
                    const next = [...clues];
                    next[index] = (event.currentTarget as HTMLInputElement).value;
                    setClues(next);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const nextInput = document.getElementById(`clue-${index + 1}`);
                    if (nextInput) nextInput.focus();
                    else if (filled) send();
                  }}
                />
              </label>
            ))}
          </div>
        </Panel>
        <Button onClick={send} disabled={!filled} sound={null} class="btn--big">
          TRANSMETTRE ▶
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Décodage allié ou interception

export function DecodeScreen({ state, team, dispatch, toast }: ScreenProps) {
  const round = currentRound(state);
  const active = state.active;
  const own = team === active;
  const transmission = round.transmissions[active];
  const [guess, setGuess] = useState<(number | null)[]>([null, null, null]);
  const [showNotebook, setShowNotebook] = useState(!own);
  const complete = guess.every((digit) => digit !== null);

  const lock = () => {
    if (attempt(() => dispatch({ type: "submitGuess", team, guess: guess as number[], round: round.number, active }), toast)) {
      play("lock");
      vibrate(40);
    }
  };

  return (
    <div class="screen screen--split">
      <div class="screen__side">
        <p class="prompt">
          &gt; {own ? "DÉCODAGE ALLIÉ" : "INTERCEPTION"}
          {!own && (
            <>
              {" "}
              · <TeamTag team={active} state={state} />
            </>
          )}
        </p>
        {own ? (
          <>
            <KeywordGrid words={state.teams[team].words} />
            <p class="hint">{transmission.encryptor} a chiffré ce message et ne participe pas.</p>
            {round.number > 1 && (
              <button type="button" class="linkish" onClick={() => setShowNotebook(!showNotebook)}>
                {showNotebook ? "▾ MASQUER" : "▸ AFFICHER"} NOS INDICES PRÉCÉDENTS
              </button>
            )}
            {showNotebook && round.number > 1 && <Notebook state={state} team={team} showWords compact />}
          </>
        ) : (
          <>
            <p class="hint">Le carnet range sous chaque position les indices déjà révélés de l’équipe {teamName(state, active)}.</p>
            <Notebook state={state} team={active} />
          </>
        )}
      </div>
      <div class="screen__main">
        <Panel title={`SIGNAL ${teamName(state, active)} · MANCHE ${round.number}`}>
          <p class="hint">Pour chaque indice, choisissez la position du mot-clé qu’il désigne.</p>
          <GuessPicker clues={transmission.clues ?? []} value={guess} onChange={setGuess} />
        </Panel>
        <div class="lock-row">
          <CodeDigits code={guess} />
          <Button onClick={lock} disabled={!complete} sound={null} class="btn--big">
            VERROUILLER
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Révélation publique d’une transmission

export function RevealScreen({ state, onContinue }: { state: GameState; onContinue: () => void }) {
  const round = currentRound(state);
  const active = state.active;
  const opponent = otherTeam(active);
  const transmission = round.transmissions[active];
  const withIntercept = interceptionAllowed(state);
  const understood = sameCode(transmission.ownGuess, transmission.code);
  const intercepted = withIntercept && sameCode(transmission.interceptGuess, transmission.code);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (intercepted || !understood) {
        glitch();
        play(intercepted ? "intercept" : "fail");
        vibrate([80, 40, 80, 40, 160]);
      } else {
        play("success");
        vibrate(60);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div class="screen screen--split">
      <div class="screen__side">
        <p class="prompt">&gt; RÉVÉLATION · <TeamTag team={active} state={state} /></p>
        <div class="reveal-code">
          <span class="eyebrow">CODE RÉEL</span>
          <CodeDigits code={transmission.code} />
        </div>
        <div class="verdicts">
          <p class={`verdict ${understood ? "is-ok" : "is-bad"}`}>
            <TypeText
              delay={700}
              text={understood ? `DÉCODAGE RÉUSSI · ÉQUIPE ${teamName(state, active)}` : `MALENTENDU · ÉQUIPE ${teamName(state, active)} +1 MALENTENDU`}
            />
          </p>
          {withIntercept && (
            <p class={`verdict ${intercepted ? "is-bad" : "is-ok"}`} data-tint={opponent}>
              <TypeText
                delay={1300}
                text={intercepted ? `INTERCEPTION ! ÉQUIPE ${teamName(state, opponent)} +1 INTERCEPTION` : `INTERCEPTION RATÉE · ÉQUIPE ${teamName(state, opponent)}`}
              />
            </p>
          )}
          {!withIntercept && <p class="hint">Pas d’interception en première manche.</p>}
        </div>
      </div>
      <div class="screen__main">
        <Panel title="DÉTAIL">
          <table class="reveal-table">
            <thead>
              <tr>
                <th>INDICE</th>
                <th>CODE</th>
                <th data-tint={active}>{teamName(state, active).slice(0, 6)}</th>
                {withIntercept && <th data-tint={opponent}>{teamName(state, opponent).slice(0, 6)}</th>}
              </tr>
            </thead>
            <tbody>
              {(transmission.clues ?? []).map((clue, index) => (
                <tr key={index}>
                  <td class="reveal-table__clue">{clue}</td>
                  <td class="reveal-table__code">{transmission.code[index]}</td>
                  <td class={transmission.ownGuess?.[index] === transmission.code[index] ? "is-ok" : "is-bad"}>
                    {transmission.ownGuess?.[index]}
                  </td>
                  {withIntercept && (
                    <td class={transmission.interceptGuess?.[index] === transmission.code[index] ? "is-ok" : "is-bad"}>
                      {transmission.interceptGuess?.[index]}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Button onClick={onContinue} class="btn--big">
          {active === "A" ? `SIGNAL SUIVANT : ${teamName(state, "B")} ▶` : "FIN DE LA MANCHE ▶"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Départage : retrouver les mots adverses

export function TiebreakScreen({ state, team, dispatch, toast }: ScreenProps) {
  const opponent = otherTeam(team);
  const [guesses, setGuesses] = useState(["", "", "", ""]);
  const filled = guesses.every((guess) => guess.trim());
  const send = () => {
    if (attempt(() => dispatch({ type: "submitTiebreak", team, guesses }), toast)) play("lock");
  };
  return (
    <div class="screen screen--split">
      <div class="screen__side">
        <p class="prompt">&gt; DÉPARTAGE</p>
        <p class="lead">Égalité parfaite. L’équipe qui retrouve le plus de mots-clés adverses l’emporte.</p>
        <Notebook state={state} team={opponent} />
      </div>
      <div class="screen__main">
        <Panel title={`MOTS DE L’ÉQUIPE ${teamName(state, opponent)}`}>
          <div class="clue-inputs">
            {guesses.map((guess, index) => (
              <label class="clue-input" key={index}>
                <span class="clue-input__ord">{index + 1}</span>
                <input
                  id={`tb-${index}`}
                  value={guess}
                  maxLength={MAX_CLUE_LENGTH}
                  autocomplete="off"
                  spellcheck={false}
                  placeholder="mot-clé ?"
                  onInput={(event) => {
                    play("key");
                    const next = [...guesses];
                    next[index] = (event.currentTarget as HTMLInputElement).value;
                    setGuesses(next);
                  }}
                />
              </label>
            ))}
          </div>
        </Panel>
        <Button onClick={send} disabled={!filled} sound={null} class="btn--big">
          VERROUILLER
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fin de partie

const REASONS: Record<string, string> = {
  interceptions: "Deux interceptions réussies.",
  miscommunications: "L’équipe adverse a accumulé deux malentendus.",
  points: "Victoire aux points : interceptions moins malentendus.",
  tiebreak: "Victoire au départage : plus de mots-clés adverses retrouvés.",
  draw: "Égalité parfaite, même au départage.",
};

export function GameOverScreen({ state, onRematch, onMenu }: { state: GameState; onRematch: () => void; onMenu: () => void }) {
  const result = state.result!;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      play("victory");
      vibrate([100, 60, 100, 60, 300]);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div class="screen screen--split">
      <div class="screen__side">
        <p class="eyebrow">FIN DE TRANSMISSION · MANCHE {currentRound(state).number}</p>
        <h1 class="display display--xl">
          {result.winner === "draw" ? (
            <TypeText text="ÉGALITÉ" speed={70} cursor />
          ) : (
            <>
              <TypeText text="VICTOIRE" speed={70} />
              <span class="winner" data-tint={result.winner}>
                <TypeText text={teamName(state, result.winner)} delay={650} speed={70} cursor />
              </span>
            </>
          )}
        </h1>
        <p class="lead">{REASONS[result.reason]}</p>
        {result.tiebreakScores && (
          <p class="hint">
            Mots retrouvés : {teamName(state, "A")} {result.tiebreakScores.A} · {teamName(state, "B")} {result.tiebreakScores.B}
          </p>
        )}
        <div class="actions">
          <Button onClick={onMenu} variant="ghost">MENU</Button>
          <Button onClick={onRematch} class="btn--big">REVANCHE</Button>
        </div>
      </div>
      <div class="screen__main">
        {(["A", "B"] as TeamId[]).map((team) => (
          <Panel key={team} title={<TeamTag team={team} state={state} />}>
            <Notebook state={state} team={team} showWords compact />
          </Panel>
        ))}
      </div>
    </div>
  );
}
