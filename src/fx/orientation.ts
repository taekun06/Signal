// Téléphone retourné sur la table : écran contre la table, il cache tout et
// sert de geste de jeu (verrouiller une réponse, passer la main, révéler).

import { useEffect, useState } from "preact/hooks";

const STORAGE_KEY = "signal-zero:flip";

export interface Flip {
  /** Réglage : le geste est pris en compte. */
  enabled: boolean;
  /** Le téléphone a déjà envoyé une orientation lisible. */
  sensor: boolean;
  /** Écran tourné vers la table. */
  down: boolean;
}

let flip: Flip = {
  enabled: (() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  })(),
  sensor: false,
  down: false,
};
const listeners = new Set<(value: Flip) => void>();

function publish(next: Partial<Flip>): void {
  flip = { ...flip, ...next };
  listeners.forEach((listener) => listener(flip));
}

export function setFlipEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* Réglage conservé pour la session. */
  }
  publish({ enabled, down: enabled && flip.down });
}

// Hystérésis et petit délai : un téléphone qu’on se passe de main en main
// ne doit pas déclencher le geste par accident.
const DOWN_FROM = 150;
const UP_UNDER = 120;
const SETTLE_MS = 220;
let raw = false;
let settle = 0;

function onOrientation(event: DeviceOrientationEvent): void {
  if (event.beta === null) return;
  if (!flip.sensor) publish({ sensor: true });
  const tilt = Math.abs(event.beta);
  const next = raw ? tilt > UP_UNDER : tilt > DOWN_FROM;
  if (next === raw) return;
  raw = next;
  clearTimeout(settle);
  settle = window.setTimeout(() => {
    if (flip.enabled && raw !== flip.down) publish({ down: raw });
  }, SETTLE_MS);
}

if (typeof window !== "undefined") window.addEventListener("deviceorientation", onOrientation);

export function useFlip(): Flip {
  const [value, setValue] = useState(flip);
  useEffect(() => {
    listeners.add(setValue);
    setValue(flip);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** Appelle `onDown` quand l’écran se pose contre la table, `onUp` quand il se relève. */
export function useFlipGesture(handlers: { onDown?: () => void; onUp?: () => void }): Flip {
  const value = useFlip();
  const [previous, setPrevious] = useState(value.down);
  useEffect(() => {
    if (value.down === previous) return;
    setPrevious(value.down);
    if (value.down) handlers.onDown?.();
    else handlers.onUp?.();
  }, [value.down]);
  return value;
}
