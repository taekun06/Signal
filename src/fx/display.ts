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

// ---------------------------------------------------------------------------
// Clavier des indices : clavier de terminal intégré, ou clavier du téléphone.

export type KeyboardKind = "retro" | "native";

const KEYBOARD_KEY = "signal-zero:keyboard";
const keyboardListeners = new Set<(kind: KeyboardKind) => void>();

let keyboard: KeyboardKind = (() => {
  try {
    return localStorage.getItem(KEYBOARD_KEY) === "native" ? "native" : "retro";
  } catch {
    return "retro";
  }
})();

export function useKeyboardKind(): [KeyboardKind, (kind: KeyboardKind) => void] {
  const [kind, setKind] = useState(keyboard);
  useEffect(() => {
    keyboardListeners.add(setKind);
    return () => {
      keyboardListeners.delete(setKind);
    };
  }, []);
  const update = (next: KeyboardKind) => {
    keyboard = next;
    try {
      localStorage.setItem(KEYBOARD_KEY, next);
    } catch {
      /* Réglage conservé pour la session. */
    }
    keyboardListeners.forEach((listener) => listener(next));
  };
  return [kind, update];
}

// ---------------------------------------------------------------------------
// Immersion : la version enrichie (faisceau, émission maintenue, déchiffrement,
// tube sous tension) ou l’écran d’avant, pour comparer.

export type Immersion = "new" | "classic";

const IMMERSION_KEY = "signal-zero:immersion";
const immersionListeners = new Set<(value: Immersion) => void>();

let immersion: Immersion = (() => {
  try {
    return localStorage.getItem(IMMERSION_KEY) === "classic" ? "classic" : "new";
  } catch {
    return "new";
  }
})();

export function useImmersion(): [Immersion, (value: Immersion) => void] {
  const [value, setValue] = useState(immersion);
  useEffect(() => {
    immersionListeners.add(setValue);
    return () => {
      immersionListeners.delete(setValue);
    };
  }, []);
  const update = (next: Immersion) => {
    immersion = next;
    try {
      localStorage.setItem(IMMERSION_KEY, next);
    } catch {
      /* Réglage conservé pour la session. */
    }
    immersionListeners.forEach((listener) => listener(next));
  };
  return [value, update];
}
