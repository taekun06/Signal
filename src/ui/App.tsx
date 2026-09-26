import { useEffect, useState } from "preact/hooks";
import { play, setSoundEnabled, soundEnabled, unlockAudio } from "../fx/feedback";
import { type TeamId, MIN_PLAYERS, RuleError } from "../game/rules";
import { WORDS } from "../game/words";
import { type LocalSave, clearLocalGame, loadLocalGame, newLocalGame } from "../net/localGame";
import { Button, Crt, PowerCycle, TypeText } from "./kit";
import { LocalGame } from "./LocalGame";
import { useToast } from "./toast";

type View = { name: "boot" } | { name: "menu" } | { name: "setup" } | { name: "rules" } | { name: "local"; save: LocalSave };

export function App() {
  const [view, setView] = useState<View>({ name: "boot" });

  if (view.name === "local") {
    return <LocalGame key={view.save.state.seed} initial={view.save} onExit={() => setView({ name: "menu" })} />;
  }

  return (
    <Crt tint="A">
      <div class="app-frame">
        <PowerCycle id={view.name}>
          {view.name === "boot" && <Boot onDone={() => setView({ name: "menu" })} />}
          {view.name === "menu" && (
            <Menu
              onNew={() => setView({ name: "setup" })}
              onResume={(save) => setView({ name: "local", save })}
              onRules={() => setView({ name: "rules" })}
            />
          )}
          {view.name === "setup" && <Setup onBack={() => setView({ name: "menu" })} onStart={(save) => setView({ name: "local", save })} />}
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

function Menu({ onNew, onResume, onRules }: { onNew: () => void; onResume: (save: LocalSave) => void; onRules: () => void }) {
  const [saved, setSaved] = useState(() => loadLocalGame());
  const [sound, setSound] = useState(soundEnabled());
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
        <Button
          variant={inProgress ? "ghost" : "primary"}
          onClick={() => {
            onNew();
          }}
        >
          ▶ NOUVELLE PARTIE
          <small>Un téléphone pour les deux équipes</small>
        </Button>
        <Button variant="ghost" disabled sound={null}>
          ▶ PARTIE EN LIGNE
          <small>Deux téléphones · bientôt</small>
        </Button>
        <Button variant="ghost" onClick={onRules}>
          ▶ RÈGLES
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
          }}
        >
          ▶ SON : {sound ? "ACTIVÉ" : "COUPÉ"}
        </Button>
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
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Création des équipes

const SETUP_KEY = "signal-zero:last-setup";

interface SetupTeam {
  name: string;
  players: string[];
}

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
          <section class="setup__team" data-tint={team} key={team}>
            <label class="field">
              <span>{team === "A" ? "◆" : "▲"} NOM DE L’ÉQUIPE</span>
              <input
                id={`team-${team}`}
                value={teams[team].name}
                maxLength={18}
                autocomplete="off"
                onInput={(event) => update(team, { name: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>
            <div class="setup__players">
              {teams[team].players.map((player, index) => (
                <div class="setup__player" key={index}>
                  <span class="setup__num">{index + 1}</span>
                  <input
                    id={`player-${team}-${index}`}
                    value={player}
                    maxLength={16}
                    autocomplete="off"
                    placeholder={`Joueur ${index + 1}`}
                    onInput={(event) => {
                      const players = [...teams[team].players];
                      players[index] = (event.currentTarget as HTMLInputElement).value;
                      update(team, { players });
                    }}
                  />
                  {teams[team].players.length > MIN_PLAYERS && (
                    <button
                      type="button"
                      class="icon-btn"
                      aria-label={`Retirer le joueur ${index + 1}`}
                      onClick={() => update(team, { players: teams[team].players.filter((_, i) => i !== index) })}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {teams[team].players.length < 6 && (
                <button type="button" class="linkish" onClick={() => update(team, { players: [...teams[team].players, ""] })}>
                  + AJOUTER UN JOUEUR
                </button>
              )}
            </div>
          </section>
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
