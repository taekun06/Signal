import { useEffect, useRef, useState } from "preact/hooks";
import { play, vibrate } from "../fx/feedback";
import { type Code, type GameState, type TeamId, notebook } from "../game/rules";
import { TypeText, ordinal } from "./kit";

// ---------------------------------------------------------------------------
// Les quatre mots-clés d’une équipe.

export function KeywordGrid({ words, highlight = [] }: { words: string[]; highlight?: number[] }) {
  return (
    <ol class="keywords">
      {words.map((word, index) => (
        <li key={word} class={highlight.includes(index + 1) ? "is-lit" : ""}>
          <span class="keywords__num">{index + 1}</span>
          <span class="keywords__word">{word}</span>
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
}: {
  state: GameState;
  team: TeamId;
  showWords?: boolean;
  compact?: boolean;
}) {
  const columns = notebook(state, team);
  const words = state.teams[team].words;
  return (
    <div class={`notebook${compact ? " notebook--compact" : ""}`} data-tint={team}>
      {columns.map((entries, index) => (
        <div class="notebook__col" key={index}>
          <div class="notebook__head">
            <b>{index + 1}</b>
            {showWords && <small>{words[index]}</small>}
          </div>
          <ul>
            {entries.length === 0 && <li class="notebook__empty">—</li>}
            {entries.map((entry) => (
              <li key={`${entry.round}-${entry.clue}`}>
                <sup>{entry.round}</sup>
                {entry.clue}
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
          <span class="picker__ord">{ordinal(row)}</span>
          <span class="picker__clue">{animate ? <TypeText text={clue} delay={250 + row * 650} speed={55} /> : clue}</span>
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
// Code secret visible uniquement tant que le doigt reste appuyé.

export function HoldToReveal({ code, words, onChange }: { code: Code; words: string[]; onChange?: (visible: boolean) => void }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const set = (next: boolean) => {
    if (next === visible) return;
    setVisible(next);
    onChange?.(next);
    if (next) {
      play("select");
      vibrate(12);
    }
  };

  // Sécurité : masquer si l’application passe en arrière-plan.
  useEffect(() => {
    const hide = () => document.hidden && set(false);
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  });

  return (
    <button
      ref={ref}
      type="button"
      class={`vault${visible ? " is-open" : ""}`}
      aria-label="Maintenir pour afficher le code secret"
      onPointerDown={(event) => {
        event.preventDefault();
        ref.current?.setPointerCapture?.(event.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onKeyDown={(event) => (event.key === " " || event.key === "Enter") && set(true)}
      onKeyUp={() => set(false)}
      onBlur={() => set(false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span class="vault__cells">
        {code.map((digit, index) => (
          <span class="vault__cell" key={index}>
            <b>{visible ? digit : "?"}</b>
            <small>{visible ? words[digit - 1] : ordinal(index)}</small>
          </span>
        ))}
      </span>
      <span class="vault__hint">{visible ? "RELÂCHER POUR MASQUER" : "▼ MAINTENIR POUR VOIR LE CODE ▼"}</span>
    </button>
  );
}
