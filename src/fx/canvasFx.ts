// Effets dessinés au canvas : signal crypté et trace d’oscilloscope.

export type Phosphor = { r: number; g: number; b: number; hi: string };

export const PHOSPHOR: Record<"A" | "B", Phosphor> = {
  A: { r: 255, g: 178, b: 63, hi: "#ffe3ae" },
  B: { r: 61, g: 255, b: 126, hi: "#c6ffd8" },
};

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const ramp = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));

/**
 * Signal crypté des années 80 : neige de la couleur du phosphore, message
 * découpé en bandes décalées qui se recalent peu à peu, puis fondu.
 * Renvoie une fonction d’arrêt.
 */
export function runScramble(canvas: HTMLCanvasElement, text: string, color: Phosphor, duration: number, onDone: () => void): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    onDone();
    return () => undefined;
  }
  const W = canvas.width;
  const H = canvas.height;
  const message = document.createElement("canvas");
  message.width = W;
  message.height = H;
  const mctx = message.getContext("2d")!;
  const fontSize = Math.min(W / (text.length * 0.55), H * 0.3);
  mctx.fillStyle = color.hi;
  mctx.shadowColor = `rgba(${color.r},${color.g},${color.b},.9)`;
  mctx.shadowBlur = 6;
  mctx.font = `${fontSize}px VT323, monospace`;
  mctx.textAlign = "center";
  mctx.textBaseline = "middle";
  mctx.fillText(text, W / 2, H / 2);

  const buffer = document.createElement("canvas");
  buffer.width = W;
  buffer.height = H;
  const bctx = buffer.getContext("2d")!;
  const noise = bctx.createImageData(W, H);
  const start = performance.now();
  let raf = 0;
  let stopped = false;

  const frame = (now: number) => {
    if (stopped) return;
    const t = now - start;
    const p = Math.min(1, t / duration);
    const snow = p < 0.25 ? 1 : p < 0.7 ? 1 - 0.75 * ramp(p, 0.25, 0.7) : 0.25 * (1 - ramp(p, 0.85, 1));
    const shift = p < 0.2 ? 1 : 1 - ramp(p, 0.2, 0.7);
    const reveal = ramp(p, 0.15, 0.35);
    const fade = 1 - ramp(p, 0.82, 1);

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 0.92 * fade;
    ctx.fillStyle = "#0a0602";
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = reveal * fade;
    const band = 3;
    const seed = Math.floor(t / 80);
    for (let y = 0; y < H; y += band) {
      const r = Math.sin((y + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      const rnd = r - Math.floor(r) - 0.5;
      const dx = shift * (rnd * W * 0.45 + Math.sin(y * 0.25 + t * 0.006) * W * 0.06);
      ctx.drawImage(message, 0, y, W, band, dx, y, W, band);
    }

    const roll = ((t * 0.04) % (H + 20)) - 10;
    const d = noise.data;
    for (let y = 0; y < H; y++) {
      const boost = Math.abs(y - roll) < 3 ? 1.8 : 1;
      const rowJit = 0.75 + 0.25 * Math.sin(y * 0.9 + t * 0.02);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const v = Math.random() * rowJit * boost;
        d[i] = Math.min(255, color.r * v * 1.1 + 30 * v);
        d[i + 1] = Math.min(255, color.g * v);
        d[i + 2] = Math.min(255, color.b * v);
        d[i + 3] = 255 * Math.min(1, snow * v);
      }
    }
    bctx.putImageData(noise, 0, 0);
    ctx.globalAlpha = fade;
    ctx.drawImage(buffer, 0, 0);
    ctx.globalAlpha = 1;

    if (p < 1) raf = requestAnimationFrame(frame);
    else {
      ctx.clearRect(0, 0, W, H);
      onDone();
    }
  };

  if (reducedMotion()) {
    const id = window.setTimeout(onDone, 300);
    return () => clearTimeout(id);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

/**
 * Trace d’oscilloscope : un faisceau balaie l’écran, une rafale de
 * transmission éclate au centre, la rémanence du phosphore s’efface lentement.
 */
export function runOscilloscope(canvas: HTMLCanvasElement, color: Phosphor, centerRatio = 0.36): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;
  const W = canvas.width;
  const H = canvas.height;
  const cy = H * centerRatio;
  const amp = Math.min(H * 0.13, W * 0.28);
  const period = 2400;
  const wave = (x: number, t: number) => {
    const u = x / W;
    const burst = Math.exp(-Math.pow((u - 0.5) / 0.16, 2));
    const carrier = Math.sin(u * 38 + t * 0.004);
    const hum = Math.sin(u * 5.2 + t * 0.0012) * 0.12;
    const jitter = (Math.random() - 0.5) * 0.05;
    return cy - amp * (hum + carrier * (0.1 + 0.9 * burst) + jitter);
  };
  const stroke = `rgba(${Math.min(255, color.r + 20)},${Math.min(255, color.g + 20)},${Math.min(255, color.b + 40)},.95)`;
  const glow = `rgba(${color.r},${color.g},${color.b},.95)`;

  if (reducedMotion()) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, wave(x, 0));
    ctx.stroke();
    return () => undefined;
  }

  let prev: { x: number; y: number } | null = null;
  let last = performance.now();
  let raf = 0;
  let stopped = false;
  const frame = (t: number) => {
    if (stopped) return;
    const dt = Math.min(64, t - last);
    last = t;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0,0,0,${0.05 * (dt / 16)})`;
    ctx.fillRect(0, 0, W, H);
    const x = ((t % period) / period) * W;
    const y = wave(x, t);
    if (prev && x > prev.x) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = glow;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      for (let i = 1; i <= 8; i++) {
        const xi = prev.x + ((x - prev.x) * i) / 8;
        ctx.lineTo(xi, wave(xi, t));
      }
      ctx.stroke();
      ctx.shadowBlur = 28;
      ctx.shadowColor = "rgba(255,245,230,1)";
      ctx.fillStyle = "rgba(255,248,232,1)";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    prev = { x, y };
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
