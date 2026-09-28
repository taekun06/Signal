import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { PHOSPHOR, runScramble } from "../fx/canvasFx";
import { supportsWarp, useGuide, useImmersion, useScreenShape } from "../fx/display";
import { play, screenLoad, setTension, vibrate } from "../fx/feedback";
import { type GameState, type TeamId, TEAM_IDS, currentRound } from "../game/rules";

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

/**
 * Taille de tube pour laquelle l’interface est dessinée (portrait, paysage).
 * Au-delà ou en deçà, tout est mis à l’échelle d’un bloc, comme un jeu qui
 * travaille dans une résolution de référence.
 */
const REFERENCE = { portrait: [400, 800], landscape: [840, 370], wide: [960, 660] } as const;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.3;

function useUiZoom(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      // Paysage de téléphone (mise en page compacte) ou grand écran.
      const compact = window.matchMedia("(max-height: 560px)").matches;
      const [rw, rh] = h >= w ? REFERENCE.portrait : compact ? REFERENCE.landscape : REFERENCE.wide;
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(w / rw, h / rh)));
      el.style.setProperty("--ui-zoom", zoom.toFixed(3));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
}

/**
 * Reflet de la pièce sur le verre : il glisse quand on penche le téléphone,
 * comme sur un vrai tube bombé.
 */
function useTiltReflection(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    if (reducedMotion()) return;
    let frame = 0;
    const onTilt = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null) return;
      const x = Math.max(-1, Math.min(1, event.gamma / 30));
      const y = Math.max(-1, Math.min(1, (event.beta - 45) / 30));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        ref.current?.style.setProperty("--tilt-x", x.toFixed(3));
        ref.current?.style.setProperty("--tilt-y", y.toFixed(3));
      });
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, []);
}

/**
 * `tension` : 0 calme, 1 la partie se resserre, 2 la défaite menace. Plus elle
 * monte, plus le tube souffre (parasites, tremblements, ronflement, battement).
 */
export function Crt({ tint, tension = 0, children }: { tint: Tint; tension?: number; children: ComponentChildren }) {
  const noiseRef = useRef<HTMLCanvasElement>(null);
  const crtRef = useRef<HTMLDivElement>(null);
  useUiZoom(crtRef);
  useTiltReflection(crtRef);
  const [shape] = useScreenShape();
  const [immersion] = useImmersion();
  // Écran d’avant (réglage de comparaison) : pas de tension ni de reflet mobile.
  if (immersion === "classic") tension = 0;
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

  useEffect(() => {
    setTension(tension);
  }, [tension]);
  useEffect(() => () => setTension(0), []);

  // Petits défauts analogiques : de temps en temps, l’image tremble un instant,
  // de plus en plus souvent quand la tension monte.
  const tensionRef = useRef(tension);
  tensionRef.current = tension;
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
        [7000 + Math.random() * 9000, 3500 + Math.random() * 4000, 1200 + Math.random() * 2200][tensionRef.current] ?? 7000,
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
    // Un grain à la taille réelle de l’écran (à demi-résolution) : fin comme
    // celui d’un vrai tube, au lieu de gros pavés étirés.
    const width = Math.max(64, Math.min(640, Math.round(canvas.offsetWidth / 2)));
    const height = Math.max(64, Math.min(1000, Math.round(canvas.offsetHeight / 2)));
    canvas.width = width;
    canvas.height = height;
    const frames = Array.from({ length: 6 }, () => {
      const image = ctx.createImageData(width, height);
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
    <div
      class="monitor"
      data-tint={tint}
      style={{ "--monitor-photo": `url("${new URL("crt-monitor.jpg", document.baseURI).href}")` }}
    >
      <div
        ref={crtRef}
        class={`crt${curved ? " is-curved" : ""}${curved && supportsWarp ? " is-warped" : ""}${warming ? " is-warming" : ""}${jitter ? " is-jitter" : ""}${tension ? ` is-tense-${tension}` : ""}`}
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
        {immersion === "new" && <div class="crt__reflection" aria-hidden="true" />}
        <ScrambleLayer tint={tint} />
      </div>
      <span class="monitor__led" aria-hidden="true" />
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
  silent = false,
}: {
  text: string;
  delay?: number;
  speed?: number;
  cursor?: boolean;
  /** Sonnerie de téléscripteur au début du message (indices reçus). */
  bell?: boolean;
  /** Pas de cliquetis à chaque lettre. */
  silent?: boolean;
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
        if (!silent && text[index - 1] && text[index - 1] !== " ") play("tick");
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
// Guide : pendant la première manche, le terminal souffle l’étape en cours,
// une ligne à la fois, à la place de l’aide habituelle.

export function Coach({ text, children }: { text: string | null; children?: ComponentChildren }) {
  const [on, setOn] = useGuide();
  if (!on || !text) return <>{children}</>;
  return (
    <p class="coach" role="status">
      <span class="coach__head">
        <span aria-hidden="true">TERMINAL ›</span>
        <button
          type="button"
          class="coach__off"
          onClick={() => {
            play("key");
            setOn(false);
          }}
        >
          couper le guide
        </button>
      </span>
      <TypeText text={text} speed={24} cursor silent />
    </p>
  );
}

// ---------------------------------------------------------------------------
// Texte intercepté : chaque lettre défile en signes parasites puis se cale.

const GLYPHS = "0123456789ABCDEF#%&@$<>/\\=+*";

export function DecryptText({ text, delay = 0, step = 90 }: { text: string; delay?: number; step?: number }) {
  const [now, setNow] = useState(() => (reducedMotion() ? Infinity : -1));
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    let t0 = 0;
    let locked = 0;
    const start = window.setTimeout(() => {
      play("teletype");
      t0 = performance.now();
      const loop = (t: number) => {
        const elapsed = t - t0;
        setNow(elapsed);
        const n = Math.min(text.length, Math.floor(elapsed / step));
        if (n > locked) {
          locked = n;
          if (text[n - 1] && text[n - 1] !== " ") play("tick");
        }
        if (n < text.length) raf = requestAnimationFrame(loop);
        else setNow(Infinity);
      };
      raf = requestAnimationFrame(loop);
    }, delay);
    return () => {
      clearTimeout(start);
      cancelAnimationFrame(raf);
    };
  }, [text, delay, step]);
  const locked = now < 0 ? 0 : Math.min(text.length, Math.floor(now / step));
  return (
    <span class="decrypt" aria-label={text}>
      <span aria-hidden="true">
        {text.slice(0, locked)}
        {now >= 0 && locked < text.length && (
          <span class="decrypt__noise">
            {[...text.slice(locked)].map((ch) => (ch === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join("")}
          </span>
        )}
      </span>
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
        {TEAM_IDS.map((team) => {
          const { name, interceptions, miscommunications } = state.teams[team];
          return (
            <div
              class={`hud__team${focus === team ? " is-focus" : ""}`}
              data-tint={team}
              key={team}
              role="group"
              aria-label={`${name} : ${interceptions} interception${interceptions > 1 ? "s" : ""} et ${miscommunications} malentendu${miscommunications > 1 ? "s" : ""} sur 2`}
            >
              <span class="hud__name">
                {teamMark(team)} {name.toUpperCase()}
              </span>
              {/* Voyants : interceptions à la couleur de l’équipe, malentendus en rouge. */}
              <span class="hud__lamps" aria-hidden="true">
                <Tokens count={interceptions} />
                <Tokens count={miscommunications} bad />
              </span>
            </div>
          );
        })}
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
