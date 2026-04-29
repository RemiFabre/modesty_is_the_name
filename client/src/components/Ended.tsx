import type {
  PublicClueHistory,
  PublicPlayer,
  PublicState,
} from "../../../shared/types";

export function Ended({ state }: { state: PublicState }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const winner =
    state.players.find((p) => p.id === state.winnerId) ?? ranked[0] ?? null;
  const target = state.settings.pointsPerPlayer * state.players.length;

  return (
    <div className="app">
      <header className="header">
        <h1>Game over</h1>
        <p className="tagline">
          Target was {target} points · {state.players.length} player
          {state.players.length === 1 ? "" : "s"}
        </p>
      </header>
      <main className="main">
        {winner && (
          <section className="card winner-card">
            <div className="winner-trophy">🏆</div>
            <div className="winner-body">
              <p className="winner-label">Winner</p>
              <h2 className="winner-name">{winner.name}</h2>
              <p className="winner-score">{winner.score} points</p>
            </div>
          </section>
        )}

        <section className="card subtle">
          <h2>How scoring works</h2>
          <p className="muted small">
            Each round, every correctly-guessed word scores symmetrically: the
            guesser <strong>and</strong> the clue-giver each get the same
            points. Misses (under symmetric / generous scoring) hit both sides
            too. Your total below splits that into two halves: points you
            earned by reading others, and points others earned you by reading
            your clues.
          </p>
        </section>

        {ranked.map((p, i) => (
          <PlayerScorecard
            key={p.id}
            player={p}
            rank={i + 1}
            isWinner={p.id === state.winnerId}
            isMe={p.id === state.myPlayerId}
            history={state.clueHistories?.find((h) => h.playerId === p.id)}
          />
        ))}
      </main>
    </div>
  );
}

function PlayerScorecard({
  player,
  rank,
  isWinner,
  isMe,
  history,
}: {
  player: PublicPlayer;
  rank: number;
  isWinner: boolean;
  isMe: boolean;
  history?: PublicClueHistory;
}) {
  const b = player.breakdown;
  return (
    <section
      className={
        "card scorecard" +
        (isWinner ? " scorecard-winner" : "") +
        (isMe ? " scorecard-me" : "")
      }
    >
      <header className="scorecard-head">
        <span className="scorecard-rank">#{rank}</span>
        <span className="scorecard-name">{player.name}</span>
        {isMe && <span className="badge">you</span>}
        {isWinner && <span className="badge host">winner</span>}
        <span className="scorecard-total">{player.score}</span>
      </header>

      <ul className="breakdown">
        <BreakdownRow
          label="Words you guessed correctly (your reads)"
          icon="🎯"
          points={b.wordGuesser}
        />
        <BreakdownRow
          label="Words others got from you (your clues landed)"
          icon="📣"
          points={b.wordTarget}
        />
      </ul>

      {history && history.clueHistory.length > 0 && (
        <blockquote className="clue-quote">
          {history.clueHistory.map((c, i) => (
            <span key={i} className="quoted-word">
              {c}
              {i < history.clueHistory.length - 1 && (
                <span className="quote-sep"> · </span>
              )}
            </span>
          ))}
        </blockquote>
      )}
    </section>
  );
}

function BreakdownRow({
  label,
  icon,
  points,
}: {
  label: string;
  icon: string;
  points: number;
}) {
  return (
    <li className="breakdown-row">
      <span className="breakdown-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="breakdown-label">{label}</span>
      <span
        className={
          "breakdown-points " +
          (points > 0 ? "good" : points < 0 ? "bad" : "muted")
        }
      >
        {points >= 0 ? `+${points}` : `${points}`}
      </span>
    </li>
  );
}
