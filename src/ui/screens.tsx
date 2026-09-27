import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { PHOSPHOR, runOscilloscope } from "../fx/canvasFx";
import { useImmersion, useKeyboardKind } from "../fx/display";
import { morse, play, scramble, vibrate } from "../fx/feedback";
import {
  type Action,
  type GameState,
  type TeamId,
  MAX_CLUE_LENGTH,
  RuleError,
  applyAction,
  currentRound,
  encryptorFor,
  interceptionAllowed,
  otherTeam,
  sameCode,
} from "../game/rules";
import { PixelIcon } from "./icons";
import { type KeyboardInput, RetroKeyboard } from "./keyboard";
import { Button, Countdown, LETTERS, Panel, TeamTag, TypeText, reducedMotion, teamMark } from "./kit";
import { CodeDigits, GuessPicker, KeywordGrid, MechanicalCode, Notebook } from "./widgets";

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
  const other = teamName(state, otherTeam(team));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Tout l’écran devient celui d’un oscilloscope : le signal part vers l’autre main.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stop = () => {};
    const start = () => {
      stop();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.offsetWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.offsetHeight * dpr));
      stop = runOscilloscope(canvas, PHOSPHOR[team], 0.3);
    };
    start();
    // Téléphone tourné : la trace repart aux nouvelles proportions.
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(start, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      stop();
    };
  }, [team]);

  let caption = "DONNE LE TÉLÉPHONE À L’ÉQUIPE";
  let who = name;
  let sub: string;
  let warn: string;
  let cta = `PRÊT · ${name}`;
  if (state.phase === "clues") {
    const encryptor = round.transmissions[team].encryptor.toUpperCase();
    caption = "DONNE LE TÉLÉPHONE À";
    who = encryptor;
    sub = `crypteur de l’équipe ${teamMark(team)} ${name}`;
    warn = "Tous les autres détournent le regard.";
    cta = `JE SUIS ${encryptor}`;
  } else if (state.phase === "decode" && team === state.active) {
    sub = "décodez votre propre signal";
    warn = `${round.transmissions[team].encryptor} a chiffré ce message et reste silencieux.`;
  } else if (state.phase === "decode") {
    sub = `interceptez le signal de l’équipe ${other}`;
    warn = "Le carnet vous montre leurs anciens indices.";
  } else {
    sub = `retrouvez les quatre mots de l’équipe ${other}`;
    warn = "Dernière chance de départager les équipes.";
  }

  return (
    <div class="screen handoff">
      <canvas class="handoff__trace" ref={canvasRef} aria-hidden="true" />
      <span class="handoff__grat" aria-hidden="true" />
      <div class="handoff__ui">
        <div class="handoff__read" aria-hidden="true">
          <span>CH1 · 2 V/DIV</span>
          <span class="handoff__live">● TRANSMISSION</span>
          <span>5 ms/DIV</span>
        </div>
        <div class="handoff__who">
          <span class="eyebrow">{caption}</span>
          <h1 class="handoff__name">
            <TypeText text={who} speed={70} />
          </h1>
          <span class="handoff__sub">{sub}</span>
        </div>
        <p class="handoff__warn">
          <PixelIcon name="eye" size={18} />
          {warn}
        </p>
        <Button onClick={onReady} class="btn--big" sound="send">
          {cta} ▶
        </Button>
      </div>
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
  const [active, setActiveState] = useState(0);
  const activeRef = useRef(0);
  const setActive = (index: number) => {
    activeRef.current = index;
    setActiveState(index);
  };
  const [keyboard, setKeyboard] = useKeyboardKind();
  const retro = keyboard === "retro";
  const cluesRef = useRef(clues);
  cluesRef.current = clues;

  // Transmettre ouvre la liaison : on vérifie d’abord les indices (sans rien
  // envoyer), puis le crypteur maintient l’émission jusqu’au bout.
  const [transmitting, setTransmitting] = useState(false);
  const [immersion] = useImmersion();
  const rich = immersion === "new";
  const send = () => {
    const current = cluesRef.current;
    if (!rich) {
      // Écran d’avant : envoi direct, le message part en morse (initiales des indices).
      if (attempt(() => dispatch({ type: "submitClues", team, clues: current, now: Date.now() }), toast)) {
        morse(current.map((clue) => clue.trim()[0] ?? "").join(""));
      }
      return;
    }
    if (attempt(() => applyAction(state, { type: "submitClues", team, clues: current, now: Date.now() }), toast)) {
      hide(false);
      play("select");
      setTransmitting(true);
    }
  };
  const transmit = () => attempt(() => dispatch({ type: "submitClues", team, clues: cluesRef.current, now: Date.now() }), toast);

  // Sur les petits écrans, la ligne en cours reste visible au-dessus du clavier.
  useEffect(() => {
    if (!retro) return;
    document.querySelector(".clue-row.is-active")?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [active, visible, retro]);

  const onKey = (input: KeyboardInput) => {
    // Refs : plusieurs touches peuvent arriver avant le rendu suivant.
    const active = activeRef.current;
    const next = [...cluesRef.current];
    if (input.type === "char") {
      if (next[active].length >= MAX_CLUE_LENGTH || (input.char === " " && !next[active])) return;
      next[active] += input.char;
      cluesRef.current = next;
      setClues(next);
    } else if (input.type === "backspace") {
      next[active] = next[active].slice(0, -1);
      cluesRef.current = next;
      setClues(next);
    } else if (active < 2) {
      setActive(active + 1);
    } else if (next.every((clue) => clue.trim())) {
      send();
    } else {
      setActive(next.findIndex((clue) => !clue.trim()));
    }
  };

  // Le code est tracé par le faisceau, puis s’efface avec la rémanence du
  // phosphore : on le voit encore une seconde après l’avoir masqué.
  const [decay, setDecay] = useState(false);
  const decayTimer = useRef(0);
  const show = () => {
    clearTimeout(decayTimer.current);
    setDecay(false);
    play(rich ? "beam" : "select");
    vibrate(rich ? 15 : 12);
    setVisible(true);
  };
  const hide = (fade = true) => {
    setVisible(false);
    clearTimeout(decayTimer.current);
    if (!fade || !rich || reducedMotion()) {
      setDecay(false);
      if (fade) play("key");
      return;
    }
    play("fade");
    setDecay(true);
    decayTimer.current = window.setTimeout(() => setDecay(false), 1400);
  };
  const toggle = () => (visible ? hide() : show());

  // Appui long : le code n’existe que sous le pouce. Appui bref : bascule.
  const peekTimer = useRef(0);
  const peeking = useRef(false);
  const onCodeDown = (event: PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => {
      peeking.current = true;
      if (!visible) show();
    }, 280);
  };
  const onCodeUp = () => {
    clearTimeout(peekTimer.current);
    if (peeking.current) {
      peeking.current = false;
      hide();
    } else toggle();
  };
  const onCodeCancel = () => {
    clearTimeout(peekTimer.current);
    if (peeking.current) {
      peeking.current = false;
      hide();
    }
  };

  // Sécurité : le code disparaît aussitôt si l’application passe en arrière-plan.
  useEffect(() => {
    const onHidden = () => document.hidden && hide(false);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      clearTimeout(decayTimer.current);
      clearTimeout(peekTimer.current);
    };
  }, []);

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

  if (transmitting) {
    return (
      <TransmitView
        state={state}
        team={team}
        clues={clues}
        onDone={() => {
          if (!transmit()) setTransmitting(false);
        }}
        onBack={() => setTransmitting(false)}
      />
    );
  }

  return (
    <div class={`screen clues${retro ? " clues--retro" : ""}${visible ? " is-open" : ""}`}>
      <div class="clues__head">
        <div class="clues__title">
          <p class="prompt">
            &gt; CRYPTEUR : <TypeText text={transmission.encryptor.toUpperCase()} speed={60} cursor />
          </p>
          <Countdown deadline={state.clueDeadline} />
          <button type="button" class="linkish clues__kb-switch" onClick={() => setKeyboard(retro ? "native" : "retro")}>
            {retro ? "⌨ clavier du téléphone" : "⌨ clavier rétro"}
          </button>
        </div>
        <KeywordGrid words={words} highlight={visible ? transmission.code : []} />
        <p class="hint clues-hint">
          Fais deviner chaque mot à ton équipe avec un seul indice. Pas de mot-clé, pas d’indice déjà donné.
        </p>
      </div>
      <button
        type="button"
        class={`code-toggle clues__code${rich ? " is-rich" : ""}${visible ? " is-open" : ""}${decay ? " is-decay" : ""}`}
        onPointerDown={rich ? onCodeDown : undefined}
        onPointerUp={rich ? onCodeUp : undefined}
        onPointerCancel={rich ? onCodeCancel : undefined}
        onContextMenu={(event) => rich && event.preventDefault()}
        onClick={(event) => {
          // Clavier et lecteurs d’écran : pas d’événement de pointeur.
          if (!rich || event.detail === 0) toggle();
        }}
        aria-pressed={visible}
      >
        <span class="code-toggle__name">CODE SECRET</span>
        <span class="code-toggle__digits">
          {transmission.code.map((digit, index) => (
            <b key={index} style={{ "--i": index }}>
              {visible || decay ? digit : "?"}
            </b>
          ))}
        </span>
        <span class="code-toggle__label">{visible ? "◉ MASQUER" : rich ? "◎ MAINTENIR POUR VOIR" : "◎ TOUCHER POUR AFFICHER"}</span>
      </button>
      <div class="clue-rows clues__rows">
        {clues.map((clue, index) => {
          const digit = transmission.code[index];
          const label = visible ? `Ton indice pour ${words[digit - 1]}` : `Indice ${LETTERS[index]}`;
          return (
            <div class={`clue-row${visible ? " is-open" : ""}${retro && active === index ? " is-active" : ""}`} key={index}>
              <span class="clue-row__target" aria-hidden={!visible}>
                <b>{visible ? digit : "?"}</b>
                <span class={visible && words[digit - 1].length > 9 ? "is-long" : undefined}>{visible ? words[digit - 1] : "••••"}</span>
              </span>
              <span class="clue-row__field">
                <small>{label}</small>
                {retro ? (
                  <button type="button" class="clue-row__screen" aria-label={`${label} : ${clue || "vide"}`} onClick={() => setActive(index)}>
                    {clue}
                    {active === index && <span class="cursor">▌</span>}
                  </button>
                ) : (
                  <input
                    id={`clue-${index}`}
                    value={clue}
                    maxLength={MAX_CLUE_LENGTH}
                    autocomplete="off"
                    autoCapitalize="characters"
                    spellcheck={false}
                    enterKeyHint={index < 2 ? "next" : "send"}
                    placeholder="…"
                    aria-label={label}
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
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div class="clues__send">
        {retro ? (
          <RetroKeyboard
            onInput={onKey}
            action={active < 2 ? "SUIVANT ↵" : "TRANSMETTRE ▶"}
            actionReady={active < 2 || filled}
          />
        ) : (
          <Button onClick={send} disabled={!filled} sound={null} class="btn--big">
            TRANSMETTRE ▶
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Émission : le crypteur maintient la liaison, ses indices partent en données.

const HOLD_MS = 2600;
const hexOf = (text: string) => [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, "0").toUpperCase());

function TransmitView({
  state,
  team,
  clues,
  onDone,
  onBack,
}: {
  state: GameState;
  team: TeamId;
  clues: string[];
  onDone: () => void;
  onBack: () => void;
}) {
  const words = clues.map((clue) => clue.trim().toUpperCase());
  const [progress, setProgress] = useState(0);
  const [lost, setLost] = useState(false);
  const [dump, setDump] = useState<string[]>([]);
  const holding = useRef(false);
  const raf = useRef(0);
  const doneRef = useRef(false);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    holding.current = false;
  };
  useEffect(() => stop, []);

  const start = (event: PointerEvent | KeyboardEvent) => {
    if (holding.current || doneRef.current) return;
    event.preventDefault();
    if ("pointerId" in event) (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    holding.current = true;
    setLost(false);
    play("modem");
    vibrate(25);
    const t0 = performance.now();
    let row = 0;
    const step = (now: number) => {
      if (!holding.current) return;
      const p = Math.min(1, (now - t0) / (reducedMotion() ? 600 : HOLD_MS));
      setProgress(p);
      // Trame de données qui défile : adresse puis huit octets.
      row += 1;
      if (row % 3 === 0) {
        const line = `${(row * 8).toString(16).padStart(4, "0").toUpperCase()}  ${Array.from({ length: 8 }, () =>
          Math.floor(Math.random() * 256)
            .toString(16)
            .padStart(2, "0")
            .toUpperCase(),
        ).join(" ")}`;
        setDump((lines) => [...lines.slice(-7), line]);
        play("tick");
      }
      if (p >= 1) {
        holding.current = false;
        doneRef.current = true;
        play("send");
        vibrate([30, 50, 30, 50, 160]);
        window.setTimeout(onDone, reducedMotion() ? 0 : 450);
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const release = () => {
    if (!holding.current) return;
    stop();
    if (doneRef.current) return;
    // Lâché trop tôt : la porteuse est perdue, tout est à refaire.
    play("cut");
    vibrate([60, 40, 60]);
    setProgress(0);
    setLost(true);
    setDump([]);
  };

  // Chaque indice se change en octets, lettre après lettre, l’un après l’autre.
  const encoded = words.map((word, index) => {
    const local = Math.max(0, Math.min(1, progress * 3.2 - index * 1.05));
    const n = Math.floor(local * word.length);
    return { plain: word.slice(n), bytes: hexOf(word.slice(0, n)).join("") };
  });

  return (
    <div class="screen transmit">
      <p class="prompt">
        &gt; ÉMISSION · {teamMark(team)} {teamName(state, team)}
      </p>
      <div class="transmit__clues">
        {encoded.map((line, index) => (
          <div class="transmit__clue" key={index}>
            <i>{LETTERS[index]}</i>
            <span>
              {line.bytes && <b>{line.bytes}</b>}
              {line.plain}
            </span>
          </div>
        ))}
      </div>
      <pre class={`transmit__dump${lost ? " is-lost" : ""}`} aria-hidden="true">
        {lost
          ? "!! PORTEUSE PERDUE\n!! transmission interrompue\n\n> maintiens jusqu’au bout"
          : dump.length
            ? dump.join("\n")
            : `-- EN ATTENTE DE PORTEUSE --\n\nPAQUETS  3\nOCTETS   ${words.reduce((n, w) => n + hexOf(w).length, 0)}`}
      </pre>
      <button
        type="button"
        class={`btn btn--primary btn--big hold-btn${progress > 0 ? " is-holding" : ""}`}
        style={{ "--p": progress }}
        onPointerDown={start}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => (event.key === " " || event.key === "Enter") && !event.repeat && start(event)}
        onKeyUp={release}
      >
        <span class="hold-btn__fill" aria-hidden="true" />
        <span class="hold-btn__label">{progress >= 1 ? "TRANSMIS ✓" : progress > 0 ? `ÉMISSION ${Math.round(progress * 100)} %` : "MAINTENIR POUR ÉMETTRE"}</span>
      </button>
      <button type="button" class="linkish transmit__back" onClick={onBack} disabled={progress > 0}>
        ◀ corriger les indices
      </button>
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
  const pending = (transmission.clues ?? []).map((clue, index) => ({ clue, position: guess[index] }));

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
            {showNotebook && round.number > 1 && <Notebook state={state} team={team} showWords compact pending={pending} />}
          </>
        ) : (
          <>
            <p class="hint">
              Chaque colonne cache un mot de l’équipe {teamName(state, active)}. Vos choix s’y placent en direct.
            </p>
            <Notebook state={state} team={active} pending={pending} />
          </>
        )}
      </div>
      <div class="screen__main">
        <Panel title={`SIGNAL ${teamName(state, active)} · MANCHE ${round.number}`}>
          <p class="hint picker-hint">Pour chaque indice, choisissez la position du mot-clé qu’il désigne.</p>
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
// Révélation publique d’une transmission : le code se cale au compteur, puis
// le verdict de l’équipe, puis celui des adversaires.

export function RevealScreen({
  state,
  onContinue,
  continueLabel,
}: {
  state: GameState;
  onContinue: () => void;
  continueLabel: ComponentChildren;
}) {
  const round = currentRound(state);
  const active = state.active;
  const opponent = otherTeam(active);
  const transmission = round.transmissions[active];
  const withIntercept = interceptionAllowed(state);
  const understood = sameCode(transmission.ownGuess, transmission.code);
  const intercepted = withIntercept && sameCode(transmission.interceptGuess, transmission.code);
  const own = state.teams[active];
  const opp = state.teams[opponent];
  const [stage, setStage] = useState(reducedMotion() ? 3 : 0);

  useEffect(() => {
    if (reducedMotion()) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(1900, () => {
      setStage(1);
      if (understood) {
        play("success");
        vibrate(60);
      } else {
        play("fail");
        vibrate([60, 40, 140]);
      }
    });
    if (intercepted) {
      at(2700, () => scramble("INTERCEPTÉ !"));
      at(4200, () => setStage(2));
      at(4700, () => {
        setStage(3);
        play("drop");
        vibrate(35);
      });
    } else {
      at(2700, () => {
        setStage(3);
        if (withIntercept) play("key");
      });
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div class="screen screen--split reveal">
      <div class="screen__side">
        <p class="prompt">
          &gt; RÉVÉLATION · SIGNAL <TeamTag team={active} state={state} />
        </p>
        <div class="reveal__code">
          <span class="eyebrow">LE VRAI CODE ÉTAIT</span>
          <MechanicalCode code={transmission.code} labels={transmission.clues ?? []} delay={250} />
        </div>
      </div>
      <div class="screen__main">
        <section class={`verdict ${understood ? "is-ok" : "is-bad"}${stage >= 1 ? " is-in" : ""}`} data-tint={active}>
          <header class="verdict__head">
            {teamMark(active)} {teamName(state, active)} · DÉCODAGE DE SON PROPRE CODE
          </header>
          <div class="verdict__row">
            <b class="verdict__big">
              <PixelIcon name={understood ? "check" : "cross"} size={26} />
              {understood ? "COMPRIS" : "MALENTENDU"}
            </b>
            {transmission.ownGuess && <CodeDigits code={transmission.ownGuess} compare={transmission.code} />}
          </div>
          <p class="verdict__sub">
            {understood
              ? "Pas de malentendu."
              : `+1 malentendu pour ${teamName(state, active)} : ${own.miscommunications} sur 2.${own.miscommunications >= 2 ? " La défaite menace !" : ""}`}
          </p>
        </section>

        {withIntercept ? (
          <section class={`verdict ${intercepted ? "is-hit" : "is-miss"}${stage >= (intercepted ? 2 : 3) ? " is-in" : ""}`} data-tint={opponent}>
            <header class="verdict__head">
              <span>
                {teamMark(opponent)} {teamName(state, opponent)} · TENTATIVE D’INTERCEPTION
              </span>
              {intercepted && <span class="verdict__plus">+1</span>}
            </header>
            <div class="verdict__row">
              <b class="verdict__big">
                <PixelIcon name={intercepted ? "target" : "cross"} size={26} />
                {intercepted ? "INTERCEPTÉ !" : "RATÉ"}
              </b>
              {intercepted ? (
                <span class={`token-slot${stage >= 3 ? " is-landed" : ""}`} aria-label="Jeton d’interception gagné">
                  <i />
                </span>
              ) : (
                transmission.interceptGuess && <CodeDigits code={transmission.interceptGuess} compare={transmission.code} />
              )}
            </div>
            <p class="verdict__sub">
              {intercepted
                ? `${teamName(state, opponent)} : ${opp.interceptions} interception${opp.interceptions > 1 ? "s" : ""} sur 2.${opp.interceptions >= 2 ? " C’est la deuxième !" : " Encore une et c’est gagné."}`
                : "Le code a tenu bon."}
            </p>
          </section>
        ) : (
          <p class={`verdict verdict--note${stage >= 1 ? " is-in" : ""}`}>Pas d’interception pendant la première manche.</p>
        )}

        <Button onClick={onContinue} class="btn--big">
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bilan de fin de manche : où en sont les deux équipes, d’un coup d’œil.

function teamStatus(interceptions: number, miscommunications: number): { text: string; bad: boolean }[] {
  const lines: { text: string; bad: boolean }[] = [];
  if (interceptions === 1) lines.push({ text: "Encore 1 interception pour gagner !", bad: false });
  if (miscommunications === 1) lines.push({ text: "Danger : encore 1 malentendu et c’est perdu.", bad: true });
  if (!lines.length) lines.push({ text: "Aucun jeton pour l’instant.", bad: false });
  return lines;
}

export function SummaryScreen({ state, onContinue }: { state: GameState; onContinue: () => void }) {
  const round = currentRound(state).number;
  const next = round + 1;
  return (
    <div class="screen screen--split summary">
      <div class="screen__side">
        <span class="eyebrow">BILAN</span>
        <h1 class="display">FIN DE LA MANCHE {round}</h1>
        <div class="rounds" aria-label={`${round} manches jouées sur ${state.settings.maxRounds}`}>
          {Array.from({ length: state.settings.maxRounds }, (_, i) => (
            <i key={i} class={i < round ? "on" : ""} />
          ))}
        </div>
        <p class="hint">
          {round} manche{round > 1 ? "s" : ""} jouée{round > 1 ? "s" : ""} sur {state.settings.maxRounds} au maximum
          {next === state.settings.maxRounds ? " · la prochaine est la dernière !" : "."}
        </p>
        <p class="summary__next">
          Manche {next} · crypteurs :{" "}
          {(["A", "B"] as TeamId[]).map((team, i) => (
            <span key={team} data-tint={team} class="team-tag">
              {i > 0 && " et "}
              {teamMark(team)} {encryptorFor(state.teams[team].players, next).toUpperCase()}
            </span>
          ))}
        </p>
      </div>
      <div class="screen__main">
        {(["A", "B"] as TeamId[]).map((team) => {
          const t = state.teams[team];
          return (
            <section class="summary__team" data-tint={team} key={team}>
              <span class="summary__name">
                {teamMark(team)} {t.name.toUpperCase()}
              </span>
              <span class="summary__row">
                <PixelIcon name="target" size={18} />
                INTERCEPTIONS
                <span class="summary__pips">
                  {[0, 1].map((i) => (
                    <i key={i} class={i < t.interceptions ? "on" : ""} />
                  ))}
                </span>
              </span>
              <span class="summary__row summary__row--bad">
                <PixelIcon name="cross" size={18} />
                MALENTENDUS
                <span class="summary__pips">
                  {[0, 1].map((i) => (
                    <i key={i} class={i < t.miscommunications ? "on" : ""} />
                  ))}
                </span>
              </span>
              {teamStatus(t.interceptions, t.miscommunications).map((line) => (
                <p key={line.text} class={`summary__status${line.bad ? " is-bad" : ""}`}>
                  {line.text}
                </p>
              ))}
            </section>
          );
        })}
        <Button onClick={onContinue} class="btn--big">
          MANCHE {next} ▶
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
  const rounds = state.rounds.filter((round) => round.transmissions.A.revealed || round.transmissions.B.revealed);

  return (
    <div class="screen screen--split victory">
      <div class="screen__side victory__head">
        {result.winner !== "draw" && <PixelIcon name="trophy" size={84} class="victory__trophy" />}
        <h1 class="display display--xl">
          {result.winner === "draw" ? (
            <TypeText text="ÉGALITÉ" speed={70} cursor />
          ) : (
            <>
              <TypeText text="VICTOIRE" speed={70} />
              <span class="winner" data-tint={result.winner}>
                <TypeText text={`${teamMark(result.winner)} ${teamName(state, result.winner)}`} delay={650} speed={70} cursor />
              </span>
            </>
          )}
        </h1>
        <p class="victory__reason">
          {REASONS[result.reason]} · manche {currentRound(state).number}
        </p>
        {result.tiebreakScores && (
          <p class="hint">
            Mots retrouvés : {teamName(state, "A")} {result.tiebreakScores.A} · {teamName(state, "B")} {result.tiebreakScores.B}
          </p>
        )}
      </div>
      <div class="screen__main">
        <Panel title="LA PARTIE EN UN COUP D’ŒIL">
          <div class="timeline" style={{ gridTemplateColumns: `minmax(0, 1.4fr) repeat(${rounds.length}, minmax(0, 1fr))` }}>
            <span />
            {rounds.map((round) => (
              <span key={round.number} class="timeline__head">
                M{round.number}
              </span>
            ))}
            {(["A", "B"] as TeamId[]).map((team) => [
              <span key={`${team}-name`} class="timeline__team" data-tint={team}>
                {teamMark(team)} {teamName(state, team)}
              </span>,
              ...rounds.map((round) => {
                const mine = round.transmissions[team];
                const theirs = round.transmissions[otherTeam(team)];
                const decoded = mine.revealed && sameCode(mine.ownGuess, mine.code);
                const caught = theirs.revealed && round.number > 1 && sameCode(theirs.interceptGuess, theirs.code);
                return (
                  <span key={`${team}-${round.number}`} class={`timeline__cell${caught ? " is-caught" : ""}`} data-tint={team}>
                    {mine.revealed && <PixelIcon name={decoded ? "check" : "cross"} size={14} class={decoded ? "" : "is-bad"} />}
                    {caught && <PixelIcon name="target" size={14} />}
                  </span>
                );
              }),
            ])}
          </div>
          <p class="hint timeline__legend">
            <span>
              <PixelIcon name="check" size={12} /> compris
            </span>
            <span>
              <PixelIcon name="cross" size={12} class="is-bad" /> malentendu
            </span>
            <span>
              <PixelIcon name="target" size={12} /> interception
            </span>
          </p>
        </Panel>
        <Panel title="LES MOTS SECRETS ÉTAIENT">
          {(["A", "B"] as TeamId[]).map((team) => (
            <p key={team} class="victory__words" data-tint={team}>
              {teamMark(team)} {state.teams[team].words.join(" · ")}
            </p>
          ))}
        </Panel>
        <div class="actions">
          <Button onClick={onMenu} variant="ghost">
            MENU
          </Button>
          <Button onClick={onRematch} class="btn--big">
            REVANCHE ▶
          </Button>
        </div>
      </div>
    </div>
  );
}
