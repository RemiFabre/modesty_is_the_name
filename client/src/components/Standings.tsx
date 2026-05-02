import type { PublicState } from "../../../shared/types";

export function Standings({ state }: { state: PublicState }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const target = state.settings.pointsPerPlayer * state.players.length;
  return (
    <section className="card subtle">
      <h2>Standings</h2>
      <p className="muted small">
        Scores update at the end of each round. First to {target} points wins.
      </p>
      <ol className="rank">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className={p.id === state.myPlayerId ? "rank-me" : ""}
          >
            <span className="rank-pos">{i + 1}</span>
            <span className="player-name">
              {p.id === state.myPlayerId ? "You" : p.realName}
            </span>
            <span className="rank-score">{p.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
