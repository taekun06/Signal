import { useState } from "preact/hooks";
import { toggleFullscreen, useDevice } from "../fx/device";
import { useKeyboardKind, useScreenShape } from "../fx/display";
import { setSoundEnabled, soundEnabled } from "../fx/feedback";
import { type TeamId, currentRound, endOfRoundResult, pendingTeams } from "../game/rules";
import { type LocalSave, randomSeed, useLocalGame } from "../net/localGame";
import { Button, Crt, HeaderBar, PowerCycle, RoundSteps, teamMark } from "./kit";
import { CluesScreen, DecodeScreen, GameOverScreen, HandoffScreen, RevealScreen, SummaryScreen, TiebreakScreen } from "./screens";
import { useToast } from "./toast";

/** Partie à deux équipes sur un seul téléphone qu’on se passe. */
export function LocalGame({ initial, onExit }: { initial: LocalSave; onExit: () => void }) {
  const { state, holder, dispatch, setHolder } = useLocalGame(initial);
  const [toastNode, toast] = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [sound, setSound] = useState(soundEnabled());
  const [shape, setShape] = useScreenShape();
  const [keyboard, setKeyboard] = useKeyboardKind();
  const device = useDevice();
  // Bilan affiché entre deux manches (numéro de la manche terminée).
  const [summary, setSummary] = useState<number | null>(null);

  const round = currentRound(state);
  const actor: TeamId | undefined = pendingTeams(state)[0];
  const task = actor ? `${actor}:${state.phase}:${round.number}:${state.active}` : null;
  const handoff = task !== null && task !== holder;

  let tint: TeamId = actor ?? state.active;
  if (state.phase === "over" && state.result && state.result.winner !== "draw") tint = state.result.winner;

  const showSummary = summary === round.number && state.phase === "reveal";
  const screenId = [state.phase, round.number, state.active, actor ?? "-", handoff ? "handoff" : "play", showSummary ? "summary" : ""].join(":");

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
      "BILAN DE LA MANCHE ▶"
    );

  // Écrans calés sur la hauteur du tube (sans défilement) : saisie des indices
  // avec le clavier en bas, et passage du téléphone en plein écran.
  const fit = !showSummary && (handoff || (actor !== undefined && state.phase === "clues"));

  let content;
  if (showSummary) {
    content = (
      <SummaryScreen
        state={state}
        onContinue={() => {
          setSummary(null);
          continueReveal();
        }}
      />
    );
  } else if (handoff) {
    content = <HandoffScreen state={state} team={actor} onReady={() => setHolder(task)} />;
  } else if (actor && state.phase === "clues") {
    content = <CluesScreen state={state} team={actor} dispatch={dispatch} toast={toast} />;
  } else if (actor && state.phase === "decode") {
    content = <DecodeScreen state={state} team={actor} dispatch={dispatch} toast={toast} />;
  } else if (actor && state.phase === "tiebreak") {
    content = <TiebreakScreen state={state} team={actor} dispatch={dispatch} toast={toast} />;
  } else if (state.phase === "reveal") {
    content = (
      <RevealScreen
        state={state}
        continueLabel={revealLabel}
        onContinue={() => (state.active === "B" && !endsGame ? setSummary(round.number) : continueReveal())}
      />
    );
  } else {
    content = (
      <GameOverScreen state={state} onRematch={() => dispatch({ type: "rematch", seed: randomSeed() })} onMenu={onExit} />
    );
  }

  return (
    <Crt tint={tint}>
      <div class={`app-frame app-frame--game${fit ? " is-fit" : ""}`}>
        <div class="hud-row">
          <HeaderBar state={state} label={state.phase === "tiebreak" ? "DÉPARTAGE" : undefined} focus={actor} />
          <button type="button" class="menu-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
            ≡
          </button>
        </div>
        {state.phase !== "over" && state.phase !== "tiebreak" && !showSummary && <RoundSteps state={state} />}
        <PowerCycle id={screenId} offOn={handoff}>
          {content}
        </PowerCycle>
        {toastNode}
        {menuOpen && (
          <div class="overlay" role="dialog" aria-modal="true" aria-label="Menu de la partie">
            <div class="overlay__box">
              <p class="prompt">&gt; PAUSE</p>
              {!confirmQuit ? (
                <>
                  <Button onClick={() => setMenuOpen(false)}>REPRENDRE</Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSoundEnabled(!sound);
                      setSound(!sound);
                    }}
                  >
                    SON : {sound ? "ACTIVÉ" : "COUPÉ"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShape(shape === "curved" ? "flat" : "curved")}>
                    ÉCRAN : {shape === "curved" ? "BOMBÉ" : "PLAT"}
                  </Button>
                  <Button variant="ghost" onClick={() => setKeyboard(keyboard === "retro" ? "native" : "retro")}>
                    CLAVIER : {keyboard === "retro" ? "RÉTRO" : "TÉLÉPHONE"}
                  </Button>
                  {device.canFullscreen && (
                    <Button variant="ghost" onClick={() => void toggleFullscreen()}>
                      PLEIN ÉCRAN : {device.fullscreen ? "ACTIVÉ" : "DÉSACTIVÉ"}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setConfirmQuit(true)}>
                    QUITTER LA PARTIE
                  </Button>
                  <p class="hint">La partie est sauvegardée sur ce téléphone : tu pourras la reprendre depuis le menu.</p>
                </>
              ) : (
                <>
                  <p class="lead">Revenir au menu principal ?</p>
                  <Button variant="danger" onClick={onExit}>
                    OUI, QUITTER
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmQuit(false)}>
                    ANNULER
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Crt>
  );
}
