import { useState } from "preact/hooks";
import { type TeamId, currentRound, encryptorFor, endOfRoundResult, otherTeam, pendingTeams } from "../game/rules";
import { type LocalSave, randomSeed, useLocalGame } from "../net/localGame";
import { Crt, HeaderBar, PowerCycle, RoundSteps, teamMark } from "./kit";
import { CluesScreen, DecodeScreen, GameOverScreen, HandoffScreen, RevealScreen, TiebreakScreen } from "./screens";
import { CarnetPull } from "./Carnet";
import { PauseMenu } from "./PauseMenu";
import { useToast } from "./toast";

/** Partie à deux équipes sur un seul téléphone qu’on se passe. */
export function LocalGame({ initial, onExit }: { initial: LocalSave; onExit: () => void }) {
  const { state, holder, dispatch, setHolder } = useLocalGame(initial);
  const [toastNode, toast] = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  const round = currentRound(state);
  const actor: TeamId | undefined = pendingTeams(state)[0];
  const task = actor ? `${actor}:${state.phase}:${round.number}:${state.active}` : null;
  // L’écran d’interception ne montre rien de secret : pas besoin de passage,
  // l’équipe qui intercepte prend le téléphone posé au milieu.
  const intercepting = state.phase === "decode" && actor !== undefined && actor !== state.active;
  const handoff = task !== null && task !== holder && !intercepting;

  let tint: TeamId = actor ?? state.active;
  if (state.phase === "over" && state.result && state.result.winner !== "draw") tint = state.result.winner;


  // Tension vue par l’équipe à l’écran : au bord de la défaite (un malentendu
  // de plus, ou une interception adverse de plus, et c’est perdu), ou fin de
  // partie proche.
  const me = state.teams[tint];
  const them = state.teams[otherTeam(tint)];
  const tension =
    state.phase === "over"
      ? 0
      : me.miscommunications >= 1 || them.interceptions >= 1
        ? 2
        : round.number >= state.settings.maxRounds - 1 || me.interceptions >= 1
          ? 1
          : 0;
  const screenId = [state.phase, round.number, state.active, actor ?? "-", handoff ? "handoff" : "play"].join(":");

  const continueReveal = () => dispatch({ type: "continue", round: round.number, active: state.active });
  const endsGame = state.phase === "reveal" && state.active === "B" && endOfRoundResult(state) !== null;
  const revealLabel =
    state.active === "A" ? (
      <>
        SIGNAL SUIVANT ▶
        <small>
          au tour de l’équipe {teamMark("B")} {state.teams.B.name.toUpperCase()}
        </small>
      </>
    ) : endsGame ? (
      "RÉSULTAT FINAL ▶"
    ) : (
      // Le bilan tient dans le bandeau : on enchaîne directement sur la manche suivante.
      <>
        MANCHE {round.number + 1} ▶
        <small>
          crypteurs : {encryptorFor(state.teams.A.players, round.number + 1)} et {encryptorFor(state.teams.B.players, round.number + 1)}
          {round.number + 1 === state.settings.maxRounds ? " · dernière manche" : ""}
        </small>
      </>
    );

  // Écrans calés sur la hauteur du tube (sans défilement) : saisie des indices
  // avec le clavier en bas, et passage du téléphone en plein écran.
  const fit = handoff || (actor !== undefined && state.phase === "clues");

  let content;
  if (handoff) {
    content = <HandoffScreen state={state} team={actor} onReady={() => setHolder(task)} />;
  } else if (actor && state.phase === "clues") {
    content = <CluesScreen state={state} team={actor} dispatch={dispatch} toast={toast} />;
  } else if (actor && state.phase === "decode") {
    content = <DecodeScreen state={state} team={actor} dispatch={dispatch} toast={toast} announce={intercepting} />;
  } else if (actor && state.phase === "tiebreak") {
    content = <TiebreakScreen state={state} team={actor} dispatch={dispatch} toast={toast} />;
  } else if (state.phase === "reveal") {
    content = (
      <RevealScreen
        state={state}
        continueLabel={revealLabel}
        onContinue={continueReveal}
      />
    );
  } else {
    content = (
      <GameOverScreen state={state} onRematch={() => dispatch({ type: "rematch", seed: randomSeed() })} onMenu={onExit} />
    );
  }

  return (
    <Crt tint={tint} tension={tension}>
      <div class={`app-frame app-frame--game${fit ? " is-fit" : ""}`}>
        <div class="hud-row">
          <CarnetPull state={state} viewer={handoff ? undefined : actor}>
            <HeaderBar state={state} label={state.phase === "tiebreak" ? "DÉPARTAGE" : undefined} focus={actor} />
          </CarnetPull>
          <button type="button" class="menu-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
            ≡
          </button>
        </div>
        {state.phase !== "over" && state.phase !== "tiebreak" && <RoundSteps state={state} />}
        <PowerCycle id={screenId} offOn={handoff}>
          {content}
        </PowerCycle>
        {toastNode}
        {menuOpen && (
          <PauseMenu
            onClose={() => setMenuOpen(false)}
            onQuit={onExit}
            note="La partie est sauvegardée sur ce téléphone : tu pourras la reprendre depuis le menu."
          />
        )}
      </div>
    </Crt>
  );
}
