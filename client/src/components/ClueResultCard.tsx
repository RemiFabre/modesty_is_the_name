import type { PublicPlayer } from "../../../shared/types";
import { WordPool } from "./WordPool";

export interface ClueResultCardProps {
  pool: readonly string[];
  cols: number;
  ownerId: string;
  ownerName: string;
  clue: { word: string; count: number; intended?: string[] };
  /** guesserId → targetId → picks (for that round). */
  allGuesses: { [guesserId: string]: { [targetId: string]: string[] } };
  players: readonly PublicPlayer[];
  myPlayerId: string;
  isMine?: boolean;
}

export function ClueResultCard({
  pool,
  cols,
  ownerId,
  ownerName,
  clue,
  allGuesses,
  players,
  myPlayerId,
  isMine,
}: ClueResultCardProps) {
  const intendedSet = new Set(clue.intended ?? []);
  const guessers = players.filter((p) => p.id !== ownerId);

  return (
    <section className="card">
      <h2>
        {ownerName}: <span className="clue-word">{clue.word}</span>{" "}
        <span className="clue-count">{clue.count}</span>
      </h2>
      <div className="reveal-pool">
        <WordPool words={pool} cols={cols} highlight={intendedSet} disabled />
      </div>
      <p className="muted small">
        Intended:{" "}
        {clue.intended && clue.intended.length > 0
          ? clue.intended.map((w) => w.toUpperCase()).join(" · ")
          : "-"}
      </p>
      <ul className="opponents">
        {guessers.map((g) => {
          const picks = allGuesses[g.id]?.[ownerId] ?? null;
          if (!picks) return null;
          let hits = 0;
          for (const p of picks) if (intendedSet.has(p)) hits++;
          const misses = picks.length - hits;
          const delta = hits - misses;
          return (
            <li key={g.id} className="reveal-row">
              <span className="player-name">
                {g.id === myPlayerId ? "You" : g.realName}
              </span>
              <span className="reveal-picks">
                {picks.map((p) => (
                  <span
                    key={p}
                    className={
                      "tag " + (intendedSet.has(p) ? "tag-good" : "tag-bad")
                    }
                  >
                    {p}
                  </span>
                ))}
              </span>
              <span className={"delta " + (delta >= 0 ? "good" : "bad")}>
                {delta >= 0 ? `+${delta}` : delta}
              </span>
            </li>
          );
        })}
      </ul>
      {isMine && (
        <p className="muted small">
          (You see your own clue here too. Guesses against it are how others
          scored on you.)
        </p>
      )}
    </section>
  );
}
