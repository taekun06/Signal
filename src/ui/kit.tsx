import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { PHOSPHOR, runScramble } from "../fx/canvasFx";
import { supportsWarp, useScreenShape } from "../fx/display";
import { play, screenLoad, vibrate } from "../fx/feedback";
import { type GameState, type TeamId, TEAM_IDS, currentRound } from "../game/rules";
import { PixelIcon } from "./icons";

export type Tint = TeamId;

export const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// ---------------------------------------------------------------------------
// Cadre cathodique : phosphore, grain, balayage, tube bombé, signal crypté.
// Sur grand écran en paysage, le tube est posé dans la photo du moniteur.

function ScrambleLayer({ tint }: { tint: Tint }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const tintRef = useRef(tint);
  tintRef.current = tint;

  useEffect(() => {
    let stop: (() => void) | null = null;
    const onScramble = (event: Event) => {
      const canvas = ref.current;
      if (!canvas) return;
      stop?.();
      // Résolution basse (effet rétro), proportions de l’écran réel.
      canvas.width = 190;
      canvas.height = Math.max(60, Math.round((190 * canvas.offsetHeight) / Math.max(1, canvas.offsetWidth)));
      setActive(true);
      play("static");
      stop = runScramble(canvas, (event as CustomEvent<string>).detail, PHOSPHOR[tintRef.current], 1500, () => setActive(false));
    };
    window.addEventListener("crt-scramble", onScramble);
    return () => {
      window.removeEventListener("crt-scramble", onScramble);
      stop?.();
    };
  }, []);

  return <canvas class={`crt__scramble${active ? " is-active" : ""}`} ref={ref} width={190} height={340} aria-hidden="true" />;
}

// Le tube ne chauffe qu’une fois, au lancement de l’application.
let warmedUp = false;

export function Crt({ tint, children }: { tint: Tint; children: ComponentChildren }) {
  const noiseRef = useRef<HTMLCanvasElement>(null);
  const [shape] = useScreenShape();
  const curved = shape === "curved";
  const [warming, setWarming] = useState(() => !warmedUp && !reducedMotion());
  const [jitter, setJitter] = useState(false);
  const [breath, setBreath] = useState(0);

  useEffect(() => {
    warmedUp = true;
    if (!warming) return;
    const id = window.setTimeout(() => setWarming(false), 2300);
    return () => clearTimeout(id);
  }, []);

  // Petits défauts analogiques : de temps en temps, l’image tremble un instant.
  useEffect(() => {
    if (reducedMotion()) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setJitter(true);
          timer = window.setTimeout(() => {
            setJitter(false);
            schedule();
          }, 260);
        },
        7000 + Math.random() * 9000,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // Quand une nouvelle image s’allume, la luminosité du tube « respire ».
  useEffect(() => {
    const onLoad = () => setBreath((n) => n + 1);
    window.addEventListener("crt-load", onLoad);
    return () => window.removeEventListener("crt-load", onLoad);
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
    <div class="monitor" style={{ "--monitor-photo": `url("${new URL("crt-monitor.jpg", document.baseURI).href}")` }}>
      <div
        class={`crt${curved ? " is-curved" : ""}${curved && supportsWarp ? " is-warped" : ""}${warming ? " is-warming" : ""}${jitter ? " is-jitter" : ""}`}
        data-tint={tint}
      >
        <div class="crt__warp">
          <div class="crt__content">{children}</div>
        </div>
        <canvas class="crt__noise" ref={noiseRef} aria-hidden="true" />
        <div class="crt__scanlines" aria-hidden="true" />
        <div class="crt__scanbar" aria-hidden="true" />
        <div class="crt__vignette" aria-hidden="true" />
        {breath > 0 && <div class="crt__breath" key={breath} aria-hidden="true" />}
        {curved && <div class="crt__glass" aria-hidden="true" />}
        <ScrambleLayer tint={tint} />
      </div>
      <svg class="crt__defs" width="0" height="0" aria-hidden="true">
        <filter
          id="crt-barrel"
          x="0"
          y="0"
          width="1"
          height="1"
          filterUnits="objectBoundingBox"
          primitiveUnits="objectBoundingBox"
          color-interpolation-filters="sRGB"
        >
          <feImage href={`${import.meta.env.BASE_URL}barrel-map.png`} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="0.045" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </div>
  );
}

/**
 * Changement d’écran façon vieux téléviseur : un trait blanc s’ouvre sur la
 * nouvelle image. Avec `offOn`, l’ancienne image s’éteint d’abord en un point
 * blanc qui s’estompe (utilisé quand on se passe le téléphone).
 */
export function PowerCycle({ id, offOn = false, children }: { id: string; offOn?: boolean; children: ComponentChildren }) {
  const first = useRef(true);
  const ref = useRef<HTMLDivElement>(null);
  const skip = first.current;
  useEffect(() => {
    ref.current?.closest(".crt__content")?.scrollTo(0, 0);
    if (first.current) {
      first.current = false;
      return;
    }
    if (offOn) {
      play("pop");
      const on = window.setTimeout(() => {
        play("poweron");
        screenLoad();
      }, 620);
      return () => clearTimeout(on);
    }
    play("poweron");
    screenLoad();
  }, [id]);
  const mode = skip ? "none" : offOn ? "offon" : "on";
  return (
    <div class={`power power--${mode}`} key={id} ref={ref}>
      <div class="power__content">{children}</div>
      {mode !== "none" && <span class="power__beam" aria-hidden="true" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Texte tapé comme sur un téléscripteur.

export function TypeText({
  text,
  delay = 0,
  speed = 38,
  cursor = false,
  bell = false,
}: {
  text: string;
  delay?: number;
  speed?: number;
  cursor?: boolean;
  /** Sonnerie de téléscripteur au début du message (indices reçus). */
  bell?: boolean;
}) {
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
      if (bell) play("teletype");
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
// Jetons, étiquettes d’équipe, en-tête et frise des étapes.

export function Tokens({ count, max = 2, bad = false }: { count: number; max?: number; bad?: boolean }) {
  return (
    <span class={`tokens${bad ? " tokens--bad" : ""}`} aria-label={`${count} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} class={i < count ? "on" : ""} />
      ))}
    </span>
  );
}

export const teamMark = (team: TeamId) => (team === "A" ? "◆" : "▲");

export function TeamTag({ team, state }: { team: TeamId; state: GameState }) {
  return (
    <span class="team-tag" data-tint={team}>
      {teamMark(team)} {state.teams[team].name.toUpperCase()}
    </span>
  );
}

export function HeaderBar({ state, label, focus }: { state: GameState; label?: string; focus?: TeamId }) {
  const round = currentRound(state).number;
  return (
    <header class="hud">
      <div class="hud__top">
        <span class="hud__title">SIGNAL//ZÉRO</span>
        <span class="hud__round">
          {label ?? `MANCHE ${String(round).padStart(2, "0")} / ${String(state.settings.maxRounds).padStart(2, "0")}`}
        </span>
      </div>
      <div class="hud__teams">
        {TEAM_IDS.map((team) => (
          <div class={`hud__team${focus === team ? " is-focus" : ""}`} data-tint={team} key={team}>
            <span class="hud__name">
              {teamMark(team)} {state.teams[team].name.toUpperCase()}
            </span>
            <span class="hud__stat">
              <PixelIcon name="target" size={12} />
              INTERCEPTIONS
              <Tokens count={state.teams[team].interceptions} />
            </span>
            <span class="hud__stat hud__stat--bad">
              <PixelIcon name="cross" size={12} />
              MALENTENDUS
              <Tokens count={state.teams[team].miscommunications} bad />
            </span>
          </div>
        ))}
      </div>
    </header>
  );
}

type StepStatus = "done" | "now" | "todo";

/** Les quatre temps d’une manche : indices des deux équipes, puis leurs deux signaux. */
export function roundSteps(state: GameState): { label: string; team: TeamId; status: StepStatus }[] {
  const round = currentRound(state);
  const base: { label: string; team: TeamId }[] = [
    { label: "INDICES", team: "A" },
    { label: "INDICES", team: "B" },
    { label: "SIGNAL", team: "A" },
    { label: "SIGNAL", team: "B" },
  ];
  let done: boolean[];
  let now = -1;
  if (state.phase === "clues") {
    done = [!!round.transmissions.A.clues, !!round.transmissions.B.clues, false, false];
    now = done.indexOf(false);
  } else if (state.phase === "decode" || state.phase === "reveal") {
    const index = state.active === "A" ? 2 : 3;
    done = base.map((_, i) => i < index || (i === index && state.phase === "reveal"));
    now = index;
  } else {
    done = [true, true, true, true];
  }
  return base.map((step, i) => ({ ...step, status: i === now && !done[i] ? "now" : done[i] ? "done" : i === now ? "now" : "todo" }));
}

export function RoundSteps({ state }: { state: GameState }) {
  return (
    <ol class="steps" aria-label="Étapes de la manche">
      {roundSteps(state).map((step, i) => (
        <li key={i} class={`steps__item is-${step.status}`} data-tint={step.team} aria-current={step.status === "now" ? "step" : undefined}>
          <span>{["①", "②", "③", "④"][i]} {step.label}</span>
          <span>
            {teamMark(step.team)} {state.teams[step.team].name.toUpperCase()}
          </span>
        </li>
      ))}
    </ol>
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
