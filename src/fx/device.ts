// Plein écran, installation comme application et écran maintenu allumé.

import { useEffect, useState } from "preact/hooks";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installEvent = event as InstallPromptEvent;
  notify();
});

window.addEventListener("appinstalled", () => {
  installEvent = null;
  notify();
});

document.addEventListener("fullscreenchange", notify);

/** Vrai quand le jeu tourne comme application installée. */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.("(display-mode: fullscreen), (display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function fullscreenSupported(): boolean {
  return !!document.documentElement.requestFullscreen && !isInstalled();
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

export async function enterFullscreen(): Promise<void> {
  if (!fullscreenSupported() || isFullscreen()) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch {
    /* Refusé par le navigateur : on reste en mode fenêtre. */
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (isFullscreen()) await document.exitFullscreen().catch(() => undefined);
  else await enterFullscreen();
}

export async function promptInstall(): Promise<void> {
  if (!installEvent) return;
  const event = installEvent;
  installEvent = null;
  notify();
  await event.prompt();
}

/** État réactif : installation possible, plein écran actif. */
export function useDevice() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    canInstall: !!installEvent && !isInstalled(),
    canFullscreen: fullscreenSupported(),
    fullscreen: isFullscreen(),
  };
}

// Garde l’écran allumé pendant la partie (quand le navigateur le permet).
let wakeLock: { release(): Promise<void> } | null = null;

export async function keepScreenOn(): Promise<void> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    if (!nav.wakeLock || wakeLock) return;
    wakeLock = await nav.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wakeLock) {
    wakeLock = null;
    void keepScreenOn();
  }
});

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
