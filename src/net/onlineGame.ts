// Partie sur deux téléphones, une équipe par téléphone.
//
// Le téléphone hôte (équipe ◆) détient la partie : il applique toutes les
// actions et renvoie l’état complet à l’autre téléphone (équipe ▲) après
// chaque changement. L’invité applique ses propres actions tout de suite pour
// que l’écran réagisse sans attendre, les envoie, puis se range à l’état de
// l’hôte. Le moteur de règles étant déterministe, les deux calculs coïncident.
//
// Chaque téléphone garde la partie dans son stockage : après un rechargement,
// une mise en veille ou une coupure réseau, la liaison se rétablit d’elle-même.

import { useEffect, useState } from "preact/hooks";
import { type Action, type GameState, type TeamConfig, type TeamId, RuleError, applyAction, createGame } from "../game/rules";
import { type Link, type LinkEvent, openLink, randomRoom, testLink } from "./link";
import { randomSeed } from "./localGame";

const STORAGE_KEY = "signal-zero:online-game";
const PING_EVERY = 2000;
const LOST_AFTER = 7000;
const RETRY_EVERY = 6000;

export type Role = "host" | "guest";

export interface OnlineSave {
  role: Role;
  room: string;
  /** Équipe de ce téléphone : ◆ pour l’hôte, ▲ pour l’invité. */
  team: TeamId;
  me: TeamConfig;
  opponent: TeamConfig | null;
  /** Sablier de 30 secondes après le premier crypteur (réglé par l’hôte). */
  timer: boolean;
  state: GameState | null;
  holder: string | null;
  /** Invité : actions envoyées que l’hôte n’a pas encore confirmées. */
  pending: { id: number; action: Action }[];
  nextId: number;
  /** Hôte : dernière action de l’invité appliquée, et identité de son téléphone. */
  ack: number;
  guestDevice: string | null;
  device: string;
}

export type LinkStatus =
  /** Recherche du canal ou de l’autre téléphone. */
  | "connecting"
  /** Hôte : canal ouvert, personne encore. */
  | "waiting"
  | "online"
  /** Plus de nouvelles de l’autre téléphone depuis quelques secondes. */
  | "lost"
  /** Invité : aucun téléphone n’a ouvert ce canal. */
  | "missing"
  /** Invité : une autre équipe occupe déjà la place. */
  | "full";

type Message =
  | { t: "hello"; team: TeamConfig; device: string }
  | { t: "act"; id: number; action: Action }
  | { t: "ping" }
  | { t: "sync"; host: TeamConfig; guest: TeamConfig | null; timer: boolean; state: GameState | null; ack: number }
  | { t: "reject"; id: number; message: string }
  | { t: "full" };

/** Deux onglets du même navigateur (test) : chacun garde sa propre partie. */
const store = () => (testLink() === "locale" ? sessionStorage : localStorage);

export function loadOnlineGame(): OnlineSave | null {
  try {
    const raw = store().getItem(STORAGE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as OnlineSave;
    return save?.room && save.me ? save : null;
  } catch {
    return null;
  }
}

function persist(save: OnlineSave | null) {
  try {
    if (save) store().setItem(STORAGE_KEY, JSON.stringify(save));
    else store().removeItem(STORAGE_KEY);
  } catch {
    /* Stockage indisponible : la partie continue sans sauvegarde. */
  }
}

export function clearOnlineGame(): void {
  persist(null);
}

function deviceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newOnlineSave(role: Role, me: TeamConfig, room = randomRoom()): OnlineSave {
  const save: OnlineSave = {
    role,
    room,
    team: role === "host" ? "A" : "B",
    me,
    opponent: null,
    timer: true,
    state: null,
    holder: null,
    pending: [],
    nextId: 1,
    ack: 0,
    guestDevice: null,
    device: deviceId(),
  };
  persist(save);
  return save;
}

/** Actions qu’un téléphone a le droit de jouer pour son équipe. */
function allowed(action: Action, team: TeamId, state: GameState): boolean {
  if (action.type === "rematch") return state.phase === "over";
  if (action.type === "continue") return true;
  return action.team === team;
}

/** Heure de l’hôte pour le sablier ; un sablier écoulé chez l’invité fait foi. */
function stamp(action: Action, state: GameState): Action {
  if (action.type !== "submitClues") return action;
  const now = action.force ? Math.max(Date.now(), state.clueDeadline ?? 0) : Date.now();
  return { ...action, now };
}

export class OnlineSession {
  save: OnlineSave;
  status: LinkStatus = "connecting";
  /** Dernier refus de l’hôte à afficher (erreur de règle). */
  notice: string | null = null;
  private link: Link | null = null;
  private listeners = new Set<() => void>();
  private lastHeard = 0;
  private pinger = 0;
  private reopenTimer = 0;
  private lastAttempt = Date.now();
  private closed = false;

  constructor(save: OnlineSave) {
    this.save = save;
    this.open();
    this.pinger = window.setInterval(() => this.tick(), PING_EVERY);
    document.addEventListener("visibilitychange", this.onVisible);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private update(patch: Partial<OnlineSave>) {
    this.save = { ...this.save, ...patch };
    persist(this.save);
    this.emit();
  }

  /** Où en est la liaison, pour l’afficher quand elle tarde. */
  diagnostic(): string {
    return this.link?.diagnostic() ?? "";
  }

  private setStatus(status: LinkStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  private open() {
    this.link?.close();
    this.link = openLink(this.save.role, this.save.room, (event) => this.onLink(event));
  }

  private reopen(delay: number) {
    clearTimeout(this.reopenTimer);
    this.reopenTimer = window.setTimeout(() => !this.closed && this.open(), delay);
  }

  private onVisible = () => {
    // Retour de veille : on vérifie tout de suite que l’autre est là.
    if (!document.hidden) this.tick(true);
  };

  private send(message: Message) {
    this.link?.send(message);
  }

  private onLink(event: LinkEvent) {
    const host = this.save.role === "host";
    switch (event.type) {
      case "ready":
        if (host) this.setStatus(this.save.guestDevice ? "lost" : "waiting");
        else this.hello();
        return;
      case "taken":
        // Canal encore réservé après un rechargement : on réessaie. Une salle
        // toute neuve change simplement de code.
        if (!this.save.state && !this.save.opponent) this.update({ room: randomRoom() });
        this.reopen(this.save.state || this.save.opponent ? 3000 : 100);
        return;
      case "missing":
        this.setStatus(this.save.state || this.save.opponent ? "lost" : "missing");
        return;
      case "down":
        if (this.status === "online") this.setStatus("lost");
        return;
      case "message":
        this.lastHeard = Date.now();
        if (host) this.onGuestMessage(event.data as Message);
        else this.onHostMessage(event.data as Message);
    }
  }

  private hello() {
    this.send({ t: "hello", team: this.save.me, device: this.save.device });
  }

  private tick(force = false) {
    const now = Date.now();
    if (this.status === "online" && now - this.lastHeard > LOST_AFTER) this.setStatus("lost");
    if (this.save.role === "guest" && this.status !== "online" && this.status !== "full") {
      // Tant que l’hôte ne répond pas, on se présente à nouveau et, de temps
      // en temps, on rebranche la liaison.
      this.hello();
      if (force || now - this.lastAttempt > RETRY_EVERY) {
        this.lastAttempt = now;
        this.link?.retry();
      }
    }
    if (this.save.role === "host" && this.status === "connecting" && now - this.lastAttempt > RETRY_EVERY * 2) {
      // Le canal ne s’est jamais ouvert (service injoignable) : on recommence.
      this.lastAttempt = now;
      this.open();
    }
    this.send({ t: "ping" });
  }

  // -------------------------------------------------------------------------
  // Côté hôte

  private sync() {
    const { me, opponent, timer, state, ack } = this.save;
    this.send({ t: "sync", host: me, guest: opponent, timer, state, ack });
  }

  private onGuestMessage(message: Message) {
    if (message.t === "hello") {
      const current = this.save.guestDevice;
      // Une fois la partie lancée, seule l’équipe d’origine peut revenir, sauf
      // si son téléphone a disparu (téléphone changé, stockage effacé).
      if (current && current !== message.device && this.save.state && this.status === "online") {
        this.send({ t: "full" });
        return;
      }
      if (current !== message.device && this.save.state) {
        // Nouveau téléphone pour la même équipe : ses actions repartent de zéro.
        this.update({ guestDevice: message.device, ack: 0 });
      }
      const patch: Partial<OnlineSave> = { guestDevice: message.device };
      if (!this.save.state) patch.opponent = message.team;
      this.update(patch);
      this.setStatus("online");
      this.sync();
      return;
    }
    if (message.t === "act") {
      if (message.id <= this.save.ack) return this.sync(); // Déjà appliquée.
      const state = this.save.state;
      if (!state) return;
      let next = state;
      if (allowed(message.action, "B", state)) {
        try {
          next = applyAction(state, stamp(message.action, state));
        } catch (error) {
          if (!(error instanceof RuleError)) throw error;
          this.send({ t: "reject", id: message.id, message: error.message });
        }
      }
      this.update({ state: next, ack: message.id });
      this.sync();
    }
  }

  /** Hôte : lance la partie une fois l’équipe adverse présente. */
  start() {
    const { me, opponent, timer } = this.save;
    if (this.save.role !== "host" || !opponent) return;
    const state = createGame({ teams: { A: me, B: opponent }, settings: { timerSeconds: timer ? 30 : 0 } }, randomSeed());
    this.update({ state, holder: null });
    this.sync();
  }

  setTimer(timer: boolean) {
    if (this.save.role !== "host" || this.save.state) return;
    this.update({ timer });
    this.sync();
  }

  // -------------------------------------------------------------------------
  // Côté invité

  private onHostMessage(message: Message) {
    if (message.t === "full") {
      this.setStatus("full");
      return;
    }
    if (message.t === "reject") {
      this.notice = message.message;
      this.emit();
      return;
    }
    if (message.t !== "sync") return;
    this.setStatus("online");
    const pending = this.save.pending.filter((item) => item.id > message.ack);
    // Les actions pas encore reçues par l’hôte restent visibles ici.
    let state = message.state;
    for (const item of pending) {
      if (!state) break;
      try {
        state = applyAction(state, item.action);
      } catch {
        /* Devenue impossible : l’hôte tranchera. */
      }
    }
    this.update({
      opponent: message.host,
      timer: message.timer,
      state,
      pending,
    });
    for (const item of pending) this.send({ t: "act", id: item.id, action: item.action });
  }

  // -------------------------------------------------------------------------
  // Commun

  /** Joue une action ; les erreurs de règle remontent à l’appelant. */
  dispatch = (action: Action): GameState => {
    const state = this.save.state;
    if (!state) throw new RuleError("La partie n’a pas encore commencé.");
    if (this.save.role === "host") {
      if (!allowed(action, "A", state)) return state;
      const next = applyAction(state, stamp(action, state));
      this.update({ state: next });
      this.sync();
      return next;
    }
    const next = applyAction(state, action);
    const id = this.save.nextId;
    this.update({ state: next, pending: [...this.save.pending, { id, action }], nextId: id + 1 });
    this.send({ t: "act", id, action });
    return next;
  };

  setHolder = (holder: string | null) => this.update({ holder });

  clearNotice() {
    this.notice = null;
  }

  close() {
    this.closed = true;
    clearInterval(this.pinger);
    clearTimeout(this.reopenTimer);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.link?.close();
    this.link = null;
  }
}

export function useOnlineSession(initial: OnlineSave) {
  const [session] = useState(() => new OnlineSession(initial));
  const [, setVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = session.subscribe(() => setVersion((v) => v + 1));
    return () => {
      unsubscribe();
      session.close();
    };
  }, [session]);
  return session;
}
