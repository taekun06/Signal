import { useEffect } from "preact/hooks";
import { play, vibrate } from "../fx/feedback";

// Clavier de terminal ambre (AZERTY), utilisé pour taper les indices.

const ROWS = [
  ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
  ["W", "X", "C", "V", "B", "N", "É", "È", "'", "-"],
];

export type KeyboardInput = { type: "char"; char: string } | { type: "backspace" } | { type: "next" };

export function RetroKeyboard({ onInput, nextLabel = "SUIVANT ↵" }: { onInput: (input: KeyboardInput) => void; nextLabel?: string }) {
  const press = (input: KeyboardInput) => {
    play("key");
    vibrate(6);
    onInput(input);
  };

  // Un clavier physique (ordinateur) fonctionne aussi.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Backspace") press({ type: "backspace" });
      else if (event.key === "Enter") press({ type: "next" });
      else if (event.key.length === 1 && /[\p{L}\p{N} '\-]/u.test(event.key)) press({ type: "char", char: event.key.toUpperCase() });
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div class="retro-kb" role="group" aria-label="Clavier">
      {ROWS.map((row, index) => (
        <div class="retro-kb__row" key={index}>
          {row.map((key) => (
            <button
              type="button"
              key={key}
              class="retro-kb__key"
              onPointerDown={(event) => {
                event.preventDefault();
                press({ type: "char", char: key });
              }}
              onKeyDown={(event) => event.key === "Enter" && press({ type: "char", char: key })}
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div class="retro-kb__row retro-kb__row--wide">
        <button
          type="button"
          class="retro-kb__key retro-kb__key--fn"
          aria-label="Effacer"
          onPointerDown={(event) => {
            event.preventDefault();
            press({ type: "backspace" });
          }}
        >
          ⌫
        </button>
        <button
          type="button"
          class="retro-kb__key retro-kb__key--space"
          onPointerDown={(event) => {
            event.preventDefault();
            press({ type: "char", char: " " });
          }}
        >
          ESPACE
        </button>
        <button
          type="button"
          class="retro-kb__key retro-kb__key--fn"
          onPointerDown={(event) => {
            event.preventDefault();
            press({ type: "next" });
          }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
