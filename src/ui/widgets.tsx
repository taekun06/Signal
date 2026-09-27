import { useEffect, useState } from "preact/hooks";
import { play, vibrate } from "../fx/feedback";
import { type Code, type GameState, type TeamId, notebook } from "../game/rules";
import { LETTERS, TypeText, reducedMotion } from "./kit";

// ---------------------------------------------------------------------------
// Les quatre mots-clés d’une équipe.

export function KeywordGrid({ words, highlight = [] }: { words: string[]; highlight?: number[] }) {
  return (
    <ol class="keywords">
      {words.map((word, index) => (
        <li key={word} class={highlight.includes(index + 1) ? "is-lit" : ""}>
          <span class="keywords__num">{index + 1}</span>
          <span class={`keywords__word${word.length > 10 ? " is-long" : ""}`}>{word}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Carnet : indices déjà révélés, rangés sous les positions 1 à 4.

export function Notebook({
  state,
  team,
  showWords = false,
  compact = false,
  pending = [],
}: {
  state: GameState;
  team: TeamId;
  showWords?: boolean;
  compact?: boolean;
  /** Indices de la manche en cours, placés à titre d’essai dans une colonne. */
  pending?: { clue: string; position: number | null }[];
}) {
  const columns = notebook(state, team);
  const words = state.teams[team].words;
  return (
    <div class={`notebook${compact ? " notebook--compact" : ""}`} data-tint={team}>
      {columns.map((entries, index) => (
        <div class={`notebook__col${pending.some((p) => p.position === index + 1) ? " is-target" : ""}`} key={index}>
          <div class="notebook__head">
            <b>{index + 1}</b>
            {showWords && <small>{words[index]}</small>}
          </div>
          <ul>
            {entries.length === 0 && !pending.some((p) => p.position === index + 1) && <li class="notebook__empty">—</li>}
            {entries.map((entry) => (
              <li key={`${entry.round}-${entry.clue}`}>
                <sup>{entry.round}</sup>
                {entry.clue}
              </li>
            ))}
            {pending
              .filter((p) => p.position === index + 1)
              .map((p) => (
                <li key={`pending-${p.clue}`} class="notebook__pending">
                  + {p.clue} ?
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Choix du code : pour chaque indice, on choisit sa position (1 à 4).

export function GuessPicker({
  clues,
  value,
  onChange,
  animate = true,
}: {
  clues: string[];
  value: (number | null)[];
  onChange: (next: (number | null)[]) => void;
  animate?: boolean;
}) {
  const pick = (row: number, digit: number) => {
    const next = value.map((current) => (current === digit ? null : current));
    next[row] = value[row] === digit ? null : digit;
    play("key");
    vibrate(6);
    onChange(next);
  };
  return (
    <div class="picker">
      {clues.map((clue, row) => (
        <div class={`picker__row${value[row] ? " is-set" : ""}`} key={row}>
          <span class="picker__ord">{LETTERS[row]}</span>
          <span class="picker__clue">{animate ? <TypeText text={clue} delay={250 + row * 650} speed={55} bell /> : clue}</span>
          <span class="picker__digits" role="group" aria-label={`Position de l’indice ${clue}`}>
            {[1, 2, 3, 4].map((digit) => (
              <button
                type="button"
                key={digit}
                class={value[row] === digit ? "is-on" : value.includes(digit) ? "is-used" : ""}
                aria-pressed={value[row] === digit}
                onClick={() => pick(row, digit)}
              >
                {digit}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CodeDigits({ code, compare }: { code: (number | null)[]; compare?: Code }) {
  return (
    <span class="digits">
      {code.map((digit, index) => (
        <b
          key={index}
          class={compare && digit ? (digit === compare[index] ? "is-ok" : "is-bad") : digit ? "" : "is-empty"}
        >
          {digit ?? "_"}
        </b>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Code en compteur mécanique : chaque rouleau défile puis s’arrête sur son chiffre.

const REEL_SPINS = 3;

export function MechanicalCode({ code, labels, delay = 0 }: { code: Code; labels?: string[]; delay?: number }) {
  const [started, setStarted] = useState(reducedMotion());
  useEffect(() => {
    if (reducedMotion()) return;
    const timers = [window.setTimeout(() => setStarted(true), delay)];
    code.forEach((_, index) => timers.push(window.setTimeout(() => play("reel"), delay + 700 + index * 350)));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div class="reels">
      {code.map((digit, index) => {
        // Rouleau 1-2-3-4 répété ; on s’arrête sur la dernière occurrence du chiffre.
        const strip = Array.from({ length: REEL_SPINS * 4 }, (_, i) => ((i + index) % 4) + 1);
        const stop = strip.lastIndexOf(digit);
        return (
          <div class="reel" key={index}>
            {labels && <i class="reel__label">INDICE {LETTERS[index]}</i>}
            <div class="reel__window">
              <div
                class="reel__strip"
                style={{
                  transform: started ? `translateY(calc(${-stop} * var(--reel-h)))` : "translateY(0)",
                  transitionDelay: `${index * 350}ms`,
                }}
              >
                {strip.map((n, i) => (
                  <span key={i}>{n}</span>
                ))}
              </div>
            </div>
            {labels && <span class="reel__clue">{labels[index]}</span>}
          </div>
        );
      })}
    </div>
  );
}
