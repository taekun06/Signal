import { useEffect, useState } from "preact/hooks";
import { useImmersion } from "../fx/display";
import { play, vibrate } from "../fx/feedback";
import { type Code, type GameState, type TeamId, notebook } from "../game/rules";
import { DecryptText, LETTERS, TypeText, reducedMotion } from "./kit";

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
  armed = false,
  onColumn,
  onPending,
  onDragPending,
}: {
  state: GameState;
  team: TeamId;
  showWords?: boolean;
  compact?: boolean;
  /** Indices de la manche en cours, placés à titre d’essai dans une colonne. */
  pending?: { clue: string; position: number | null }[];
  /** Un indice est pris en main : toucher une colonne l’y range. */
  armed?: boolean;
  onColumn?: (position: number) => void;
  /** Toucher un indice déjà rangé (par sa lettre : 0 pour A). */
  onPending?: (row: number) => void;
  /** Reprendre un indice déjà rangé pour le glisser ailleurs. */
  onDragPending?: (event: PointerEvent, row: number) => void;
}) {
  const columns = notebook(state, team);
  const words = state.teams[team].words;
  const placed = pending.map((p, row) => ({ ...p, row }));
  return (
    <div class={`notebook${compact ? " notebook--compact" : ""}${armed ? " is-armed" : ""}`} data-tint={team}>
      {columns.map((entries, index) => (
        <div
          class={`notebook__col${placed.some((p) => p.position === index + 1) ? " is-target" : ""}`}
          key={index}
          data-drop-col={onColumn ? index + 1 : undefined}
          onClick={onColumn && armed ? () => onColumn(index + 1) : undefined}
        >
          <div class="notebook__head">
            <b>{index + 1}</b>
            {showWords && <small>{words[index]}</small>}
          </div>
          <ul>
            {entries.length === 0 && !placed.some((p) => p.position === index + 1) && <li class="notebook__empty">—</li>}
            {entries.map((entry) => (
              <li key={`${entry.round}-${entry.clue}`}>
                <sup>{entry.round}</sup>
                {entry.clue}
              </li>
            ))}
            {placed
              .filter((p) => p.position === index + 1)
              .map((p) => (
                <li
                  key={`pending-${p.row}-${p.clue}`}
                  class={`notebook__pending${onPending ? " is-live" : ""}`}
                  role={onPending ? "button" : undefined}
                  aria-label={onPending ? `Retirer l’indice ${LETTERS[p.row]} de la colonne ${index + 1}` : undefined}
                  onPointerDown={onDragPending ? (event) => onDragPending(event, p.row) : undefined}
                  onClick={
                    onPending
                      ? (event) => {
                          // Indice en main : le toucher le range dans cette même colonne.
                          if (armed) return;
                          event.stopPropagation();
                          onPending(p.row);
                        }
                      : undefined
                  }
                >
                  <i>{LETTERS[p.row]}</i>
                  {p.clue}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glisser un indice : l’indice se détache sous le doigt, suit le pouce et se
// range dans la colonne du carnet où on le lâche. Un simple toucher le prend
// en main sans le déplacer.

const DRAG_START_PX = 8;

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let el = node?.parentElement ?? null; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

function dropColumnAt(x: number, y: number): HTMLElement | null {
  for (const node of document.elementsFromPoint(x, y)) {
    const col = (node as HTMLElement).closest?.("[data-drop-col]") as HTMLElement | null;
    if (col) return col;
  }
  return null;
}

export function dragClue(
  event: PointerEvent,
  label: string,
  { onDrop, onTap }: { onDrop: (position: number) => void; onTap?: () => void },
): void {
  if (event.button !== 0) return;
  const source = event.currentTarget as HTMLElement;
  const x0 = event.clientX;
  const y0 = event.clientY;
  const id = event.pointerId;
  let ghost: HTMLElement | null = null;
  let hover: HTMLElement | null = null;
  let frame = 0;
  let lastY = y0;
  const scroller = scrollParent(source);

  const setHover = (col: HTMLElement | null) => {
    if (col === hover) return;
    hover?.classList.remove("is-hover");
    hover = col;
    if (col) {
      col.classList.add("is-hover");
      play("tick");
      vibrate(4);
    }
  };

  // Le doigt près du bord haut ou bas fait défiler l’écran vers le carnet.
  const edgeScroll = () => {
    frame = 0;
    if (!ghost || !scroller) return;
    const box = scroller.getBoundingClientRect();
    const edge = 56;
    const speed = lastY < box.top + edge ? -(box.top + edge - lastY) : lastY > box.bottom - edge ? lastY - (box.bottom - edge) : 0;
    if (speed) {
      scroller.scrollTop += Math.max(-18, Math.min(18, speed / 3));
      frame = requestAnimationFrame(edgeScroll);
    }
  };

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    if (!ghost) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START_PX) return;
      // Le fantôme vit hors du tube : il emporte les couleurs de l’équipe.
      const style = getComputedStyle(source);
      ghost = document.createElement("div");
      ghost.className = "clue-ghost";
      ghost.textContent = label;
      for (const name of ["--ph", "--hi", "--bg", "--glow"]) ghost.style.setProperty(name, style.getPropertyValue(name));
      document.body.appendChild(ghost);
      source.classList.add("is-lifted");
      play("grab");
      vibrate(10);
    }
    ev.preventDefault();
    lastY = ev.clientY;
    ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    setHover(dropColumnAt(ev.clientX, ev.clientY));
    if (!frame) frame = requestAnimationFrame(edgeScroll);
  };

  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    cancelAnimationFrame(frame);
    source.classList.remove("is-lifted");
    const target = hover;
    setHover(null);
    if (!ghost) {
      if (ev.type === "pointerup") onTap?.();
      return;
    }
    ghost.remove();
    if (target && ev.type === "pointerup") onDrop(Number(target.dataset.dropCol));
    else play("fade");
  };

  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

// ---------------------------------------------------------------------------
// Choix du code : pour chaque indice, on choisit sa position (1 à 4).

export function GuessPicker({
  clues,
  value,
  onChange,
  animate = true,
  armed = null,
  onArm,
}: {
  clues: string[];
  value: (number | null)[];
  onChange: (next: (number | null)[]) => void;
  animate?: boolean;
  /** Indice pris en main (touché), en attente d’une colonne du carnet. */
  armed?: number | null;
  /** Rend les indices saisissables : on les glisse sous une colonne du carnet. */
  onArm?: (row: number | null) => void;
}) {
  const [immersion] = useImmersion();
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
        <div class={`picker__row${value[row] ? " is-set" : ""}${armed === row ? " is-armed" : ""}`} key={row}>
          <span
            class={`picker__grab${onArm ? " is-draggable" : ""}`}
            role={onArm ? "button" : undefined}
            tabIndex={onArm ? 0 : undefined}
            aria-pressed={onArm ? armed === row : undefined}
            aria-label={onArm ? `Indice ${LETTERS[row]} : ${clue}. Glisser sous un numéro du carnet.` : undefined}
            onPointerDown={
              onArm
                ? (event) =>
                    dragClue(event, clue, {
                      onDrop: (digit) => {
                        onArm(null);
                        place(value, onChange, row, digit);
                      },
                      onTap: () => {
                        play("select");
                        onArm(armed === row ? null : row);
                      },
                    })
                : undefined
            }
            onKeyDown={
              onArm
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onArm(armed === row ? null : row);
                    }
                  }
                : undefined
            }
          >
            <span class="picker__ord">{LETTERS[row]}</span>
            <span class="picker__clue">{!animate ? (
                clue
              ) : immersion === "new" ? (
                <DecryptText text={clue} delay={250 + row * 750} step={85} />
              ) : (
                <TypeText text={clue} delay={250 + row * 650} speed={55} bell />
              )}</span>
          </span>
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

/** Range l’indice `row` sous `digit` ; l’indice qui s’y trouvait est libéré. */
export function place(value: (number | null)[], onChange: (next: (number | null)[]) => void, row: number, digit: number) {
  const next = value.map((current) => (current === digit ? null : current));
  next[row] = digit;
  play("place");
  vibrate([8, 30, 14]);
  onChange(next);
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
