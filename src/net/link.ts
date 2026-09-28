// Liaison brute entre les deux téléphones. Le téléphone hôte ouvre un canal
// (un code de 4 lettres) ; l’autre s’y branche. Par défaut, les téléphones se
// parlent en direct (WebRTC, via le service public et gratuit de PeerJS pour
// se trouver). Pour tester sans deux téléphones : `?liaison=locale` fait jouer
// deux onglets du même navigateur ensemble, et `?liaison=hote:port` utilise un
// serveur PeerJS à soi au lieu du service public.
//
// Cette couche ne fait que transporter des messages : la vérification que
// l’autre téléphone répond encore (battements) vit dans `onlineGame.ts`.

import type { DataConnection, Peer as PeerType, PeerOptions } from "peerjs";

export type LinkEvent =
  | { type: "message"; data: unknown }
  /** Le canal est ouvert (hôte) ou joint (invité). */
  | { type: "ready" }
  /** Le canal demandé est déjà pris par un autre téléphone (hôte). */
  | { type: "taken" }
  /** Aucun téléphone n’a ouvert ce canal (invité). */
  | { type: "missing" }
  | { type: "down" };

export interface Link {
  send(data: unknown): void;
  /** Invité : relance la connexion (après une coupure). */
  retry(): void;
  close(): void;
}

const PREFIX = "signal-zero-v1-";

// Serveurs qui aident les deux téléphones à se joindre. STUN suffit sur un
// même Wi-Fi ; entre deux réseaux (4G, box qui isole les appareils), il faut
// un relais TURN. Les relais par défaut de PeerJS (eu-0/us-0.turn.peerjs.com)
// n’existent plus : on utilise le relais public et gratuit « Open Relay » de
// Metered, sur les ports web pour passer les réseaux filtrés.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];
// Lettres sans ambiguïté à l’oral comme à l’écran (pas de I, O, 0, 1).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomRoom(): string {
  const values = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(values, (value) => ALPHABET[value % ALPHABET.length]).join("");
}

export function cleanRoom(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/[IO]/g, (c) => (c === "I" ? "J" : "Q"))
    .slice(0, 4);
}

/** Mode de test choisi dans l’adresse (conservé pour l’onglet), sinon null. */
export function testLink(): string | null {
  try {
    const param = new URLSearchParams(location.search).get("liaison");
    if (param) sessionStorage.setItem("signal-zero:liaison", param);
    return param ?? sessionStorage.getItem("signal-zero:liaison");
  } catch {
    return null;
  }
}

export function openLink(role: "host" | "guest", room: string, emit: (event: LinkEvent) => void): Link {
  const test = testLink();
  if (test === "locale") return openLocal(role, room, emit);
  const [host, port] = test?.split(":") ?? [];
  return openPeer(role, room, emit, host && port ? { host, port: Number(port), path: "/", secure: false } : {});
}

// ---------------------------------------------------------------------------
// Deux onglets du même navigateur

function openLocal(role: "host" | "guest", room: string, emit: (event: LinkEvent) => void): Link {
  const channel = new BroadcastChannel(`signal-zero:${room}`);
  const other = role === "host" ? "guest" : "host";
  channel.onmessage = (event) => {
    const packet = event.data as { from: string; data: unknown };
    if (packet.from === other) emit({ type: "message", data: packet.data });
  };
  setTimeout(() => emit({ type: "ready" }), 50);
  return {
    send: (data) => channel.postMessage({ from: role, data }),
    retry: () => {},
    close: () => channel.close(),
  };
}

// ---------------------------------------------------------------------------
// Deux téléphones en direct

function openPeer(role: "host" | "guest", room: string, emit: (event: LinkEvent) => void, server: PeerOptions): Link {
  let closed = false;
  let peer: PeerType | null = null;
  let connections: DataConnection[] = [];
  let retryTimer = 0;

  const watch = (conn: DataConnection) => {
    conn.on("open", () => {
      connections = [...connections.filter((c) => c.open && c !== conn), conn];
      if (role === "guest") emit({ type: "ready" });
    });
    conn.on("data", (data) => emit({ type: "message", data }));
    conn.on("close", () => {
      // Une liaison fermée volontairement (rebranchement) ne compte pas.
      if (!connections.includes(conn)) return;
      connections = connections.filter((c) => c !== conn);
      if (role === "guest" && !closed) emit({ type: "down" });
    });
    conn.on("error", () => conn.close());
  };

  const connect = () => {
    if (closed || !peer || peer.destroyed) return;
    if (peer.disconnected) peer.reconnect();
    const old = connections;
    connections = [];
    for (const conn of old) conn.close();
    watch(peer.connect(PREFIX + room, { reliable: true, serialization: "json" }));
  };

  const start = async () => {
    const { Peer } = await import("peerjs");
    if (closed) return;
    const options: PeerOptions = { ...server, config: { iceServers: ICE_SERVERS }, debug: 0 };
    peer = role === "host" ? new Peer(PREFIX + room, options) : new Peer(options);
    peer.on("open", () => {
      if (role === "host") emit({ type: "ready" });
      else connect();
    });
    peer.on("connection", (conn) => role === "host" && watch(conn));
    peer.on("disconnected", () => {
      // Le service qui permet de se trouver a lâché : les liaisons déjà
      // établies continuent, on se réinscrit simplement.
      if (!closed) window.setTimeout(() => peer && !peer.destroyed && peer.disconnected && peer.reconnect(), 1500);
    });
    peer.on("error", (error) => {
      if (closed) return;
      const type = (error as { type?: string }).type;
      if (type === "unavailable-id") {
        emit({ type: "taken" });
      } else if (type === "peer-unavailable") {
        emit({ type: "missing" });
      } else if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed") {
        emit({ type: "down" });
      }
    });
  };
  void start().catch(() => emit({ type: "down" }));

  return {
    send(data) {
      for (const conn of connections) if (conn.open) conn.send(data);
    },
    retry() {
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(connect, 200);
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      peer?.destroy();
    },
  };
}
