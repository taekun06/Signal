// Partie sur un seul téléphone : l’état vit en mémoire et dans localStorage,
// ce qui permet de reprendre après un rechargement ou une mise en veille.

import { useCallback, useState } from "preact/hooks";
import { type Action, type GameConfig, type GameState, applyAction, createGame } from "../game/rules";

const STORAGE_KEY = "signal-zero:local-game";

export interface LocalSave {
  state: GameState;
  /**
   * Tâche confirmée par l’équipe qui tient le téléphone (équipe, phase, manche,
   * transmission). Dès que la tâche attendue change, on repasse par un écran
   * de passage de téléphone.
   */
  holder: string | null;
}

export function loadLocalGame(): LocalSave | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as LocalSave;
    return save?.state?.version === 1 ? save : null;
  } catch {
    return null;
  }
}

function persist(save: LocalSave | null) {
  try {
    if (save) localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Stockage indisponible : la partie continue sans sauvegarde. */
  }
}

export function clearLocalGame(): void {
  persist(null);
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export function newLocalGame(config: GameConfig): LocalSave {
  const save: LocalSave = { state: createGame({ ...config, settings: { timerSeconds: 0 } }, randomSeed()), holder: null };
  persist(save);
  return save;
}

export function useLocalGame(initial: LocalSave) {
  const [save, setSave] = useState(initial);

  const update = useCallback((next: LocalSave) => {
    persist(next);
    setSave(next);
  }, []);

  /** Applique une action ; les erreurs de règle remontent à l’appelant. */
  const dispatch = useCallback(
    (action: Action) => {
      const state = applyAction(save.state, action);
      update({ state, holder: save.holder });
      return state;
    },
    [save, update],
  );

  const setHolder = useCallback((holder: string | null) => update({ ...save, holder }), [save, update]);

  return { state: save.state, holder: save.holder, dispatch, setHolder };
}
