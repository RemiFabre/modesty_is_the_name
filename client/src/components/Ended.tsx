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
          <h2>True profiles & public-figure accuracy</h2>
          <p className="muted small">
            Each player got +{state.settings.publicAccuracyBonus} for every axis where the table's rounded read matched their true value.
          </p>
          <ul className="profiles">
            {state.players.map((p) => {
              const truth = trueProfiles[p.id];
              const acc = state.accuracy?.find((a) => a.playerId === p.id);
              return (
                <li key={p.id}>
                  <div className="profile-head">
                    <strong>{p.name}</strong>
                    {acc && (
                      <span className="muted small">
                        +{acc.bonus} bonus
                      </span>
                    )}
                  </div>
                  <ul className="profile-axes">
                    {axes.map((a, i) => {
                      const t = truth?.[i];
                      const r = acc?.roundedPublic[i] ?? null;
                      const match = acc?.matches[i] ?? false;
                      return (
                        <li
                          key={i}
                          className={match ? "axis-hit" : "axis-miss"}
                        >
                          <span className="muted small">
                            {a.left} ↔ {a.right}
                          </span>
                          <span className="profile-axis-numbers">
                            <span className="profile-axis-truth">
                              true: <strong>{t ?? "?"}</strong>
                            </span>
                            <span className="profile-axis-pub">
                              public: <strong>{r ?? "—"}</strong>
                            </span>
                            <span className="axis-mark">
                              {match ? "✓" : "✗"}
                            </span>
                          </span>
                        </li>
                      );
                    })}
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
