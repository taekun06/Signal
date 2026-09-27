import { useState } from "preact/hooks";
import { toggleFullscreen, useDevice } from "../fx/device";
import { useImmersion, useKeyboardKind, useScreenShape } from "../fx/display";
import { setSoundEnabled, soundEnabled } from "../fx/feedback";
import { Button } from "./kit";

/** Menu de pause d’une partie : réglages de l’écran et sortie. */
export function PauseMenu({ onClose, onQuit, note }: { onClose: () => void; onQuit: () => void; note: string }) {
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [sound, setSound] = useState(soundEnabled());
  const [shape, setShape] = useScreenShape();
  const [keyboard, setKeyboard] = useKeyboardKind();
  const [immersion, setImmersion] = useImmersion();
  const device = useDevice();
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Menu de la partie">
      <div class="overlay__box">
        <p class="prompt">&gt; PAUSE</p>
        {!confirmQuit ? (
          <>
            <Button onClick={onClose}>REPRENDRE</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
              }}
            >
              SON : {sound ? "ACTIVÉ" : "COUPÉ"}
            </Button>
            <Button variant="ghost" onClick={() => setShape(shape === "curved" ? "flat" : "curved")}>
              ÉCRAN : {shape === "curved" ? "BOMBÉ" : "PLAT"}
            </Button>
            <Button variant="ghost" onClick={() => setImmersion(immersion === "new" ? "classic" : "new")}>
              IMMERSION : {immersion === "new" ? "NOUVELLE" : "ANCIENNE"}
            </Button>
            <Button variant="ghost" onClick={() => setKeyboard(keyboard === "retro" ? "native" : "retro")}>
              CLAVIER : {keyboard === "retro" ? "RÉTRO" : "TÉLÉPHONE"}
            </Button>
            {device.canFullscreen && (
              <Button variant="ghost" onClick={() => void toggleFullscreen()}>
                PLEIN ÉCRAN : {device.fullscreen ? "ACTIVÉ" : "DÉSACTIVÉ"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setConfirmQuit(true)}>
              QUITTER LA PARTIE
            </Button>
            <p class="hint">{note}</p>
          </>
        ) : (
          <>
            <p class="lead">Revenir au menu principal ?</p>
            <Button variant="danger" onClick={onQuit}>
              OUI, QUITTER
            </Button>
            <Button variant="ghost" onClick={() => setConfirmQuit(false)}>
              ANNULER
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
