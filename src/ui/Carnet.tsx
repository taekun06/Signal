import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { play, vibrate } from "../fx/feedback";
import { type GameState, type TeamId, TEAM_IDS, currentRound, notebook, otherTeam } from "../game/rules";
import { teamMark } from "./kit";

// ---------------------------------------------------------------------------
// Carnet des indices : les indices révélés restent gravés dans le phosphore,
// de plus en plus pâles avec l’âge. Il ne montre jamais de mot-clé, seulement
// ce que toute la table a déjà vu : on peut donc l’ouvrir à tout moment.

type Notes = Record<string, string[]>;

// La graine change à chaque manche ; les mots-clés, eux, identifient la partie.
const notesKey = (state: GameState) => `signal-zero:carnet:${TEAM_IDS.map((team) => state.teams[team].words.join(",")).join("|")}`;

function loadNotes(state: GameState): Notes {
  try {
    const raw = localStorage.getItem(notesKey(state));
    if (raw) return JSON.parse(raw);
  } catch {
    /* Pas de notes. */
  }
  return {};
}

/**
 * Bandeau des scores qu’on tire vers le bas (ou qu’on touche) pour ouvrir le
 * carnet. `viewer` est l’équipe qui tient le téléphone : ses hypothèses
 * s’affichent, et le carnet s’ouvre sur l’équipe adverse.
 */
export function CarnetPull({ state, viewer, children }: { state: GameState; viewer?: TeamId; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const drag = useRef<{ y: number; id: number; done: boolean } | null>(null);

  const show = () => {
    if (open) return;
    play("static");
    vibrate(12);
    setOpen(true);
  };

  return (
    <>
      <div
        class="hud-pull"
        role="button"
        tabIndex={0}
        aria-label="Ouvrir le carnet des indices"
        aria-expanded={open}
        onPointerDown={(event) => {
          drag.current = { y: event.clientY, id: event.pointerId, done: false };
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.done || current.id !== event.pointerId) return;
          if (event.clientY - current.y > 26) {
            current.done = true;
            show();
          }
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          drag.current = null;
          // Un simple appui ouvre aussi le carnet.
          if (current && !current.done && Math.abs(event.clientY - current.y) < 8) show();
        }}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            show();
          }
        }}
      >
        {children}
        <span class="hud-pull__grip" aria-hidden="true">
          ▾ CARNET
        </span>
      </div>
      {open && <Carnet state={state} viewer={viewer} onClose={() => setOpen(false)} />}
    </>
  );
}

function Carnet({ state, viewer, onClose }: { state: GameState; viewer?: TeamId; onClose: () => void }) {
  const [target, setTarget] = useState<TeamId>(viewer ? otherTeam(viewer) : "A");
  const [notes, setNotes] = useState(() => loadNotes(state));
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ y: number; id: number } | null>(null);
  const round = currentRound(state).number;

  const close = () => {
    if (closing) return;
    play("select");
    setClosing(true);
    window.setTimeout(onClose, 220);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const columns = notebook(state, target);
  const latest = Math.max(0, ...columns.flat().map((entry) => entry.round));
  const noteId = viewer ? `${viewer}>${target}` : null;
  const teamNotes = (noteId && notes[noteId]) || ["", "", "", ""];
  const setNote = (index: number, value: string) => {
    if (!noteId) return;
    const next = { ...notes, [noteId]: teamNotes.map((note, i) => (i === index ? value : note)) };
    setNotes(next);
    try {
      localStorage.setItem(notesKey(state), JSON.stringify(next));
    } catch {
      /* Non bloquant. */
    }
  };

  return (
    <div class={`carnet${closing ? " is-closing" : ""}`} onClick={close}>
      <section
        class="carnet__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Carnet des indices"
        onClick={(event) => event.stopPropagation()}
      >
        <header
          class="carnet__head"
          onPointerDown={(event) => {
            drag.current = { y: event.clientY, id: event.pointerId };
            (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            // Glisser vers le haut referme le carnet.
            if (drag.current && drag.current.id === event.pointerId && drag.current.y - event.clientY > 26) {
              drag.current = null;
              close();
            }
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <p class="prompt">&gt; CARNET · MANCHE {String(round).padStart(2, "0")}</p>
          <button type="button" class="linkish" onClick={close}>
            ▴ FERMER
          </button>
        </header>
        <div class="carnet__tabs" role="tablist">
          {TEAM_IDS.map((team) => (
            <button
              type="button"
              role="tab"
              key={team}
              data-tint={team}
              aria-selected={target === team}
              onClick={() => {
                play("key");
                setTarget(team);
              }}
            >
              {teamMark(team)} {state.teams[team].name.toUpperCase()}
              {viewer && <small>{team === viewer ? "nos indices" : "à intercepter"}</small>}
            </button>
          ))}
        </div>
        <div class="carnet__grid" data-tint={target}>
          {columns.map((entries, index) => (
            <div class="carnet__col" key={`${target}-${index}`}>
              <b class="carnet__num">{index + 1}</b>
              {noteId && (
                <input
                  class="carnet__note"
                  id={`carnet-note-${target}-${index}`}
                  value={teamNotes[index]}
                  maxLength={14}
                  placeholder="hypothèse"
                  autocomplete="off"
                  spellcheck={false}
                  aria-label={`Hypothèse pour le numéro ${index + 1}`}
                  onInput={(event) => setNote(index, (event.currentTarget as HTMLInputElement).value)}
                />
              )}
              <ul>
                {entries.length === 0 && <li class="carnet__empty">—</li>}
                {entries.map((entry) => {
                  const age = latest - entry.round;
                  return (
                    <li
                      key={`${entry.round}-${entry.clue}`}
                      class={`carnet__ghost${entry.round === round ? " is-fresh" : ""}`}
                      style={{ "--o": Math.max(0.3, 1 - age * 0.2).toFixed(2), "--b": `${(Math.min(age, 4) * 0.25).toFixed(2)}px` }}
                    >
                      <sup>{entry.round}</sup>
                      {entry.clue}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p class="carnet__hint">
          {latest === 0
            ? "Aucun signal révélé pour l’instant. Les indices s’y graveront à chaque révélation."
            : "Les indices anciens pâlissent. Aucun mot-clé n’est affiché ici."}
        </p>
      </section>
    </div>
  );
}
