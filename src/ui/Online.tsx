// Partie sur deux téléphones : ouverture du canal, branchement de l’autre
// équipe, puis la partie vue depuis le téléphone de chaque équipe.

import { useEffect, useRef, useState } from "preact/hooks";
import { PHOSPHOR, runOscilloscope } from "../fx/canvasFx";
import { play, vibrate } from "../fx/feedback";
import {
  type GameState,
  type TeamId,
  RuleError,
  currentRound,
  endOfRoundResult,
  interceptionAllowed,
  otherTeam,
  pendingTeams,
  sanitizeConfig,
} from "../game/rules";
import { cleanRoom, testLink } from "../net/link";
import { randomSeed } from "../net/localGame";
import {
  type LinkStatus,
  type OnlineSave,
  type OnlineSession,
  clearOnlineGame,
  newOnlineSave,
  useOnlineSession,
} from "../net/onlineGame";
import { PixelIcon } from "./icons";
import { CarnetPull } from "./Carnet";
import { Button, Countdown, Crt, HeaderBar, PowerCycle, RoundSteps, TypeText, teamMark } from "./kit";
import { PauseMenu } from "./PauseMenu";
import { Qr } from "./Qr";
import { CluesScreen, DecodeScreen, GameOverScreen, HandoffScreen, RevealScreen, SummaryScreen, TiebreakScreen } from "./screens";
import { type SetupTeam, TeamFields } from "./TeamFields";
import { useToast } from "./toast";

const TEAM_KEY = "signal-zero:online-team";

function loadTeam(): SetupTeam {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* Valeurs par défaut. */
  }
  return { name: "", players: ["", ""] };
}

/** Adresse que l’appareil photo de l’autre téléphone ouvre directement. */
export function joinUrl(room: string): string {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("salle", room);
  const test = testLink();
  if (test) url.searchParams.set("liaison", test);
  return url.href;
}

// ---------------------------------------------------------------------------
// Préparation : ouvrir un canal ou s’y brancher

type Mode = "choose" | "host" | "join";

export function OnlineSetup({ room, onBack, onReady }: { room?: string; onBack: () => void; onReady: (save: OnlineSave) => void }) {
  const [mode, setMode] = useState<Mode>(room ? "join" : "choose");
  const [code, setCode] = useState(room ?? "");
  const [team, setTeam] = useState(loadTeam);
  const [toastNode, toast] = useToast();
  const tint: TeamId = mode === "join" ? "B" : "A";

  const go = () => {
    const name = team.name.trim() || (mode === "host" ? "AMBRE" : "VERT");
    try {
      const config = sanitizeConfig({ name, players: team.players }, name);
      if (mode === "join" && code.length !== 4) throw new RuleError("Le code du canal fait quatre lettres.");
      try {
        localStorage.setItem(TEAM_KEY, JSON.stringify(team));
      } catch {
        /* Non bloquant. */
      }
      play("send");
      onReady(newOnlineSave(mode === "host" ? "host" : "guest", config, mode === "join" ? code : undefined));
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      play("error");
      toast(error.message);
    }
  };

  if (mode === "choose") {
    return (
      <div class="screen screen--center online-choose">
        <p class="prompt">&gt; DEUX TÉLÉPHONES</p>
        <p class="lead">Un téléphone par équipe. L’un ouvre un canal, l’autre s’y branche avec le code ou le QR code.</p>
        <nav class="menu__list">
          <Button onClick={() => setMode("host")}>
            ▶ OUVRIR UN CANAL
            <small>Ton équipe joue {teamMark("A")} ambre et lance la partie</small>
          </Button>
          <Button variant="ghost" onClick={() => setMode("join")}>
            ▶ SE BRANCHER SUR UN CANAL
            <small>Ton équipe joue {teamMark("B")} vert</small>
          </Button>
          <Button variant="ghost" onClick={onBack}>
            ◀ RETOUR
          </Button>
        </nav>
      </div>
    );
  }

  return (
    <div class="screen setup" data-tint={tint}>
      <p class="prompt">&gt; {mode === "host" ? "OUVRIR UN CANAL" : "SE BRANCHER"}</p>
      {mode === "join" && (
        <label class="field channel-field">
          <span>CODE DU CANAL</span>
          <input
            id="channel-code"
            class="channel-input"
            value={code}
            maxLength={4}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck={false}
            placeholder="····"
            onInput={(event) => setCode(cleanRoom((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
      )}
      <p class="hint">Ton équipe, sur ce téléphone. Au moins deux joueurs ; le crypteur change à chaque manche, dans l’ordre de la liste.</p>
      <div class="setup__teams setup__teams--one">
        <TeamFields
          team={tint}
          value={team}
          onChange={(patch) => setTeam({ ...team, ...patch })}
        />
      </div>
      <div class="actions">
        <Button variant="ghost" onClick={() => (room ? onBack() : setMode("choose"))}>
          ◀ RETOUR
        </Button>
        <Button onClick={go} class="btn--big" sound={null}>
          {mode === "host" ? "OUVRIR ▶" : "SE BRANCHER ▶"}
        </Button>
      </div>
      {toastNode}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Témoin de liaison (en-tête)

const STATUS_LABEL: Record<LinkStatus, string> = {
  connecting: "RECHERCHE",
  waiting: "EN ÉCOUTE",
  online: "LIAISON",
  lost: "COUPÉE",
  missing: "INTROUVABLE",
  full: "OCCUPÉ",
};

function LinkLed({ status }: { status: LinkStatus }) {
  return (
    <span class={`link-led is-${status}`} role="status" aria-label={`Liaison : ${STATUS_LABEL[status].toLowerCase()}`}>
      <i />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Son et vibration quand l’autre téléphone répond, ou qu’on le perd. */
function useLinkFeedback(status: LinkStatus) {
  const previous = useRef(status);
  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (status === "online" && before !== "online") {
      play("modem");
      vibrate([30, 60, 30]);
    } else if (status === "lost" && before === "online") {
      play("cut");
      vibrate(120);
    }
  }, [status]);
}

// ---------------------------------------------------------------------------
// Salle d’attente

function Lobby({ session, onLeave }: { session: OnlineSession; onLeave: () => void }) {
  const { save, status } = session;
  const host = save.role === "host";
  const ready = host && status === "online" && !!save.opponent;
  const url = joinUrl(save.room);

  let line: string;
  if (status === "full") line = "Une autre équipe occupe déjà ce canal.";
  else if (status === "missing") line = `Aucun téléphone n’émet sur le canal ${save.room}. Vérifie le code.`;
  else if (status === "connecting") line = host ? "Ouverture du canal…" : "Recherche de la porteuse…";
  else if (status === "waiting") line = "En écoute. Branche le téléphone de l’équipe adverse.";
  else if (status === "lost") line = "Liaison perdue, on la rétablit…";
  else if (host) line = "Liaison établie. Lance la partie quand tout le monde est prêt.";
  else line = `Liaison établie. L’équipe ${save.opponent?.name.toUpperCase() ?? "hôte"} lance la partie.`;

  const opponentTeam = otherTeam(save.team);

  // Liaison qui ne vient pas : on explique quoi essayer au lieu d’attendre en silence.
  const [slow, setSlow] = useState(false);
  const searching = !host && (status === "connecting" || status === "lost");
  useEffect(() => {
    setSlow(false);
    if (!searching) return;
    const id = window.setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(id);
  }, [searching]);

  return (
    <div class="screen lobby">
      <Scope team={save.team} calm={status !== "online"} />
      <div class="lobby__head">
        <span class="eyebrow">CANAL</span>
        <p class="lobby__code" aria-label={`Canal ${save.room.split("").join(" ")}`}>
          {save.room.split("").map((letter, index) => (
            <b key={`${save.room}-${index}`} style={{ "--i": index }}>
              {letter}
            </b>
          ))}
        </p>
        <p class={`lobby__line is-${status}`}>
          <i />
          {line}
        </p>
        {slow && searching && (
          <p class="hint lobby__slow" role="status">
            La liaison tarde. Vérifie que l’autre téléphone affiche bien le canal {save.room} et garde son écran allumé. Si ça bloque
            encore, mettez les deux téléphones sur le même Wi-Fi.
          </p>
        )}
      </div>
      {host && status !== "online" && (
        <div class="lobby__qr">
          <Qr text={url} label={`QR code pour rejoindre le canal ${save.room}`} />
          <p class="hint">
            Sur l’autre téléphone : vise ce QR code avec l’appareil photo, ou ouvre le jeu et choisis « se brancher » avec le code{" "}
            <b>{save.room}</b>.
          </p>
        </div>
      )}
      <div class="lobby__teams">
        <LobbyTeam team={save.team} name={save.me.name} players={save.me.players} you />
        <span class="lobby__versus" aria-hidden="true">
          ⇄
        </span>
        {save.opponent && status === "online" ? (
          <LobbyTeam team={opponentTeam} name={save.opponent.name} players={save.opponent.players} />
        ) : (
          <div class="lobby__team is-empty" data-tint={opponentTeam}>
            <span class="lobby__name">{teamMark(opponentTeam)} · · ·</span>
            <span class="hint">en attente</span>
          </div>
        )}
      </div>
      <div class="lobby__timer">
        {host ? (
          <button type="button" class="linkish" onClick={() => session.setTimer(!save.timer)}>
            ⧗ SABLIER DE 30 S APRÈS LE PREMIER CRYPTEUR : {save.timer ? "ACTIVÉ" : "COUPÉ"}
          </button>
        ) : (
          <span class="hint">⧗ Sablier de 30 s après le premier crypteur : {save.timer ? "activé" : "coupé"}</span>
        )}
      </div>
      <div class="actions">
        <Button variant="ghost" onClick={onLeave}>
          ◀ QUITTER
        </Button>
        {host && (
          <Button onClick={() => session.start()} class="btn--big" disabled={!ready} sound="send">
            LANCER LA PARTIE ▶
          </Button>
        )}
      </div>
    </div>
  );
}

function LobbyTeam({ team, name, players, you = false }: { team: TeamId; name: string; players: string[]; you?: boolean }) {
  return (
    <div class="lobby__team" data-tint={team}>
      <span class="eyebrow">{you ? "CE TÉLÉPHONE" : "EN FACE"}</span>
      <span class="lobby__name">
        {teamMark(team)} <TypeText text={name.toUpperCase()} speed={50} />
      </span>
      <span class="hint">{players.join(" · ")}</span>
    </div>
  );
}

/** Trace d’oscilloscope en fond : calme en écoute, vive une fois branché. */
function Scope({ team, calm }: { team: TeamId; calm: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(canvas.offsetWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.offsetHeight * dpr));
    return runOscilloscope(canvas, PHOSPHOR[team], 0.5);
  }, [team]);
  return <canvas class={`lobby__scope${calm ? " is-calm" : ""}`} ref={canvasRef} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Écoute : ce téléphone attend l’équipe d’en face

function ListenScreen({ state, team }: { state: GameState; team: TeamId }) {
  const round = currentRound(state);
  const other = otherTeam(team);
  const otherName = state.teams[other].name.toUpperCase();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(canvas.offsetWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.offsetHeight * dpr));
    // La trace de l’autre équipe passe sur notre écran : on l’écoute.
    return runOscilloscope(canvas, PHOSPHOR[other], 0.3);
  }, [other]);

  let title: string;
  let sub: string;
  let note: string;
  if (state.phase === "clues") {
    title = "MESSAGE PARTI";
    sub = `l’équipe ${otherName} chiffre le sien`;
    note = "Posez le téléphone au milieu de l’équipe : vous décoderez ensemble.";
  } else if (state.phase === "decode" && state.active === team) {
    title = "EN ÉCOUTE";
    sub = `l’équipe ${otherName} tente d’intercepter votre signal`;
    note = `${round.transmissions[team].encryptor} garde le silence jusqu’à la révélation.`;
  } else if (state.phase === "decode") {
    title = "EN ÉCOUTE";
    sub = `l’équipe ${otherName} décode son propre signal`;
    note = interceptionAllowed(state) ? "Votre interception est verrouillée." : "Pas d’interception pendant la première manche.";
  } else {
    title = "EN ÉCOUTE";
    sub = `l’équipe ${otherName} cherche vos quatre mots`;
    note = "Dernière chance de départager les équipes.";
  }

  return (
    <div class="screen handoff listen" data-tint={other}>
      <canvas class="handoff__trace" ref={canvasRef} aria-hidden="true" />
      <span class="handoff__grat" aria-hidden="true" />
      <div class="handoff__ui">
        <div class="handoff__read" aria-hidden="true">
          <span>CH2 · RÉCEPTION</span>
          <span class="handoff__live">● {teamMark(other)} {otherName}</span>
        </div>
        <div class="handoff__who">
          <span class="eyebrow">{title}</span>
          <h1 class="listen__title">
            <TypeText text={sub.toUpperCase()} speed={30} cursor />
          </h1>
          {state.phase === "clues" && <Countdown deadline={state.clueDeadline} />}
        </div>
        <p class="handoff__warn" data-tint={team}>
          <PixelIcon name="eye" size={18} />
          {note}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partie en cours

export function OnlineGame({ initial, onExit }: { initial: OnlineSave; onExit: () => void }) {
  const session = useOnlineSession(initial);
  const { save, status } = session;
  const [toastNode, toast] = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [summary, setSummary] = useState<number | null>(null);
  useLinkFeedback(status);

  // Refus de l’hôte (rare : les deux téléphones ont agi en même temps).
  useEffect(() => {
    if (session.notice) {
      toast(session.notice);
      session.clearNotice();
    }
  });

  const leave = () => {
    clearOnlineGame();
    onExit();
  };

  const state = save.state;
  const me = save.team;

  if (!state) {
    return (
      <Crt tint={me}>
        <div class="app-frame">
          <div class="hud-row hud-row--lobby">
            <LinkLed status={status} />
          </div>
          <PowerCycle id="lobby">
            <Lobby session={session} onLeave={leave} />
          </PowerCycle>
          {toastNode}
        </div>
      </Crt>
    );
  }

  const round = currentRound(state);
  const myTurn = pendingTeams(state).includes(me);
  const transmission = round.transmissions[me];
  const task = `clues:${round.number}:${transmission.code.join("")}`;
  const handoff = state.phase === "clues" && myTurn && save.holder !== task;
  const showSummary = summary === round.number && state.phase === "reveal";

  const mine = state.teams[me];
  const theirs = state.teams[otherTeam(me)];
  const tension =
    state.phase === "over"
      ? 0
      : mine.miscommunications >= 1 || theirs.interceptions >= 1
        ? 2
        : round.number >= state.settings.maxRounds - 1 || mine.interceptions >= 1
          ? 1
          : 0;

  const dispatch = session.dispatch;
  const continueReveal = () => dispatch({ type: "continue", round: round.number, active: state.active });
  const endsGame = state.phase === "reveal" && state.active === "B" && endOfRoundResult(state) !== null;
  const revealLabel =
    state.active === "A" ? (
      <>
        SIGNAL SUIVANT ▶
        <small>
          celui de l’équipe {teamMark("B")} {state.teams.B.name.toUpperCase()}
        </small>
      </>
    ) : endsGame ? (
      "RÉSULTAT FINAL ▶"
    ) : (
      "BILAN DE LA MANCHE ▶"
    );

  const screenId = [state.seed, state.phase, round.number, state.active, myTurn ? "play" : "wait", handoff ? "handoff" : "", showSummary ? "summary" : ""].join(":");
  const fit = !showSummary && (handoff || state.phase === "clues" || (!myTurn && (state.phase === "decode" || state.phase === "tiebreak")));

  let content;
  if (showSummary) {
    content = (
      <SummaryScreen
        state={state}
        onContinue={() => {
          setSummary(null);
          continueReveal();
        }}
      />
    );
  } else if (handoff) {
    content = <HandoffScreen state={state} team={me} onReady={() => session.setHolder(task)} />;
  } else if (myTurn && state.phase === "clues") {
    content = <CluesScreen state={state} team={me} dispatch={dispatch} toast={toast} />;
  } else if (myTurn && state.phase === "decode") {
    content = <DecodeScreen state={state} team={me} dispatch={dispatch} toast={toast} />;
  } else if (myTurn && state.phase === "tiebreak") {
    content = <TiebreakScreen state={state} team={me} dispatch={dispatch} toast={toast} />;
  } else if (state.phase === "reveal") {
    content = (
      <RevealScreen
        state={state}
        continueLabel={revealLabel}
        onContinue={() => (state.active === "B" && !endsGame ? setSummary(round.number) : continueReveal())}
      />
    );
  } else if (state.phase === "over") {
    content = <GameOverScreen state={state} onRematch={() => dispatch({ type: "rematch", seed: randomSeed() })} onMenu={leave} />;
  } else {
    content = <ListenScreen state={state} team={me} />;
  }

  return (
    <Crt tint={me} tension={tension}>
      <div class={`app-frame app-frame--game${fit ? " is-fit" : ""}`}>
        <div class="hud-row">
          <CarnetPull state={state} viewer={me}>
            <HeaderBar state={state} label={state.phase === "tiebreak" ? "DÉPARTAGE" : undefined} focus={me} />
          </CarnetPull>
          <div class="hud-side">
            <button type="button" class="menu-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
              ≡
            </button>
            <LinkLed status={status} />
          </div>
        </div>
        {status !== "online" && (
          <p class="link-banner" role="alert">
            LIAISON PERDUE AVEC L’AUTRE TÉLÉPHONE · RECONNEXION…
          </p>
        )}
        {state.phase !== "over" && state.phase !== "tiebreak" && !showSummary && <RoundSteps state={state} />}
        <PowerCycle id={screenId} offOn={handoff}>
          {content}
        </PowerCycle>
        {toastNode}
        {menuOpen && (
          <PauseMenu
            onClose={() => setMenuOpen(false)}
            onQuit={onExit}
            note={`Partie sauvegardée sur ce téléphone (canal ${save.room}) : tu pourras la reprendre depuis le menu.`}
          />
        )}
      </div>
    </Crt>
  );
}
