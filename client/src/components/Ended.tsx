import type { PublicState } from "../../../shared/types";

export function Ended({ state }: { state: PublicState }) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const me = state.players.find((p) => p.id === state.myPlayerId);
  const target = state.settings.pointsPerPlayer * state.players.length;

  return (
    <div className="app">
      <header className="header">
        <h1>Game over</h1>
        <p className="tagline">
          {winner ? `${winner.name} wins.` : "Game ended."} Target was {target}{" "}
          points.
        </p>
      </header>
      <main className="main">
        <section className="card">
          <h2>Final scores</h2>
          <ol className="rank">
            {ranked.map((p, i) => (
              <li
                key={p.id}
                className={
                  (p.id === state.winnerId ? "rank-winner " : "") +
                  (p.id === state.myPlayerId ? "rank-me" : "")
                }
              >
                <span className="rank-pos">{i + 1}</span>
                <span className="player-name">{p.name}</span>
                {p.id === state.myPlayerId && (
                  <span className="badge">you</span>
                )}
                {p.id === state.winnerId && (
                  <span className="badge host">winner</span>
                )}
                <span className="rank-score">{p.score}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="muted center">
          Your final score: <strong className="fg">{me?.score ?? 0}</strong>
        </p>
      </main>
    </div>
  );
}
