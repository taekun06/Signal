// Réglage d’affichage : écran plat ou tube légèrement bombé.

import { useEffect, useState } from "preact/hooks";

export type ScreenShape = "flat" | "curved";

const STORAGE_KEY = "signal-zero:screen";
const listeners = new Set<(shape: ScreenShape) => void>();

function read(): ScreenShape {
  try {
    return localStorage.getItem(STORAGE_KEY) === "flat" ? "flat" : "curved";
  } catch {
    return "curved";
  }
}

let current: ScreenShape = read();

export function screenShape(): ScreenShape {
  return current;
}

export function setScreenShape(shape: ScreenShape): void {
  current = shape;
  try {
    localStorage.setItem(STORAGE_KEY, shape);
  } catch {
    /* Réglage conservé pour la session. */
  }
  listeners.forEach((listener) => listener(shape));
}

export function useScreenShape(): [ScreenShape, (shape: ScreenShape) => void] {
  const [shape, setShape] = useState(current);
  useEffect(() => {
    listeners.add(setShape);
    return () => {
      listeners.delete(setShape);
    };
  }, []);
  return [shape, setScreenShape];
}

/**
 * La déformation passe par un filtre SVG. Safari l’applique mal aux éléments
 * HTML : on y garde seulement les coins arrondis et le reflet.
 */
export const supportsWarp = (() => {
  const ua = navigator.userAgent;
  const webkitOnly = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua);
  return !webkitOnly;
})();
