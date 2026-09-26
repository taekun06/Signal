// Sons synthétisés (aucun fichier audio) et vibrations.

type Sound =
  | "key"
  | "tick"
  | "select"
  | "send"
  | "lock"
  | "success"
  | "fail"
  | "intercept"
  | "boot"
  | "power"
  | "alarm"
  | "victory"
  | "error";

const STORAGE_KEY = "signal-zero:sound";

let context: AudioContext | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    /* Stockage indisponible : réglage conservé pour la session. */
  }
}

/** Les navigateurs n’autorisent le son qu’après un geste de l’utilisateur. */
export function unlockAudio(): void {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "square", volume = 0.05, slideTo?: number) {
  if (!context) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const t0 = context.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(start: number, duration: number, volume = 0.04) {
  if (!context) return;
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(gain).connect(context.destination);
  source.start(context.currentTime + start);
}

let lastTick = 0;

export function play(sound: Sound): void {
  if (!enabled || !context) return;
  switch (sound) {
    case "key":
      tone(1200, 0, 0.025, "square", 0.018);
      break;
    case "tick": {
      const now = performance.now();
      if (now - lastTick < 45) return;
      lastTick = now;
      tone(2200 + Math.random() * 400, 0, 0.012, "square", 0.012);
      break;
    }
    case "select":
      tone(880, 0, 0.05, "square", 0.03);
      break;
    case "send":
      [660, 880, 1320].forEach((f, i) => tone(f, i * 0.07, 0.08, "square", 0.035));
      noise(0.2, 0.25, 0.02);
      break;
    case "lock":
      tone(440, 0, 0.06, "square", 0.04);
      tone(330, 0.07, 0.1, "square", 0.04);
      break;
    case "success":
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.12, "triangle", 0.06));
      break;
    case "fail":
      tone(220, 0, 0.35, "sawtooth", 0.05, 110);
      break;
    case "intercept":
      noise(0, 0.4, 0.06);
      [1400, 700, 1400, 700].forEach((f, i) => tone(f, 0.05 + i * 0.09, 0.08, "square", 0.04));
      break;
    case "boot":
      tone(60, 0, 0.6, "sawtooth", 0.04, 180);
      noise(0, 0.5, 0.025);
      break;
    case "power":
      tone(1800, 0, 0.18, "sine", 0.03, 120);
      break;
    case "alarm":
      tone(988, 0, 0.12, "square", 0.04);
      tone(988, 0.2, 0.12, "square", 0.04);
      break;
    case "victory":
      [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.16, "triangle", 0.06));
      break;
    case "error":
      tone(160, 0, 0.14, "square", 0.04);
      break;
  }
}

export function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* Vibration non disponible. */
  }
}

/** Déclenche le brouillage visuel de l’écran (écouté par le cadre CRT). */
export function glitch(): void {
  window.dispatchEvent(new CustomEvent("crt-glitch"));
}
