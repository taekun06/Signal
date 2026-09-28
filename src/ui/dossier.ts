// Dossier déclassifié : l’image de fin de partie qu’on partage. Les mots
// secrets, tous les indices qu’ils ont reçus, et le verdict, tamponnés.

import { type GameState, type TeamId, TEAM_IDS, currentRound, notebook } from "../game/rules";
import { teamMark } from "./kit";

const W = 1080;
const H = 1350;
const PAD = 72;

const INK: Record<TeamId, { ph: string; hi: string; dim: string; glow: string }> = {
  A: { ph: "#ffb23f", hi: "#ffe3ae", dim: "#b88444", glow: "rgba(255,170,50,.55)" },
  B: { ph: "#3dff7e", hi: "#c6ffd8", dim: "#4fae71", glow: "rgba(60,255,120,.5)" },
};
const STAMP = "#ff5a45";

const REASONS: Record<string, string> = {
  interceptions: "deux interceptions réussies",
  miscommunications: "deux malentendus chez l’adversaire",
  points: "victoire aux points",
  tiebreak: "victoire au départage",
  draw: "égalité parfaite",
};

const DISPLAY = '"VT323", "Courier New", monospace';
const MONO = '"IBM Plex Mono", monospace';

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, glow: string, blur = 18) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Coupe un texte trop long pour tenir dans `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export async function renderDossier(state: GameState): Promise<HTMLCanvasElement> {
  await Promise.all([document.fonts.load(`64px ${DISPLAY}`), document.fonts.load(`600 24px ${MONO}`), document.fonts.load(`24px ${MONO}`)]).catch(
    () => undefined,
  );
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const result = state.result;
  const winner = result && result.winner !== "draw" ? result.winner : null;
  const lead = INK[winner ?? "A"];

  // Fond de tube : noir chaud, halo au centre.
  ctx.fillStyle = "#070503";
  ctx.fillRect(0, 0, W, H);
  const halo = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.42, W * 0.9);
  halo.addColorStop(0, winner === "B" ? "rgba(40,90,55,.28)" : "rgba(90,60,20,.28)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // En-tête du dossier.
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 22px ${MONO}`;
  ctx.fillStyle = lead.dim;
  ctx.fillText("SIGNAL//ZÉRO", PAD, PAD + 10);
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const ref = `DOSSIER N° ${String(state.seed % 100000).padStart(5, "0")} · ${date}`;
  ctx.textAlign = "right";
  ctx.fillText(ref, W - PAD, PAD + 10);
  ctx.textAlign = "left";
  ctx.fillStyle = lead.dim;
  ctx.fillRect(PAD, PAD + 30, W - PAD * 2, 2);

  // Verdict.
  ctx.font = `120px ${DISPLAY}`;
  glowText(ctx, winner ? "VICTOIRE" : "ÉGALITÉ", PAD, PAD + 150, lead.hi, lead.glow, 26);
  if (winner) {
    ctx.font = `92px ${DISPLAY}`;
    glowText(ctx, fit(ctx, `${teamMark(winner)} ${state.teams[winner].name.toUpperCase()}`, W - PAD * 2), PAD, PAD + 240, INK[winner].ph, INK[winner].glow, 22);
  }
  ctx.font = `26px ${MONO}`;
  ctx.fillStyle = lead.dim;
  const rounds = currentRound(state).number;
  ctx.fillText(`${result ? REASONS[result.reason] : ""} · ${rounds} manche${rounds > 1 ? "s" : ""}`, PAD, PAD + (winner ? 292 : 200));

  // Les deux équipes : chaque mot secret et les indices qu’il a reçus.
  let y = PAD + (winner ? 380 : 290);
  for (const team of TEAM_IDS) {
    const ink = INK[team];
    const t = state.teams[team];
    ctx.font = `600 30px ${MONO}`;
    glowText(ctx, fit(ctx, `${teamMark(team)} ${t.name.toUpperCase()}`, 560), PAD, y, ink.ph, ink.glow, 10);
    ctx.font = `24px ${MONO}`;
    ctx.fillStyle = ink.dim;
    ctx.textAlign = "right";
    ctx.fillText(
      `${t.interceptions} interception${t.interceptions > 1 ? "s" : ""} · ${t.miscommunications} malentendu${t.miscommunications > 1 ? "s" : ""}`,
      W - PAD,
      y,
    );
    ctx.textAlign = "left";
    ctx.fillStyle = ink.dim;
    ctx.fillRect(PAD, y + 16, W - PAD * 2, 1);
    y += 66;
    const columns = notebook(state, team);
    t.words.forEach((word, index) => {
      ctx.font = `44px ${DISPLAY}`;
      glowText(ctx, `${index + 1}`, PAD, y, ink.ph, ink.glow, 8);
      glowText(ctx, word.toUpperCase(), PAD + 44, y, ink.hi, ink.glow, 10);
      const clues = columns[index].map((entry) => entry.clue.toLowerCase());
      ctx.font = `24px ${MONO}`;
      ctx.fillStyle = ink.dim;
      ctx.fillText(fit(ctx, clues.length ? clues.join(" · ") : "—", W - PAD * 2 - 380), PAD + 380, y - 4);
      y += 58;
    });
    y += 44;
  }

  // Tampon « DÉCLASSIFIÉ ».
  ctx.save();
  ctx.translate(W - 290, PAD + 150);
  ctx.rotate(-0.2);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = STAMP;
  ctx.lineWidth = 6;
  ctx.strokeRect(-190, -58, 380, 104);
  ctx.lineWidth = 2;
  ctx.strokeRect(-178, -46, 356, 80);
  ctx.font = `64px ${DISPLAY}`;
  ctx.fillStyle = STAMP;
  ctx.textAlign = "center";
  ctx.fillText("DÉCLASSIFIÉ", 0, 14);
  ctx.restore();

  // Pied de page.
  ctx.font = `22px ${MONO}`;
  ctx.fillStyle = lead.dim;
  ctx.fillText("un jeu de mots codés à deux équipes", PAD, H - PAD + 12);
  ctx.textAlign = "right";
  ctx.fillText(`${location.host}${location.pathname}`.replace(/\/$/, ""), W - PAD, H - PAD + 12);
  ctx.textAlign = "left";

  // Lignes de balayage et grain, pour que l’image sorte du tube.
  ctx.fillStyle = "rgba(0,0,0,.22)";
  for (let line = 0; line < H; line += 4) ctx.fillRect(0, line, W, 1);
  const grain = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    grain.data[i] += n;
    grain.data[i + 1] += n;
    grain.data[i + 2] += n;
  }
  ctx.putImageData(grain, 0, 0);
  return canvas;
}

export function dossierBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Partage natif si possible (photo dans la conversation), sinon téléchargement. */
export async function shareDossier(blob: Blob): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([blob], "signal-zero-dossier.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "SIGNAL//ZÉRO", text: "Dossier déclassifié" });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "saved";
}
