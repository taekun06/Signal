import { useEffect, useState } from "preact/hooks";
import { enableMotion, keepScreenOn, promptInstall, toggleFullscreen, useDevice } from "../fx/device";
import { useScreenShape } from "../fx/display";
import { play, setSoundEnabled, soundEnabled, unlockAudio } from "../fx/feedback";
import { type TeamId, MIN_PLAYERS, RuleError } from "../game/rules";
import { WORDS } from "../game/words";
import { cleanRoom } from "../net/link";
import { type LocalSave, clearLocalGame, loadLocalGame, newLocalGame } from "../net/localGame";
import { type OnlineSave, clearOnlineGame, loadOnlineGame } from "../net/onlineGame";
import { Button, Crt, PowerCycle, TypeText } from "./kit";
import { LocalGame } from "./LocalGame";
import { OnlineGame, OnlineSetup } from "./Online";
import { type SetupTeam, TeamFields } from "./TeamFields";
import { useToast } from "./toast";

type View =
  | { name: "boot" }
  | { name: "menu" }
  | { name: "setup" }
  | { name: "rules" }
  | { name: "play" }
  | { name: "settings" }
  | { name: "local"; save: LocalSave }
  | { name: "online-setup"; room?: string }
  | { name: "online"; save: OnlineSave };

/** Code de canal reçu par le QR code (`?salle=ABCD`), retiré de l’adresse. */
function roomFromUrl(): string | undefined {
  const params = new URLSearchParams(location.search);
  const room = cleanRoom(params.get("salle") ?? "");
  if (params.has("salle")) {
    params.delete("salle");
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  }
  return room.length === 4 ? room : undefined;
}

export function App() {
  const [view, setView] = useState<View>({ name: "boot" });
  const [joinRoom] = useState(roomFromUrl);

  if (view.name === "local") {
    return <LocalGame key={view.save.state.seed} initial={view.save} onExit={() => setView({ name: "menu" })} />;
  }
  if (view.name === "online") {
    return <OnlineGame key={`${view.save.room}:${view.save.device}`} initial={view.save} onExit={() => setView({ name: "menu" })} />;
  }

  return (
    <Crt tint="A">
      <div class="app-frame">
        <PowerCycle id={view.name}>
          {view.name === "boot" && <Boot onDone={() => setView(joinRoom ? { name: "online-setup", room: joinRoom } : { name: "menu" })} />}
          {view.name === "menu" && (
            <Menu
              onPlay={() => setView({ name: "play" })}
              onResume={(save) => setView({ name: "local", save })}
              onResumeOnline={(save) => setView({ name: "online", save })}
              onRules={() => setView({ name: "rules" })}
              onSettings={() => setView({ name: "settings" })}
            />
          )}
          {view.name === "play" && (
            <PlayChoice
              onOnline={() => setView({ name: "online-setup" })}
              onLocal={() => setView({ name: "setup" })}
              onBack={() => setView({ name: "menu" })}
            />
          )}
          {view.name === "settings" && <Settings onBack={() => setView({ name: "menu" })} />}
          {view.name === "online-setup" && (
            <OnlineSetup room={view.room} onBack={() => setView({ name: "menu" })} onReady={(save) => setView({ name: "online", save })} />
          )}
          {view.name === "setup" && <Setup onBack={() => setView({ name: "play" })} onStart={(save) => setView({ name: "local", save })} />}
          {view.name === "rules" && <Rules onBack={() => setView({ name: "menu" })} />}
        </PowerCycle>
      </div>
    </Crt>
  );
}

// ---------------------------------------------------------------------------
// Séquence de démarrage

const BOOT_LINES = [
  "SIGNAL//ZÉRO · TERMINAL DE CHIFFREMENT v2.0",
  "TEST MÉMOIRE ............. 640K OK",
  "MODULE DE CODAGE ......... OK",
  `DICTIONNAIRE ............. ${WORDS.length} MOTS`,
  "LIAISON RADIO ............ EN VEILLE",
  "> SYSTÈME PRÊT.",
];

function Boot({ onDone }: { onDone: () => void }) {
  const [ready, setReady] = useState(false);
  const lineDelay = 420;
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), BOOT_LINES.length * lineDelay + 300);
    return () => clearTimeout(id);
  }, []);
  const start = () => {
    unlockAudio();
    // Pas de plein écran automatique : sur les téléphones à encoche, certains
    // navigateurs laissent alors une bande claire en haut. L’application
    // installée s’ouvre déjà sans barre d’adresse.
    void keepScreenOn();
    enableMotion();
    play("boot");
    onDone();
  };
  return (
    <button type="button" class="screen boot" onClick={start} aria-label="Démarrer">
      <div class="boot__lines">
        {BOOT_LINES.map((line, index) => (
          <p key={index}>
            <TypeText text={line} delay={index * lineDelay} speed={12} />
          </p>
        ))}
      </div>
      <p class={`boot__press${ready ? " is-ready" : ""}`}>▶ TOUCHER L’ÉCRAN POUR DÉMARRER</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Menu principal

function Menu({
  onPlay,
  onResume,
  onResumeOnline,
  onRules,
  onSettings,
}: {
  onPlay: () => void;
  onResume: (save: LocalSave) => void;
  onResumeOnline: (save: OnlineSave) => void;
  onRules: () => void;
  onSettings: () => void;
}) {
  const [saved, setSaved] = useState(() => loadLocalGame());
  const [online, setOnline] = useState(() => loadOnlineGame());
  const onlineInProgress = online && online.state?.phase !== "over";
  const inProgress = saved && saved.state.phase !== "over";
  return (
    <div class="screen screen--center menu">
      <h1 class="logo" aria-label="Signal zéro">
        <span>SIGNAL</span>
        <span class="logo__slash">//</span>
        <span>ZÉRO</span>
      </h1>
      <p class="eyebrow">TRANSMETTRE · DÉCODER · INTERCEPTER</p>
      <nav class="menu__list">
        {inProgress && (
          <Button onClick={() => onResume(saved)}>
            ▶ REPRENDRE LA PARTIE
            <small>
              {saved.state.teams.A.name} contre {saved.state.teams.B.name} · manche {saved.state.rounds.length}
            </small>
          </Button>
        )}
        {onlineInProgress && (
          <Button onClick={() => onResumeOnline(online)}>
            ▶ REPRENDRE · CANAL {online.room}
            <small>
              {online.state
                ? `${online.state.teams.A.name} contre ${online.state.teams.B.name} · manche ${online.state.rounds.length}`
                : "Salle d’attente, deux téléphones"}
            </small>
          </Button>
        )}
        <Button variant={inProgress || onlineInProgress ? "ghost" : "primary"} onClick={onPlay} class="btn--big menu__play">
          {inProgress || onlineInProgress ? "▶ NOUVELLE PARTIE" : "▶ JOUER"}
        </Button>
      </nav>
      <p class="menu__links">
        <button type="button" class="linkish" onClick={onRules}>
          règles
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" class="linkish" onClick={onSettings}>
          réglages
        </button>
      </p>
      {(onlineInProgress || inProgress) && (
        <p class="menu__links menu__links--quiet">
          {onlineInProgress && (
            <button
              type="button"
              class="linkish"
              onClick={() => {
                clearOnlineGame();
                setOnline(null);
              }}
            >
              oublier le canal {online.room}
            </button>
          )}
          {inProgress && (
            <button
              type="button"
              class="linkish"
              onClick={() => {
                clearLocalGame();
                setSaved(null);
              }}
            >
              effacer la partie sauvegardée
            </button>
          )}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Choix du nombre de téléphones

function PlayChoice({ onOnline, onLocal, onBack }: { onOnline: () => void; onLocal: () => void; onBack: () => void }) {
  return (
    <div class="screen screen--center menu">
      <p class="prompt">&gt; COMBIEN DE TÉLÉPHONES ?</p>
      <nav class="menu__list">
        <Button onClick={onOnline}>
          ▶ DEUX TÉLÉPHONES
          <small>Un par équipe, reliés en direct. Recommandé.</small>
        </Button>
        <Button variant="ghost" onClick={onLocal}>
          ▶ UN SEUL TÉLÉPHONE
          <small>Les deux équipes se le passent</small>
        </Button>
        <Button variant="ghost" onClick={onBack}>
          ◀ RETOUR
        </Button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Réglages de l’appareil

function Settings({ onBack }: { onBack: () => void }) {
  const [sound, setSound] = useState(soundEnabled());
  const [shape, setShape] = useScreenShape();
  const device = useDevice();
  return (
    <div class="screen screen--center menu">
      <p class="prompt">&gt; RÉGLAGES</p>
      <nav class="menu__list">
        <Button
          variant="ghost"
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
          }}
        >
          ▶ SON : {sound ? "ACTIVÉ" : "COUPÉ"}
        </Button>
        <Button variant="ghost" onClick={() => setShape(shape === "curved" ? "flat" : "curved")}>
          ▶ ÉCRAN : {shape === "curved" ? "BOMBÉ" : "PLAT"}
          <small>{shape === "curved" ? "Tube cathodique légèrement bombé" : "Écran plat, lisibilité maximale"}</small>
        </Button>
        {device.canFullscreen && (
          <Button variant="ghost" onClick={() => void toggleFullscreen()}>
            ▶ PLEIN ÉCRAN : {device.fullscreen ? "ACTIVÉ" : "DÉSACTIVÉ"}
          </Button>
        )}
        {device.canInstall && (
          <Button variant="ghost" onClick={() => void promptInstall()}>
            ▶ INSTALLER L’APPLICATION
            <small>Icône sur l’écran d’accueil, plein écran, jouable hors ligne</small>
          </Button>
        )}
        <Button onClick={onBack}>◀ RETOUR</Button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Création des équipes

const SETUP_KEY = "signal-zero:last-setup";

function loadSetup(): Record<TeamId, SetupTeam> {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* Réglages par défaut. */
  }
  return { A: { name: "AMBRE", players: ["", ""] }, B: { name: "VERT", players: ["", ""] } };
}

function Setup({ onBack, onStart }: { onBack: () => void; onStart: (save: LocalSave) => void }) {
  const [teams, setTeams] = useState(loadSetup);
  const [toastNode, toast] = useToast();

  const update = (team: TeamId, patch: Partial<SetupTeam>) => setTeams({ ...teams, [team]: { ...teams[team], ...patch } });

  const start = () => {
    try {
      const save = newLocalGame({ teams });
      try {
        localStorage.setItem(SETUP_KEY, JSON.stringify(teams));
      } catch {
        /* Non bloquant. */
      }
      play("send");
      onStart(save);
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      play("error");
      toast(error.message);
    }
  };

  return (
    <div class="screen setup">
      <p class="prompt">&gt; NOUVELLE PARTIE · UN TÉLÉPHONE</p>
      <p class="hint">
        Au moins {MIN_PLAYERS} joueurs par équipe. Le crypteur change à chaque manche, dans l’ordre de la liste.
      </p>
      <div class="setup__teams">
        {(["A", "B"] as TeamId[]).map((team) => (
          <TeamFields key={team} team={team} value={teams[team]} onChange={(patch) => update(team, patch)} />
        ))}
      </div>
      <div class="actions">
        <Button variant="ghost" onClick={onBack}>
          ◀ RETOUR
        </Button>
        <Button onClick={start} class="btn--big" sound={null}>
          LANCER LA PARTIE ▶
        </Button>
      </div>
      {toastNode}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Règles

function Rules({ onBack }: { onBack: () => void }) {
  return (
    <div class="screen rules">
      <p class="prompt">&gt; RÈGLES DU JEU</p>
      <div class="rules__body">
        <section>
          <h2>BUT</h2>
          <p>
            Deux équipes s’affrontent. Chacune possède quatre mots-clés secrets numérotés de 1 à 4. Il faut faire deviner des codes à son
            équipe sans que l’équipe adverse ne les perce.
          </p>
        </section>
        <section>
          <h2>UNE MANCHE</h2>
          <p>
            Dans chaque équipe, le crypteur reçoit un code de trois chiffres (par exemple 3-1-4) et donne trois indices, un par chiffre,
            qui évoquent les mots-clés correspondants.
          </p>
          <p>
            Ensuite, pour chaque équipe à tour de rôle : les adversaires tentent d’intercepter le code, puis les coéquipiers du crypteur
            proposent le leur. Le code est alors révélé et les indices rejoignent le carnet.
          </p>
        </section>
        <section>
          <h2>JETONS</h2>
          <p>
            Intercepter le code adverse rapporte un <b>jeton d’interception</b>. Se tromper sur son propre code coûte un{" "}
            <b>jeton de malentendu</b>. Pas d’interception pendant la première manche.
          </p>
        </section>
        <section>
          <h2>VICTOIRE</h2>
          <p>
            Deux interceptions font gagner, deux malentendus font perdre. On vérifie à la fin de chaque manche. En cas d’égalité, ou
            après la huitième manche, on compte interceptions moins malentendus. Si l’égalité persiste, chaque équipe tente de
            retrouver les mots adverses.
          </p>
        </section>
        <section>
          <h2>INDICES</h2>
          <p>
            Un indice ne peut pas contenir un mot-clé ni être répété dans la partie. Il doit porter sur le sens du mot : pas d’allusion à
            l’orthographe, au nombre de lettres ou à un souvenir privé. Le crypteur ne dit rien pendant le décodage.
          </p>
        </section>
      </div>
      <Button variant="ghost" onClick={onBack}>
        ◀ RETOUR
      </Button>
    </div>
  );
}
