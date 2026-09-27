import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { play, vibrate } from "../fx/feedback";
import { type GameState, type TeamId, TEAM_IDS, currentRound } from "../game/rules";

export type Tint = TeamId;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// ---------------------------------------------------------------------------
// Cadre cathodique : couleur de phosphore, grain, balayage, brouillage.

export function Crt({ tint, children }: { tint: Tint; children: ComponentChildren }) {
  const [glitching, setGlitching] = useState(false);
  const noiseRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let timer = 0;
    const onGlitch = () => {
      if (reducedMotion()) return;
      setGlitching(false);
      requestAnimationFrame(() => setGlitching(true));
      clearTimeout(timer);
      timer = window.setTimeout(() => setGlitching(false), 750);
    };
    window.addEventListener("crt-glitch", onGlitch);
    return () => {
      window.removeEventListener("crt-glitch", onGlitch);
      clearTimeout(timer);
    };
  }, []);

  // Grain animé : quelques images de bruit tirées en boucle.
  useEffect(() => {
    const canvas = noiseRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const frames = Array.from({ length: 6 }, () => {
      const image = ctx.createImageData(size, size);
      for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.random() * 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      return image;
    });
    let frame = 0;
    ctx.putImageData(frames[0], 0, 0);
    if (reducedMotion()) return;
    const id = window.setInterval(() => {
      frame = (frame + 1) % frames.length;
      ctx.putImageData(frames[frame], 0, 0);
    }, 70);
    return () => clearInterval(id);
  }, []);

  return (
    <div class={`crt${glitching ? " is-glitching" : ""}`} data-tint={tint}>
      <div class="crt__content">{children}</div>
      <canvas class="crt__noise" ref={noiseRef} aria-hidden="true" />
      <div class="crt__scanlines" aria-hidden="true" />
      <div class="crt__scanbar" aria-hidden="true" />
      <div class="crt__vignette" aria-hidden="true" />
    </div>
  );
}

/** Rejoue l’effet « télé qui s’éteint puis se rallume » à chaque changement d’écran. */
export function PowerCycle({ id, children }: { id: string; children: ComponentChildren }) {
  const first = useRef(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.closest(".crt__content")?.scrollTo(0, 0);
    if (first.current) {
      first.current = false;
      return;
    }
    play("power");
  }, [id]);
  return (
    <div class="power" key={id} ref={ref}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Texte tapé comme sur un téléscripteur.

export function TypeText({ text, delay = 0, speed = 38, cursor = false }: { text: string; delay?: number; speed?: number; cursor?: boolean }) {
  const [count, setCount] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (reducedMotion()) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let index = 0;
    let interval = 0;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        index += 1;
        setCount(index);
        if (text[index - 1] && text[index - 1] !== " ") play("tick");
        if (index >= text.length) clearInterval(interval);
      }, speed);
    }, delay);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [text, delay, speed]);
  const done = count >= text.length;
  return (
    <span class="typetext" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      {(!done || cursor) && <span class="cursor" aria-hidden="true">▌</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Boutons

type ButtonProps = JSX.HTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  sound?: Parameters<typeof play>[0] | null;
  disabled?: boolean;
};

export function Button({ variant = "primary", sound = "select", onClick, class: className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      class={`btn btn--${variant}${className ? ` ${className}` : ""}`}
      onClick={(event) => {
        if (sound) play(sound);
        vibrate(8);
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// En-tête de partie : manche et jetons des deux équipes.

function Tokens({ count, max = 2, bad = false }: { count: number; max?: number; bad?: boolean }) {
  return (
    <span class={`tokens${bad ? " tokens--bad" : ""}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} class={i < count ? "on" : ""} />
      ))}
    </span>
  );
}

export function TeamTag({ team, state }: { team: TeamId; state: GameState }) {
  return (
    <span class="team-tag" data-tint={team}>
      {team === "A" ? "◆" : "▲"} {state.teams[team].name.toUpperCase()}
    </span>
  );
}

export function HeaderBar({ state, label }: { state: GameState; label?: string }) {
  const round = currentRound(state).number;
  return (
    <header class="hud">
      <div class="hud__top">
        <span class="hud__title">SIGNAL//ZÉRO</span>
        <span class="hud__round">
          {label ?? `MANCHE ${String(round).padStart(2, "0")}/${String(state.settings.maxRounds).padStart(2, "0")}`}
        </span>
      </div>
      <div class="hud__teams">
        {TEAM_IDS.map((team) => (
          <div class="hud__team" data-tint={team} key={team}>
            <span class="hud__name">
              {team === "A" ? "◆" : "▲"} {state.teams[team].name.toUpperCase()}
            </span>
            <span class="hud__stat" title="Interceptions réussies">
              INT <Tokens count={state.teams[team].interceptions} />
            </span>
            <span class="hud__stat" title="Malentendus">
              MAL <Tokens count={state.teams[team].miscommunications} bad />
            </span>
          </div>
        ))}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sablier (mode deux téléphones)

export function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span class={`countdown${seconds <= 10 ? " is-urgent" : ""}`}>⧗ 00:{String(seconds).padStart(2, "0")}</span>;
}

export function Panel({ title, children, class: className }: { title?: ComponentChildren; children: ComponentChildren; class?: string }) {
  return (
    <section class={`panel${className ? ` ${className}` : ""}`}>
      {title && <h3 class="panel__title">{title}</h3>}
      {children}
    </section>
  );
}

/** Les indices sont repérés par des lettres, les mots-clés par des chiffres. */
export const LETTERS = ["A", "B", "C"] as const;
