import type { PublicState } from "../../../shared/types";
import { NationsPanel } from "./Nations";

export function Ended({ state }: { state: PublicState }) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const me = state.players.find((p) => p.id === state.myPlayerId);
  const target = state.settings.pointsPerPlayer * state.players.length;
  const axes = state.settings.profileAxes;
  const trueProfiles = state.trueProfiles ?? {};

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

        <section className="card">
          <h2>True profiles</h2>
          <p className="muted small">
            Each player's hidden profile is now revealed.
          </p>
          <ul className="profiles">
            {state.players.map((p) => {
              const truth = trueProfiles[p.id];
              return (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  <ul className="profile-axes">
                    {axes.map((a, i) => (
                      <li key={i}>
                        <span className="muted small">
                          {a.left} ↔ {a.right}
                        </span>
                        <strong>{truth?.[i] ?? "?"}</strong>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>

        <NationsPanel state={state} />

        <p className="muted center">
          Your final score: <strong className="fg">{me?.score ?? 0}</strong>
        </p>
      </main>
    </div>
  );
}
