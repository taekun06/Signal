// Sons synthétisés (aucun fichier audio) et vibrations.

type Sound =
  | "key"
  | "tick"
  | "teletype"
  | "select"
  | "send"
  | "lock"
  | "success"
  | "fail"
  | "intercept"
  | "boot"
  | "power"
  | "pop"
  | "poweron"
  | "alarm"
  | "victory"
  | "error"
  | "reel"
  | "drop"
  | "static"
  | "modem"
  | "cut"
  | "beam"
  | "fade"
  | "callA"
  | "callB"
  | "grab"
  | "place";

const STORAGE_KEY = "signal-zero:sound";

let context: AudioContext | null = null;
let enabled = readEnabled();
let noiseBuffer: AudioBuffer | null = null;

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
  setTension(tensionLevel);
  try {
    localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    /* Stockage indisponible : réglage conservé pour la session. */
  }
}

// Application en arrière-plan : le tube se tait (plus de ronflement dans la poche).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!context) return;
    if (document.hidden) void context.suspend();
    else void context.resume();
  });
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
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function whiteNoise(): AudioBuffer | null {
  if (!context) return null;
  if (!noiseBuffer) {
    const length = context.sampleRate;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Souffle filtré : la base des bruits mécaniques (touches, marteaux, grésillement). */
function noise(start: number, duration: number, volume = 0.04, filter?: { type: BiquadFilterType; freq: number; q?: number }) {
  const buffer = whiteNoise();
  if (!context || !buffer) return;
  const t0 = context.currentTime + start;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  let node: AudioNode = source;
  if (filter) {
    const biquad = context.createBiquadFilter();
    biquad.type = filter.type;
    biquad.frequency.value = filter.freq;
    biquad.Q.value = filter.q ?? 1;
    node = source.connect(biquad);
  }
  node.connect(gain).connect(context.destination);
  source.start(t0, Math.random() * 0.5);
  source.stop(t0 + duration + 0.02);
}

let lastTick = 0;

export function play(sound: Sound): void {
  if (!enabled || !context) return;
  switch (sound) {
    // Indicatifs d’équipe : l’ambre sonne chaud et grave (triangle, quarte
    // montante), le vert froid et aigu (sinus pincés, tierce qui retombe).
    case "callA":
      tone(196, 0, 0.16, "triangle", 0.07);
      tone(262, 0.14, 0.26, "triangle", 0.07);
      tone(392, 0.14, 0.26, "sine", 0.02);
      break;
    case "callB":
      tone(1319, 0, 0.07, "sine", 0.04);
      tone(1568, 0.08, 0.07, "sine", 0.04);
      tone(1319, 0.16, 0.18, "sine", 0.035, 1175);
      break;
    case "key": {
      // Touche mécanique : clic aigu puis choc sourd du fond de course.
      const v = 0.9 + Math.random() * 0.2;
      noise(0, 0.018, 0.22 * v, { type: "bandpass", freq: 3200 + Math.random() * 600, q: 1.4 });
      noise(0.012, 0.045, 0.12 * v, { type: "lowpass", freq: 700 });
      tone(150 + Math.random() * 20, 0.01, 0.04, "sine", 0.05 * v);
      break;
    }
    case "tick": {
      // Marteau de téléscripteur, limité pour ne pas saturer.
      const now = performance.now();
      if (now - lastTick < 40) return;
      lastTick = now;
      noise(0, 0.02, 0.1, { type: "bandpass", freq: 2400, q: 2 });
      tone(90, 0, 0.03, "square", 0.012);
      break;
    }
    case "teletype":
      // Sonnerie de téléscripteur : deux bips secs.
      tone(1150, 0, 0.07, "square", 0.035);
      tone(1150, 0.1, 0.07, "square", 0.035);
      break;
    case "select":
      tone(880, 0, 0.05, "square", 0.03);
      break;
    case "grab":
      // L’indice se décolle de l’écran : petit crépitement et note qui monte.
      noise(0, 0.05, 0.05, { type: "highpass", freq: 3000 });
      tone(520, 0, 0.06, "square", 0.025, 780);
      break;
    case "place":
      // L’indice se grave dans la colonne : coup sourd puis clic de phosphore.
      tone(140, 0, 0.09, "sine", 0.1, 70);
      tone(1320, 0.03, 0.04, "square", 0.025);
      break;
    case "send":
      [660, 880, 1320].forEach((f, i) => tone(f, i * 0.07, 0.08, "square", 0.035));
      noise(0.2, 0.25, 0.03, { type: "highpass", freq: 1500 });
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
      // Le tube chauffe : bourdonnement qui monte et sifflement aigu.
      tone(55, 0, 2.2, "sawtooth", 0.03, 120);
      tone(15600, 0.4, 1.8, "sine", 0.006);
      noise(0, 0.6, 0.03, { type: "lowpass", freq: 900 });
      break;
    case "power":
      tone(1800, 0, 0.18, "sine", 0.03, 120);
      break;
    case "pop":
      // Télé qui s’éteint : « pop » grave et craquement statique.
      tone(95, 0, 0.18, "sine", 0.12, 40);
      noise(0, 0.12, 0.09, { type: "lowpass", freq: 1800 });
      tone(9000, 0.02, 0.25, "sine", 0.008, 2000);
      break;
    case "poweron":
      noise(0, 0.22, 0.05, { type: "highpass", freq: 2500 });
      tone(60, 0, 0.35, "sawtooth", 0.025, 110);
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
    case "reel":
      noise(0, 0.03, 0.12, { type: "bandpass", freq: 1800, q: 3 });
      tone(260, 0.02, 0.05, "square", 0.025);
      break;
    case "drop":
      tone(110, 0, 0.16, "sine", 0.09, 60);
      noise(0, 0.04, 0.12, { type: "bandpass", freq: 2600, q: 2 });
      break;
    case "modem":
      // Poignée de main de modem : tonalité, dialogue en deux notes, puis le flot de données.
      tone(2100, 0, 0.45, "sine", 0.035);
      [1300, 2100, 1300].forEach((f, i) => tone(f, 0.5 + i * 0.14, 0.12, "sine", 0.035));
      noise(0.95, 0.35, 0.05, { type: "bandpass", freq: 3000, q: 0.8 });
      tone(980, 1.35, 0.3, "square", 0.022);
      tone(1180, 1.35, 0.3, "square", 0.022);
      noise(1.65, 1.1, 0.045, { type: "bandpass", freq: 1800, q: 0.8 });
      break;
    case "cut":
      // Porteuse perdue : la transmission s’interrompt net.
      tone(160, 0, 0.35, "sawtooth", 0.06, 70);
      noise(0, 0.08, 0.1, { type: "highpass", freq: 1200 });
      break;
    case "beam":
      // Le faisceau s’allume : sifflement très aigu et petit choc.
      tone(15000, 0, 0.5, "sine", 0.005);
      tone(90, 0, 0.1, "triangle", 0.06);
      break;
    case "fade":
      // Le phosphore s’éteint doucement.
      tone(2400, 0, 0.35, "sine", 0.012, 300);
      break;
    case "static":
      noise(0, 1.1, 0.05, { type: "highpass", freq: 800 });
      tone(15600, 0, 1.1, "sine", 0.004);
      break;
  }
}

// ---------------------------------------------------------------------------
// Ambiance de tension : ronflement du transformateur qui grossit et, quand la
// défaite menace, un battement sourd comme un cœur.

let hum: { osc: OscillatorNode; gain: GainNode; air: GainNode; depth: GainNode } | null = null;
let heartbeat = 0;
let tensionLevel = 0;
// Le secteur ne ronfle pas pareil chez les deux équipes : 50 Hz pour l’ambre,
// 60 Hz pour le vert. Le tube change de voix quand le téléphone change de main.
let humBase = 50;

export function setHumTeam(team: "A" | "B"): void {
  humBase = team === "A" ? 50 : 60;
  if (hum && context) hum.osc.frequency.setTargetAtTime(humBase + tensionLevel * 2, context.currentTime, 0.6);
}

/** Sonne l’indicatif de l’équipe. */
export function callSign(team: "A" | "B"): void {
  play(team === "A" ? "callA" : "callB");
}

/** 0 = calme, 1 = la partie se resserre, 2 = une équipe est au bord de la défaite. */
export function setTension(level: number): void {
  tensionLevel = level;
  clearInterval(heartbeat);
  heartbeat = 0;
  if (!context) return;
  if (!hum) {
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 50;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 180;
    const gain = context.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(context.destination);
    osc.start();
    // Respiration lente du ronflement.
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.13;
    const depth = context.createGain();
    depth.gain.value = 0.0015;
    lfo.connect(depth).connect(gain.gain);
    lfo.start();
    // Souffle de la porteuse, très bas, en boucle.
    const buffer = whiteNoise();
    const air = context.createGain();
    air.gain.value = 0;
    if (buffer) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 2400;
      band.Q.value = 0.7;
      source.connect(band).connect(air).connect(context.destination);
      source.start();
    }
    hum = { osc, gain, air, depth };
  }
  const t = context.currentTime;
  hum.gain.gain.setTargetAtTime(enabled ? [0.004, 0.008, 0.015][level] ?? 0 : 0, t, 0.8);
  hum.air.gain.setTargetAtTime(enabled ? [0.0025, 0.0035, 0.005][level] ?? 0 : 0, t, 0.8);
  hum.depth.gain.setTargetAtTime(enabled ? 0.0015 : 0, t, 0.3);
  hum.osc.frequency.setTargetAtTime(humBase + level * 2, t, 0.8);
  if (level >= 2) {
    heartbeat = window.setInterval(() => {
      if (!enabled || !context || document.hidden) return;
      tone(58, 0, 0.14, "sine", 0.09, 40);
      tone(52, 0.2, 0.18, "sine", 0.06, 36);
    }, 1500);
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

// ---------------------------------------------------------------------------
// Morse : bips et vibrations synchronisés pendant l’envoi des indices.

const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
  K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
  U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
};

/** Émet un mot en morse (points 70 ms) par le haut-parleur et le vibreur. */
export function morse(word: string, unit = 70): number {
  const letters = word
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 4)
    .split("")
    .map((letter) => MORSE[letter])
    .filter(Boolean);
  const pattern: number[] = [];
  let time = 0;
  letters.forEach((code, li) => {
    [...code].forEach((symbol, si) => {
      const length = symbol === "." ? unit : unit * 3;
      if (enabled && context) tone(760, time / 1000, length / 1000, "sine", 0.05);
      pattern.push(length);
      time += length;
      const gap = si < code.length - 1 ? unit : li < letters.length - 1 ? unit * 3 : 0;
      if (gap) {
        pattern.push(gap);
        time += gap;
      }
    });
  });
  vibrate(pattern);
  return time;
}

/** Affiche le signal crypté par-dessus l’écran, avec un message qui perce le brouillage. */
export function scramble(text: string): void {
  window.dispatchEvent(new CustomEvent("crt-scramble", { detail: text }));
}

/** Prévient le tube qu’une nouvelle image s’allume (légère « respiration » de la luminosité). */
export function screenLoad(): void {
  window.dispatchEvent(new CustomEvent("crt-load"));
}
