import { MIN_PLAYERS, type TeamId } from "../game/rules";

export interface SetupTeam {
  name: string;
  players: string[];
}

/** Prénoms facultatifs : une case vide devient « Agent 1 », « Agent 2 »… */
export function withAgentNames(team: SetupTeam): SetupTeam {
  return { ...team, players: team.players.map((player, index) => player.trim() || `Agent ${index + 1}`) };
}

/** Nom d’une équipe et liste de ses joueurs (ordre de passage du crypteur). */
export function TeamFields({ team, value, onChange }: { team: TeamId; value: SetupTeam; onChange: (patch: Partial<SetupTeam>) => void }) {
  return (
    <section class="setup__team" data-tint={team}>
      <label class="field">
        <span>{team === "A" ? "◆" : "▲"} NOM DE L’ÉQUIPE</span>
        <input
          id={`team-${team}`}
          value={value.name}
          maxLength={18}
          autocomplete="off"
          onInput={(event) => onChange({ name: (event.currentTarget as HTMLInputElement).value })}
        />
      </label>
      <div class="setup__players">
        {value.players.map((player, index) => (
          <div class="setup__player" key={index}>
            <span class="setup__num">{index + 1}</span>
            <input
              id={`player-${team}-${index}`}
              value={player}
              maxLength={16}
              autocomplete="off"
              placeholder={`Agent ${index + 1}`}
              onInput={(event) => {
                const players = [...value.players];
                players[index] = (event.currentTarget as HTMLInputElement).value;
                onChange({ players });
              }}
            />
            {value.players.length > MIN_PLAYERS && (
              <button
                type="button"
                class="icon-btn"
                aria-label={`Retirer le joueur ${index + 1}`}
                onClick={() => onChange({ players: value.players.filter((_, i) => i !== index) })}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {value.players.length < 6 && (
          <button type="button" class="linkish" onClick={() => onChange({ players: [...value.players, ""] })}>
            + AJOUTER UN JOUEUR
          </button>
        )}
      </div>
    </section>
  );
}
